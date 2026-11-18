import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { MIN_LESSON_RECORDING_MINUTES } from '@/lib/zoom-recordings'
import { isoToStudioWallClock, shiftDateStr, studioWallClockToISO } from '@/lib/studio-timezone'
import { notifyRecordingReady } from '@/lib/recording-ready-email'

/**
 * Hand-off from the classroom app (classroom.musicalbasics.com, same Supabase
 * project) to the portal: every finished classroom recording is a row in
 * `classroom_recordings`; this attaches each one to the lesson it was recorded
 * in by setting `lessons.video_url`.
 *
 * Why it exists: from spring 2026 the classroom recorded through LiveKit egress,
 * whose stop route saved the row but never called the portal, so no classroom
 * recording reached a lesson for months. And the old webhook attached to the
 * student's NEXT open lesson, which put a video on the wrong week whenever the
 * lesson had already been logged. Matching by the recording's own start time
 * fixes both, and running it from a cron means a missed call can't lose a video.
 *
 * Only `video_url` is written. Attaching a recording never logs a lesson or
 * touches credits (that is the Zoom webhook's job).
 */

// LiveKit egress (the classroom's recorder since 2026-07-02) names the file when
// recording STARTS: `<student>_<13-digit ms>.mp4`. The older in-browser recorders
// (`..._partN.mp4`, `.webm`) stamped the name at upload, i.e. when it stopped, so
// their stamp is not a start time and they are matched by save time instead.
const START_MS_RE = /_(\d{13})\.mp4$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MINUTE = 60_000

// A recording may start a little before the slot (teacher gets set up) and any
// time during it (the lesson moved over from Zoom part way in).
const EARLY_START_MS = 30 * MINUTE
const LATE_START_MS = 10 * MINUTE
// Without a start stamp only the save time (= when recording stopped) is known.
const LATE_STOP_MS = 90 * MINUTE
// Rows without a start stamp are judged by size instead of length. Classroom
// recordings run ~23 MB a minute, so this is roughly 4-5 minutes.
const MIN_BYTES_WITHOUT_START = 100 * 1024 * 1024
// Only email "your recording is ready" for lessons from the last two days, so a
// sweep that catches up on old recordings never emails about them.
const NOTIFY_WITHIN_MS = 48 * 60 * MINUTE

export type ClassroomAttachResult = {
    scanned: number
    attached: { recordingId: string; lessonId: string; date: string; time: string; emailed: boolean }[]
    skipped: { recordingId: string; reason: string }[]
}

export type ClassroomAttachOptions = {
    studentId?: string
    /** How far back to look at recordings, by save time. Default 14 days. */
    days?: number
    /** Report what would be attached without writing anything. */
    dryRun?: boolean
    notify?: boolean
    client?: DbClient
    log?: (msg: string) => void
    now?: Date
}

type RecordingRow = { id: string; student_id: string; url: string; created_at: string; size_bytes: number | null }
type LessonRow = { id: string; date: string; time: string; duration: number | null; status: string | null; video_url: string | null }

export function recordingStartMs(url: string): number | null {
    const m = url.match(START_MS_RE)
    return m ? Number(m[1]) : null
}

function lessonStartMs(lesson: LessonRow): number {
    return Date.parse(studioWallClockToISO(lesson.date, String(lesson.time).slice(0, 5)))
}

/**
 * The lesson a recording belongs to: the student's lesson whose slot contains
 * the recording's start (or, without a start stamp, whose slot it stopped
 * shortly after), closest start first. Null when no lesson fits.
 */
export function matchLesson(
    rec: { url: string; created_at: string },
    lessons: LessonRow[]
): LessonRow | null {
    const startMs = recordingStartMs(rec.url)
    const stopMs = Date.parse(rec.created_at)
    const anchor = startMs ?? stopMs
    let best: { lesson: LessonRow; distance: number } | null = null
    for (const lesson of lessons) {
        if (lesson.status === 'cancelled') continue
        const begins = lessonStartMs(lesson)
        const ends = begins + (lesson.duration || 60) * MINUTE
        const fits = startMs !== null
            ? startMs >= begins - EARLY_START_MS && startMs <= ends + LATE_START_MS
            : stopMs >= begins && stopMs <= ends + LATE_STOP_MS
        if (!fits) continue
        const distance = Math.abs(anchor - begins)
        if (!best || distance < best.distance) best = { lesson, distance }
    }
    return best?.lesson ?? null
}

async function headSize(url: string): Promise<number | null> {
    try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
        if (!res.ok) return null
        const len = Number(res.headers.get('content-length') || 0)
        return len > 0 ? len : null
    } catch {
        return null
    }
}

