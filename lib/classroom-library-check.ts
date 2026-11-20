import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { MIN_LESSON_RECORDING_MINUTES } from '@/lib/zoom-recordings'
import { isoToStudioWallClock, shiftDateStr, STUDIO_TZ } from '@/lib/studio-timezone'
import { AUTO_LOG_MIN_MINUTES, LESSON_KIND, matchLesson, MIN_BYTES_WITHOUT_START, UUID_RE, type LessonRow } from '@/lib/classroom-recordings'
import { COPIES_TABLE } from '@/lib/classroom-dropbox-copies'
import { liveR2, r2KeyFromUrl, RECORDINGS_BUCKET, type R2Api, type R2Object } from '@/lib/classroom-r2'

/**
 * Weekly: classroom storage against the recordings library (Lionel's #1018).
 *
 * The classroom saves each lesson video to R2 and then adds a row to
 * classroom_recordings; the portal only ever sees the row. When the row never
 * came (the Jul 2 lesson: the file was in R2, the hand-off was lost, and nobody
 * noticed for months), the video was invisible. Once a week this lists the
 * recordings bucket and, for every lesson-length video with no library row:
 *
 *   - adds the row (dated when the file was saved), so it shows in the admin
 *     Classroom recordings tab and is copied to the student's Dropbox folder;
 *   - puts it on its lesson, matched the way the hand-off matches (the slot the
 *     recording started in), but only when that lesson has no video yet. That
 *     sets video_url only: it never logs the lesson, takes a credit or emails
 *     the family (attaching first means the 30-minute hand-off sees it as done
 *     and does not log it either).
 *
 * Lesson-length: a classroom (egress) file whose name carries its start time
 * and ran 20 minutes or more; an older file without a start time counts when it
 * is 100 MB or more, as the hand-off judges those. Under 5 minutes is a no-show,
 * ignored everywhere. Piano-camera files, guests and tests are left alone.
 *
 * It also lists library rows whose R2 file is gone (a broken Play button).
 * It emails the studio inbox only when it found something; nothing goes to
 * families.
 */

export const LIBRARY_CHECK_JOB = 'classroom-library-check'
const MINUTE = 60_000

// `<student>_<13 digits>.mp4` (egress, stamp = start) or the old in-browser
// recorder's `<student>_<13 digits>[_partN].webm|mp4` (stamp = upload time).
const FILE_RE = /^([^/]+?)_(\d{13})(_part\d+)?\.(mp4|webm)$/i

export type FoundFile = {
    key: string
    studentId: string
    bytes: number
    /** When the file was saved (R2), ISO. */
    savedAt: string
    /** Recording start, when the name carries it. */
    startedAt: string | null
    minutes: number | null
}

export type LibraryCheckResult = {
    dryRun: boolean
    /** Video files in the bucket. */
    scanned: number
    /** Lesson-length videos that were not in the library, now added (dry run: would add). */
    added: (FoundFile & { lesson: { id: string; date: string; time: string; attached: boolean; note: string } | null })[]
    /** Not added: too short, too small, not a student. */
    ignored: { key: string; reason: string }[]
    /** Library rows (still on R2) whose file is not in the bucket. */
    missingFiles: { recordingId: string; studentId: string; key: string; createdAt: string }[]
    emailed: boolean
}

export type LibraryCheckOptions = {
    client?: DbClient
    r2?: R2Api
    bucket?: string
    dryRun?: boolean
    now?: Date
    log?: (msg: string) => void
    /** Sends the studio email; true when sent. Default sendCronAlert to the studio inbox. */
    alert?: (email: { subject: string; lines: string[]; footer: string }) => Promise<boolean>
}

/** The parts of a classroom lesson file name, or null for anything else (piano camera, site videos, manifests). */
export function parseLessonFile(obj: R2Object): FoundFile | null {
    if (/_piano-/i.test(obj.key)) return null
    const m = FILE_RE.exec(obj.key)
    if (!m) return null
    const stamped = !m[3] && m[4].toLowerCase() === 'mp4'
    const savedMs = Date.parse(obj.lastModified)
    const startMs = stamped ? Number(m[2]) : null
    const minutes = startMs !== null && savedMs > startMs ? (savedMs - startMs) / MINUTE : null
    return {
        key: obj.key,
        studentId: m[1],
        bytes: obj.size,
        savedAt: new Date(savedMs).toISOString(),
        startedAt: startMs !== null ? new Date(startMs).toISOString() : null,
        minutes,
    }
}

