import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { MIN_LESSON_RECORDING_MINUTES } from '@/lib/zoom-recordings'
import { isoToStudioWallClock, shiftDateStr, studioWallClockToISO } from '@/lib/studio-timezone'
import { notifyRecordingReady } from '@/lib/recording-ready-email'
import { autoLogClassroomLesson, studioAdminId } from '@/lib/classroom-auto-log'
import { liveR2, r2KeyFromUrl, RECORDINGS_BUCKET, type R2Api } from '@/lib/classroom-r2'
import { isR2VideoUrl } from '@/lib/classroom-video-url'

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
 * Attaching writes only `video_url`. Since 2026-11-18 (Lionel's #537) the
 * automatic hand-off also LOGS the lesson, the same logging he does by hand
 * (logLessonCore: one credit, next week booked, lesson email), but only when
 * all of these hold, so nothing can be charged twice or charged by a backfill:
 *   - the recording carries a start stamp and ran 20 minutes or more;
 *   - the lesson is still 'scheduled' (re-read right before logging), so a
 *     lesson already logged by Zoom or by hand is never touched;
 *   - the lesson started within the last 7 days.
 * Attaching a recording by hand (the admin page) never logs. Since #795 a
 * lesson can also be logged by classroom attendance (lib/classroom-attendance.ts);
 * both go through lib/classroom-auto-log.ts, which logs each lesson once,
 * whichever gets there first.
 */

// LiveKit egress (the classroom's recorder since 2026-07-02) names the file when
// recording STARTS: `<student>_<13-digit ms>.mp4`. The older in-browser recorders
// (`..._partN.mp4`, `.webm`) stamped the name at upload, i.e. when it stopped, so
// their stamp is not a start time and they are matched by save time instead.
const START_MS_RE = /_(\d{13})\.mp4$/i
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// classroom_recordings.kind: 'lesson' is the two-camera lesson video; 'piano' is
// the teacher's piano camera alone, no sound (#792), kept in the classroom
// library next to it. Only lesson videos go on a lesson, log it, or go to Dropbox.
export const LESSON_KIND = 'lesson'
const MINUTE = 60_000

// A recording may start a little before the slot (teacher gets set up) and any
// time during it (the lesson moved over from Zoom part way in).
const EARLY_START_MS = 30 * MINUTE
const LATE_START_MS = 10 * MINUTE
// Without a start stamp only the save time (= when recording stopped) is known.
const LATE_STOP_MS = 90 * MINUTE
// Rows without a start stamp are judged by size instead of length. Classroom
// recordings run ~23 MB a minute, so this is roughly 4-5 minutes.
export const MIN_BYTES_WITHOUT_START = 100 * 1024 * 1024
// Only email "your recording is ready" for lessons from the last two days, so a
// sweep that catches up on old recordings never emails about them.
const NOTIFY_WITHIN_MS = 48 * 60 * MINUTE
// Auto-logging: a classroom video this long is a lesson that happened.
export const AUTO_LOG_MIN_MINUTES = 20
// Never auto-log an old lesson: a sweep catching up on old recordings must not
// suddenly charge credits for lessons long past.
const AUTO_LOG_WITHIN_MS = 7 * 24 * 60 * MINUTE

export type ClassroomAttachResult = {
    scanned: number
    attached: { recordingId: string; lessonId: string; date: string; time: string; emailed: boolean }[]
    skipped: { recordingId: string; reason: string }[]
    /** Lessons logged (or, in a dry run, that would be logged) because their classroom video is 20+ minutes. */
    logged: { recordingId: string; lessonId: string; date: string; time: string; minutes: number; creditDeducted: boolean }[]
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

type RecordingRow = { id: string; student_id: string; url: string; created_at: string; size_bytes: number | null; r2_key?: string | null }
/** A recording as the matchers read it: r2_key is the R2 file name kept after the video moved to Dropbox (#1020). */
type StampedRecording = { url: string; created_at: string; r2_key?: string | null }
export type LessonRow = { id: string; date: string; time: string; duration: number | null; status: string | null; video_url: string | null }

export function recordingStartMs(url: string): number | null {
    const m = url.match(START_MS_RE)
    return m ? Number(m[1]) : null
}

/**
 * The recording's start stamp: from its R2 file name, which a video moved to
 * Dropbox (#1020) keeps in r2_key once its url is a Dropbox link.
 */
export function recordingStampMs(rec: { url: string; r2_key?: string | null }): number | null {
    return recordingStartMs(rec.r2_key || rec.url)
}

/** Stop minus start, in minutes; null without a start stamp (length unknown). */
export function recordingMinutes(rec: StampedRecording): number | null {
    const startMs = recordingStampMs(rec)
    const stopMs = Date.parse(rec.created_at)
    if (startMs === null || !(stopMs > startMs)) return null
    return (stopMs - startMs) / MINUTE
}

/** Why the hand-off would NOT log this lesson, or null when it should. */
function autoLogBlockReason(lesson: LessonRow, minutes: number | null, now: Date): string | null {
    if (minutes === null) return 'no start stamp, length unknown'
    if (minutes < AUTO_LOG_MIN_MINUTES) return `video is ${Math.round(minutes)} min, under ${AUTO_LOG_MIN_MINUTES}`
    return lessonAutoLogBlock(lesson, now)
}

/** Shared by the video and attendance auto-logs: only an unlogged lesson from the last 7 days. */
export function lessonAutoLogBlock(lesson: { status: string | null; date: string; time: string }, now: Date): string | null {
    if (lesson.status !== 'scheduled') return `lesson is already ${lesson.status}`
    if (now.getTime() - lessonStartMs(lesson) > AUTO_LOG_WITHIN_MS) return 'lesson is more than 7 days old'
    return null
}

export function lessonStartMs(lesson: { date: string; time: string }): number {
    return Date.parse(studioWallClockToISO(lesson.date, String(lesson.time).slice(0, 5)))
}

/**
 * The lesson a recording belongs to: the student's lesson whose slot contains
 * the recording's start (or, without a start stamp, whose slot it stopped
 * shortly after), closest start first. Null when no lesson fits.
 */
export function matchLesson(
    rec: StampedRecording,
    lessons: LessonRow[]
): LessonRow | null {
    const startMs = recordingStampMs(rec)
    return startMs !== null
        ? matchLessonByStart(startMs, lessons)
        : bestLesson(Date.parse(rec.created_at), lessons, (stopMs, begins, ends) => stopMs >= begins && stopMs <= ends + LATE_STOP_MS)
}

/**
 * The lesson whose slot holds this start time (a little before the slot or any
 * time during it), closest start first. Also used for classroom attendance
 * (#795): the moment teacher and student are first in the room together.
 */
export function matchLessonByStart<L extends LessonRow>(startMs: number, lessons: L[]): L | null {
    return bestLesson(startMs, lessons, (at, begins, ends) => at >= begins - EARLY_START_MS && at <= ends + LATE_START_MS)
}

function bestLesson<L extends LessonRow>(
    anchor: number,
    lessons: L[],
    fitsSlot: (anchor: number, begins: number, ends: number) => boolean,
): L | null {
    let best: { lesson: L; distance: number } | null = null
    for (const lesson of lessons) {
        if (lesson.status === 'cancelled') continue
        const begins = lessonStartMs(lesson)
        const ends = begins + (lesson.duration || 60) * MINUTE
        if (!fitsSlot(anchor, begins, ends)) continue
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
    const result: ClassroomAttachResult = { scanned: 0, attached: [], skipped: [], logged: [] }
    let adminId: string | null | undefined

    let query = supabase
        .from('classroom_recordings')
        .select('id, student_id, url, created_at, size_bytes, r2_key')
        .eq('kind', LESSON_KIND)
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

        const startMs = recordingStampMs(rec)
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
        const minutes = recordingMinutes(rec)
        const logBlock = autoLogBlockReason(lesson, minutes, now)
        if (opts.dryRun) {
            result.attached.push({ recordingId: rec.id, lessonId: lesson.id, date: lesson.date, time: lesson.time, emailed: false })
            log(`[dry run] would attach ${rec.id} to lesson ${lesson.id} (${lesson.date} ${lesson.time})`)
            if (logBlock) {
                log(`[dry run] would not log lesson ${lesson.id}: ${logBlock}`)
            } else {
                result.logged.push({ recordingId: rec.id, lessonId: lesson.id, date: lesson.date, time: lesson.time, minutes: Math.round(minutes!), creditDeducted: false })
                log(`[dry run] would LOG lesson ${lesson.id} (${Math.round(minutes!)} min classroom video)`)
            }
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

        if (logBlock) {
            log(`not logging lesson ${lesson.id}: ${logBlock}`)
            continue
        }
        const logged = await autoLogClassroomLesson(supabase, lesson, {
            source: 'classroom_video',
            minutes: minutes!,
            log,
            getAdminId: async () => {
                if (adminId === undefined) adminId = await studioAdminId(supabase)
                return adminId
            },
        })
        if (logged) {
            result.logged.push({ recordingId: rec.id, lessonId: lesson.id, date: lesson.date, time: lesson.time, minutes: Math.round(minutes!), creditDeducted: logged.creditDeducted })
        }
    }

    return result
}

// ---------------------------------------------------------------------------
// Admin page: every classroom recording, newest first, with where it went.

type LessonRef = { lessonId: string; date: string; time: string }

export type AdminRecordingStatus =
    | ({ kind: 'attached' } & LessonRef)
    | { kind: 'too_short' }
    /** A lesson fits but the hand-off hasn't attached it (file not ready yet, or an old file judged too small). */
    | ({ kind: 'not_attached_yet' } & LessonRef)
    /** A lesson fits but already has a different video. */
    | ({ kind: 'lesson_has_other_video' } & LessonRef)
    /** No lesson at that time; `nearest` is the closest of the student's lessons without a video (within a week). */
    | { kind: 'no_lesson'; nearest: LessonRef | null }

export type AdminRecordingRow = {
    id: string
    studentId: string
    studentName: string | null
    url: string
    /** When recording started (egress stamp), else when it stopped. */
    recordedAt: string
    hasStartStamp: boolean
    /** Stop minus start; null without a start stamp. */
    minutes: number | null
    status: AdminRecordingStatus
    /** A test or no-show (under 5 minutes, on no lesson, still on R2): the tab offers Delete (#1096). */
    canDelete: boolean
}

const NEAREST_WITHIN_DAYS = 7

function lessonRef(lesson: { id: string; date: string; time: string }): LessonRef {
    return { lessonId: lesson.id, date: lesson.date, time: String(lesson.time).slice(0, 5) }
}

export async function listClassroomRecordingsForAdmin(client?: DbClient, limit = 300): Promise<AdminRecordingRow[]> {
    const supabase = client ?? createAdminClient()

    const { data: rows, error } = await supabase
        .from('classroom_recordings')
        .select('id, student_id, url, created_at, size_bytes, r2_key')
        .eq('kind', LESSON_KIND)
        .order('created_at', { ascending: false })
        .limit(limit)
    if (error) throw new Error(`classroom_recordings query failed: ${error.message}`)
    const recordings = ((rows || []) as RecordingRow[]).filter(r => r.url)
    if (recordings.length === 0) return []

    // A recording "went on" a lesson when that lesson's video_url is its url.
    const { data: onLessons, error: onError } = await supabase
        .from('lessons')
        .select('id, date, time, video_url')
        .in('video_url', recordings.map(r => r.url))
    if (onError) throw new Error(`lessons lookup failed: ${onError.message}`)
    const lessonByUrl = new Map<string, { id: string; date: string; time: string }>()
    for (const l of onLessons || []) if (!lessonByUrl.has(l.video_url)) lessonByUrl.set(l.video_url, l)

    const studentIds = [...new Set(recordings.map(r => r.student_id).filter(id => UUID_RE.test(id || '')))]
    const names = new Map<string, string | null>()
    if (studentIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', studentIds)
        for (const p of profiles || []) names.set(p.id, p.name)
    }

    return Promise.all(recordings.map(async (rec): Promise<AdminRecordingRow> => {
        const startMs = recordingStampMs(rec)
        const anchorMs = startMs ?? Date.parse(rec.created_at)
        const minutes = recordingMinutes(rec)
        const base = {
            id: rec.id,
            studentId: rec.student_id,
            studentName: names.get(rec.student_id) ?? null,
            url: rec.url,
            recordedAt: new Date(anchorMs).toISOString(),
            hasStartStamp: startMs !== null,
            minutes,
            canDelete: false,
        }

        const on = lessonByUrl.get(rec.url)
        if (on) return { ...base, status: { kind: 'attached', ...lessonRef(on) } }
        if (minutes !== null && minutes < MIN_LESSON_RECORDING_MINUTES) {
            return { ...base, status: { kind: 'too_short' }, canDelete: isR2VideoUrl(rec.url) }
        }
        if (!UUID_RE.test(rec.student_id || '')) return { ...base, status: { kind: 'no_lesson', nearest: null } }

        const anchorDate = isoToStudioWallClock(new Date(anchorMs).toISOString()).localDate
        const { data: lessons } = await supabase
            .from('lessons')
            .select('id, date, time, duration, status, video_url')
            .eq('student_id', rec.student_id)
            .gte('date', shiftDateStr(anchorDate, -NEAREST_WITHIN_DAYS))
            .lte('date', shiftDateStr(anchorDate, NEAREST_WITHIN_DAYS))
        const candidates = ((lessons || []) as LessonRow[]).filter(l => l.status !== 'cancelled')

        const match = matchLesson(rec, candidates)
        if (match) {
            return { ...base, status: { kind: match.video_url ? 'lesson_has_other_video' : 'not_attached_yet', ...lessonRef(match) } }
        }

        let nearest: LessonRow | null = null
        for (const l of candidates) {
            if (l.video_url) continue
            if (!nearest || Math.abs(lessonStartMs(l) - anchorMs) < Math.abs(lessonStartMs(nearest) - anchorMs)) nearest = l
        }
        return { ...base, status: { kind: 'no_lesson', nearest: nearest ? lessonRef(nearest) : null } }
    }))
}

/**
 * Admin one-click attach: put a recording on a lesson. Sets that lesson's
 * video_url only, and only when it has none: no logging, no credits, no email.
 */
export async function attachRecordingToLessonByHand(
    recordingId: string,
    lessonId: string,
    client?: DbClient,
): Promise<{ success: true; date: string; time: string } | { error: string }> {
    const supabase = client ?? createAdminClient()

    const { data: rec } = await supabase
        .from('classroom_recordings')
        .select('id, student_id, url')
        .eq('id', recordingId)
        .maybeSingle()
    if (!rec?.url) return { error: 'Recording not found' }

    const { data: lesson } = await supabase
        .from('lessons')
        .select('id, student_id, date, time, video_url')
        .eq('id', lessonId)
        .maybeSingle()
    if (!lesson) return { error: 'Lesson not found' }
    if (lesson.student_id !== rec.student_id) return { error: "That lesson is another student's" }

    const { data: elsewhere } = await supabase.from('lessons').select('date').eq('video_url', rec.url).limit(1)
    if (elsewhere && elsewhere.length > 0) return { error: `This recording is already on the lesson of ${elsewhere[0].date}` }

    const { data: updated, error } = await supabase
        .from('lessons')
        .update({ video_url: rec.url })
        .eq('id', lessonId)
        .is('video_url', null)
        .select('id')
    if (error) return { error: `Could not attach: ${error.message}` }
    if (!updated || updated.length === 0) return { error: 'That lesson already has a video' }
    return { success: true, date: lesson.date, time: String(lesson.time).slice(0, 5) }
}

/**
 * Admin one-tap Delete (#1096), for test and no-show recordings only: under 5
 * minutes by the start time in its file name, on no lesson, still on R2. Deletes
 * the R2 file and then the library row (its Dropbox copy row goes with it), and
 * a piano-camera file saved with it the same way. Anything else is refused
 * before a byte is touched, so a lesson video can never be deleted here.
 */
export async function deleteNoShowRecording(
    recordingId: string,
    opts: { client?: DbClient; r2?: R2Api; bucket?: string } = {},
): Promise<{ success: true; files: number } | { error: string }> {
    const supabase = opts.client ?? createAdminClient()
    const r2 = opts.r2 ?? liveR2
    const bucket = opts.bucket ?? RECORDINGS_BUCKET

    const { data: rec } = await supabase
        .from('classroom_recordings')
        .select('id, student_id, url, created_at, kind, r2_key')
        .eq('id', recordingId)
        .maybeSingle()
    if (!rec?.url) return { error: 'Recording not found' }
    if ((rec.kind || LESSON_KIND) !== LESSON_KIND) return { error: 'Only lesson recordings can be deleted here' }
    const minutes = recordingMinutes(rec)
    if (minutes === null) return { error: 'Its length is unknown (no start time), so it is kept' }
    if (minutes >= MIN_LESSON_RECORDING_MINUTES) return { error: `It is ${Math.round(minutes)} minutes long; only recordings under ${MIN_LESSON_RECORDING_MINUTES} minutes can be deleted` }
    const key = isR2VideoUrl(rec.url) ? r2KeyFromUrl(rec.url) : null
    if (!key) return { error: 'It is not on R2 (moved to Dropbox), so it is kept' }
    const { data: on, error: onError } = await supabase.from('lessons').select('id').eq('video_url', rec.url).limit(1)
    if (onError) return { error: `Could not check its lessons: ${onError.message}` }
    if (on && on.length > 0) return { error: 'It is on a lesson, so it is kept' }

    // The piano-camera file recorded alongside it, if any.
    const { data: piano } = await supabase.from('classroom_recordings').select('id, url').eq('lesson_recording_url', rec.url)
    const targets = [{ id: rec.id as string, key }, ...(piano || []).map(p => ({ id: p.id as string, key: r2KeyFromUrl(p.url as string) }))]

    let files = 0
    for (const t of targets) {
        try {
            if (t.key) {
                await r2.deleteObject(bucket, t.key)
                files++
            }
        } catch (err) {
            return { error: `Could not delete the file: ${err instanceof Error ? err.message : String(err)}` }
        }
        const { error } = await supabase.from('classroom_recordings').delete().eq('id', t.id)
        if (error) return { error: `File deleted, but the row could not be: ${error.message}` }
    }
    return { success: true, files }
}