export async function attachClassroomRecordings(opts: ClassroomAttachOptions = {}): Promise<ClassroomAttachResult> {
    const supabase = opts.client ?? createAdminClient()
    const log = opts.log ?? (() => {})
    const now = opts.now ?? new Date()
    const days = opts.days ?? 14
    const notify = opts.notify ?? true
    const result: ClassroomAttachResult = { scanned: 0, attached: [], skipped: [] }

    let query = supabase
        .from('classroom_recordings')
        .select('id, student_id, url, created_at, size_bytes')
        .gte('created_at', new Date(now.getTime() - days * 24 * 60 * MINUTE).toISOString())
        .order('created_at', { ascending: true })
    if (opts.studentId) query = query.eq('student_id', opts.studentId)
    const { data: rows, error } = await query
    if (error) throw new Error(`classroom_recordings query failed: ${error.message}`)

    const recordings = ((rows || []) as RecordingRow[]).filter(r => r.url && UUID_RE.test(r.student_id || ''))
    result.scanned = recordings.length
    if (recordings.length === 0) return result

    // Recordings already on a lesson are done.
    const { data: attachedRows, error: attachedError } = await supabase
        .from('lessons')
        .select('video_url')
        .in('video_url', recordings.map(r => r.url))
    if (attachedError) throw new Error(`lessons lookup failed: ${attachedError.message}`)
    const alreadyAttached = new Set((attachedRows || []).map(r => r.video_url as string))

    for (const rec of recordings) {
        if (alreadyAttached.has(rec.url)) continue

        const startMs = recordingStartMs(rec.url)
        const stopMs = Date.parse(rec.created_at)
        if (startMs !== null && stopMs > startMs && stopMs - startMs < MIN_LESSON_RECORDING_MINUTES * MINUTE) {
            result.skipped.push({ recordingId: rec.id, reason: `under ${MIN_LESSON_RECORDING_MINUTES} min` })
            continue
        }

        const anchorDate = isoToStudioWallClock(new Date(startMs ?? stopMs).toISOString()).localDate
        const { data: lessons, error: lessonError } = await supabase
            .from('lessons')
            .select('id, date, time, duration, status, video_url')
            .eq('student_id', rec.student_id)
            .gte('date', shiftDateStr(anchorDate, -1))
            .lte('date', shiftDateStr(anchorDate, 1))
        if (lessonError) {
            result.skipped.push({ recordingId: rec.id, reason: `lesson query failed: ${lessonError.message}` })
            continue
        }

        const lesson = matchLesson(rec, (lessons || []) as LessonRow[])
        if (!lesson) {
            result.skipped.push({ recordingId: rec.id, reason: 'no lesson at that time' })
            continue
        }
        if (lesson.video_url) {
            result.skipped.push({ recordingId: rec.id, reason: `lesson ${lesson.id} already has a video` })
            continue
        }

        // The file must be in R2 before a student can play it; LiveKit finishes
        // writing a few seconds after the row is saved. Not there yet = next run.
        const size = await headSize(rec.url)
        if (size === null) {
            result.skipped.push({ recordingId: rec.id, reason: 'file not playable yet' })
            continue
        }
        if (startMs === null && size < MIN_BYTES_WITHOUT_START) {
            result.skipped.push({ recordingId: rec.id, reason: 'too small to be a lesson' })
            continue
        }

        const recent = now.getTime() - lessonStartMs(lesson) < NOTIFY_WITHIN_MS
        if (opts.dryRun) {
            result.attached.push({ recordingId: rec.id, lessonId: lesson.id, date: lesson.date, time: lesson.time, emailed: false })
            log(`[dry run] would attach ${rec.id} to lesson ${lesson.id} (${lesson.date} ${lesson.time})`)
            continue
        }

        const { data: updated, error: updateError } = await supabase
            .from('lessons')
            .update({ video_url: rec.url })
            .eq('id', lesson.id)
            .is('video_url', null)
            .select('id')
        if (updateError) {
            result.skipped.push({ recordingId: rec.id, reason: `update failed: ${updateError.message}` })
            continue
        }
        if (!updated || updated.length === 0) {
            result.skipped.push({ recordingId: rec.id, reason: `lesson ${lesson.id} got a video meanwhile` })
            continue
        }
        alreadyAttached.add(rec.url)

        if (!rec.size_bytes) {
            await supabase.from('classroom_recordings').update({ size_bytes: size }).eq('id', rec.id)
        }

        const emailed = notify && recent
        if (emailed) await notifyRecordingReady(supabase, rec.student_id, lesson.date)
        result.attached.push({ recordingId: rec.id, lessonId: lesson.id, date: lesson.date, time: lesson.time, emailed })
        log(`attached ${rec.id} to lesson ${lesson.id} (${lesson.date} ${lesson.time})${emailed ? ', emailed' : ''}`)
    }

    return result
}