/** Why this file is not a lesson video to add, or null when it is. */
export function notLessonLength(f: FoundFile): string | null {
    if (f.minutes !== null) {
        if (f.minutes < MIN_LESSON_RECORDING_MINUTES) return `no-show, under ${MIN_LESSON_RECORDING_MINUTES} min`
        if (f.minutes < AUTO_LOG_MIN_MINUTES) return `${Math.round(f.minutes)} min, under ${AUTO_LOG_MIN_MINUTES}`
        return null
    }
    return f.bytes >= MIN_BYTES_WITHOUT_START ? null : `no start time and only ${Math.round(f.bytes / 1e6)} MB`
}

/** "Lesson - 7/2/2026", the classroom's own title shape. */
function lessonTitle(ms: number): string {
    return `Lesson - ${new Date(ms).toLocaleDateString('en-US', { timeZone: STUDIO_TZ })}`
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: STUDIO_TZ })
}

/** The public link base of the recordings bucket ("https://pub-....r2.dev"), from links already on file. */
async function publicBase(supabase: DbClient): Promise<string | null> {
    const fromEnv = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.CLASSROOM_R2_PUBLIC_URL
    if (fromEnv) return fromEnv.replace(/\/+$/, '')
    for (const table of [COPIES_TABLE, 'classroom_recordings']) {
        const { data } = await supabase.from(table).select('url').ilike('url', '%r2.dev/%').limit(1)
        const url = data?.[0]?.url as string | undefined
        if (url) return new URL(url).origin
    }
    return null
}

export async function checkClassroomLibrary(opts: LibraryCheckOptions = {}): Promise<LibraryCheckResult> {
    const supabase = opts.client ?? createAdminClient()
    const r2 = opts.r2 ?? liveR2
    const bucket = opts.bucket ?? RECORDINGS_BUCKET
    const log = opts.log ?? (() => {})
    const now = opts.now ?? new Date()
    const dryRun = !!opts.dryRun
    const result: LibraryCheckResult = { dryRun, scanned: 0, added: [], ignored: [], missingFiles: [], emailed: false }

    const objects = await r2.listObjects(bucket)
    const inBucket = new Set(objects.map(o => o.key))

    const { data: recRows, error: recError } = await supabase
        .from('classroom_recordings')
        .select('id, student_id, url, created_at, r2_key, moved_to_dropbox_at')
    if (recError) throw new Error(`classroom_recordings query failed: ${recError.message}`)
    const known = new Set<string>()
    for (const r of recRows || []) {
        const key = r.r2_key || r2KeyFromUrl(r.url)
        if (key) known.add(key)
        // Still on R2 but the file is gone: the Play button is broken.
        const onR2 = !r.moved_to_dropbox_at && r2KeyFromUrl(r.url)
        if (onR2 && !inBucket.has(onR2)) {
            result.missingFiles.push({ recordingId: r.id, studentId: r.student_id, key: onR2, createdAt: r.created_at })
        }
    }

    const found = objects.map(parseLessonFile).filter((f): f is FoundFile => !!f)
    result.scanned = found.length
    const fresh = found.filter(f => !known.has(f.key))

    const studentIds = [...new Set(fresh.map(f => f.studentId).filter(id => UUID_RE.test(id)))]
    const students = new Map<string, { name: string; folder: string | null }>()
    if (studentIds.length > 0) {
        const { data, error } = await supabase.from('profiles').select('id, name, role, dropbox_recording_folder').in('id', studentIds)
        if (error) throw new Error(`profiles query failed: ${error.message}`)
        for (const p of data || []) if (p.role === 'student') students.set(p.id, { name: p.name || 'a student', folder: p.dropbox_recording_folder })
    }

    const base = fresh.length > 0 ? await publicBase(supabase) : null
    for (const f of fresh) {
        if (!students.has(f.studentId)) { result.ignored.push({ key: f.key, reason: 'not a student (guest or test)' }); continue }
        const why = notLessonLength(f)
        if (why) { result.ignored.push({ key: f.key, reason: why }); continue }
        if (!base) throw new Error('could not tell the recordings bucket\'s public address (no R2 link on file)')

        const url = `${base}/${f.key.split('/').map(encodeURIComponent).join('/')}`
        const rec = { url, created_at: f.savedAt }
        const anchor = isoToStudioWallClock(f.startedAt ?? f.savedAt).localDate
        const { data: lessons, error: lessonError } = await supabase
            .from('lessons')
            .select('id, date, time, duration, status, video_url')
            .eq('student_id', f.studentId)
            .gte('date', shiftDateStr(anchor, -1))
            .lte('date', shiftDateStr(anchor, 1))
        if (lessonError) throw new Error(`lessons query failed: ${lessonError.message}`)
        const lesson = matchLesson(rec, (lessons || []) as LessonRow[])

        let lessonInfo: LibraryCheckResult['added'][number]['lesson'] = null
        if (lesson) {
            const time = String(lesson.time).slice(0, 5)
            if (lesson.video_url === url) {
                lessonInfo = { id: lesson.id, date: lesson.date, time, attached: false, note: 'already on this lesson' }
            } else if (lesson.video_url) {
                lessonInfo = { id: lesson.id, date: lesson.date, time, attached: false, note: 'the lesson already has another video' }
            } else if (dryRun) {
                lessonInfo = { id: lesson.id, date: lesson.date, time, attached: true, note: 'would put it on this lesson' }
            } else {
                // Attach before adding the row: the 30-minute hand-off then sees it as done and never logs it.
                const { data: updated, error } = await supabase
                    .from('lessons').update({ video_url: url }).eq('id', lesson.id).is('video_url', null).select('id')
                if (error) throw new Error(`lesson update failed: ${error.message}`)
                const attached = !!updated && updated.length > 0
                lessonInfo = { id: lesson.id, date: lesson.date, time, attached, note: attached ? 'put on this lesson (video only, not logged)' : 'the lesson got a video meanwhile' }
            }
        }

        if (!dryRun) {
            const { error } = await supabase.from('classroom_recordings').insert({
                student_id: f.studentId,
                teacher_id: 'teacher-1',
                filename: lessonTitle(Date.parse(f.startedAt ?? f.savedAt)),
                url,
                size_bytes: f.bytes,
                created_at: f.savedAt,
                kind: LESSON_KIND,
            })
            // 23505: the classroom added it meanwhile.
            if (error && error.code !== '23505') throw new Error(`classroom_recordings insert failed: ${error.message}`)
            // Queue its Dropbox copy right away (the copy job only queues the last 14 days by itself).
            if (!error && students.get(f.studentId)?.folder) {
                const { data: row } = await supabase.from('classroom_recordings').select('id').eq('url', url).maybeSingle()
                if (row?.id) {
                    const { error: qError } = await supabase.from(COPIES_TABLE).insert({ recording_id: row.id, url, student_id: f.studentId, status: 'pending' })
                    if (qError && qError.code !== '23505') log(`could not queue the Dropbox copy of ${f.key}: ${qError.message}`)
                }
            }
        }
        result.added.push({ ...f, lesson: lessonInfo })
        log(`${dryRun ? '[dry run] would add' : 'added'} ${f.key} (${f.minutes === null ? 'length unknown' : `${Math.round(f.minutes)} min`}, ${Math.round(f.bytes / 1e6)} MB)`
            + (lessonInfo ? `; lesson ${lessonInfo.date} ${lessonInfo.time}: ${lessonInfo.note}` : '; no lesson at that time'))
    }

    if (!dryRun && (result.added.length > 0 || result.missingFiles.length > 0)) {
        const nameOf = async (id: string) => {
            if (students.has(id)) return students.get(id)!.name
            const { data } = await supabase.from('profiles').select('name').eq('id', id).maybeSingle()
            return (data?.name as string) || 'a student'
        }
        const lines: string[] = []
        for (const a of result.added) {
            const length = a.minutes === null ? `${Math.round(a.bytes / 1e6)} MB, no start time` : `${Math.round(a.minutes)} min`
            const where = a.lesson ? `lesson of ${a.lesson.date} ${a.lesson.time}: ${a.lesson.note}` : 'no lesson at that time; attach it by hand if it belongs to one'
            lines.push(`Added: ${escapeHtml(await nameOf(a.studentId))}, recorded ${escapeHtml(dayLabel(a.startedAt ?? a.savedAt))} (${length}). ${escapeHtml(where)}.`)
        }
        for (const m of result.missingFiles) {
            lines.push(`File gone from R2: ${escapeHtml(await nameOf(m.studentId))}, recording of ${escapeHtml(dayLabel(m.createdAt))} (${escapeHtml(m.key)}). Its Play button cannot work.`)
        }
        const n = result.added.length
        const subject = n > 0
            ? `${n} classroom video${n === 1 ? '' : 's'} found outside the recordings library`
            : `${result.missingFiles.length} classroom recording${result.missingFiles.length === 1 ? '' : 's'} missing from R2`
        const alert = opts.alert ?? ((email) => sendCronAlert(supabase, email))
        try {
            result.emailed = await alert({
                subject,
                lines,
                footer: 'Sent by the weekly classroom library check (/api/cron/classroom-library-check). Added videos show in admin, '
                    + 'Classroom recordings, and are copied to the student\'s Dropbox folder. A lesson only gets the video when it had none; '
                    + 'nothing was logged and no family was emailed. It emails only when it finds something.',
            })
        } catch (err) {
            log(`email failed: ${err instanceof Error ? err.message : String(err)}`)
        }
    }

    return result
}
