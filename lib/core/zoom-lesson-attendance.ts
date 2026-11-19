import type { DbClient } from '@/lib/supabase/admin'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { isoToStudioWallClock, shiftDateStr, studioWallClockToISO } from '@/lib/studio-timezone'
import { WINDOW_MS, fetchPastInstances, fetchPastParticipants, type ZoomParticipant } from '@/lib/zoom-attendance'
import { keepParticipant, summarizeAttendance, type AttendanceView } from '@/lib/zoom-lesson-attendance'

/**
 * Saving each Zoom lesson's attendance for good (#965), since Zoom keeps it
 * only about a year. The backfill-recordings cron (every 30 minutes) calls
 * sweepZoomAttendance: each Zoom lesson from the last week that ended 30+
 * minutes ago and has no saved row is read from Zoom and saved in
 * zoom_lesson_attendance. When Zoom does not answer, it is tried again on the
 * next runs, up to MAX_ATTEMPTS, then left. scripts/backfill_zoom_attendance.ts
 * does the same for older lessons, slowly. Teacher accounts are skipped.
 */

export const TABLE = 'zoom_lesson_attendance'
/** Zoom's report is ready a little after the meeting ends. */
export const CHECK_AFTER_MINUTES = 30
export const MAX_ATTEMPTS = 4
/** A retry waits at least this long (the cron runs every 30 minutes). */
export const RETRY_AFTER_MINUTES = 25
/** "Never started" is only final once the lesson is this long over (a late-running meeting may not be listed yet). */
export const NEVER_STARTED_FINAL_AFTER_MINUTES = 180
/** How far back the cron looks for lessons it missed. */
export const LOOKBACK_DAYS = 7

export type AttendanceLesson = {
    id: string
    date: string
    time: string // HH:MM, studio wall clock
    duration: number
    zoomMeetingId: string
}

export type ExistingRow = { lesson_id: string; status: string; attempts: number; fetched_at: string; kind?: string | null }

export type ParticipantsResult =
    | { ok: true; participants: ZoomParticipant[] }
    | { ok: false; neverStarted: boolean; reason: string }

export type FetchParticipants = (lesson: AttendanceLesson) => Promise<ParticipantsResult>

/** A use of the meeting counts as this lesson's when it started this close to it (the host may open it early). */
const INSTANCE_BEFORE_MS = 3 * 60 * 60 * 1000

/**
 * Who joined a lesson's meeting. A meeting link can be used again later (the
 * next week's lesson booked from this one keeps the link), and Zoom's plain
 * report gives only the LATEST use. So: list the meeting's past uses and read
 * the one at the lesson's time; without the Zoom permission for that
 * (meeting:read:list_past_instances:admin), fall back to the latest use, which
 * is this lesson's as long as it is read soon after (as the cron does).
 */
export function lessonParticipantsFetcher(
    token: string,
    zoom: { instances: typeof fetchPastInstances; participants: typeof fetchPastParticipants } = { instances: fetchPastInstances, participants: fetchPastParticipants },
): FetchParticipants {
    return async lesson => {
        const listed = await zoom.instances(lesson.zoomMeetingId, token)
        if (listed.ok && listed.instances.length > 0) {
            const near = listed.instances.filter(i => {
                const at = Date.parse(i.start_time ?? '')
                return Number.isFinite(at) && at >= startMs(lesson) - INSTANCE_BEFORE_MS && at <= endMs(lesson) + WINDOW_MS
            })
            // The meeting ran, but never around this lesson.
            if (near.length === 0) return { ok: true, participants: [] }
            const all: ZoomParticipant[] = []
            for (const i of near) {
                const got = await zoom.participants(lesson.zoomMeetingId, token, { uuid: i.uuid })
                if (!got.ok) return got
                all.push(...got.participants)
            }
            return { ok: true, participants: all }
        }
        if (!listed.ok && listed.neverStarted) return { ok: false, neverStarted: true, reason: 'never started' }
        return zoom.participants(lesson.zoomMeetingId, token)
    }
}

const startMs = (l: AttendanceLesson) => Date.parse(studioWallClockToISO(l.date, l.time))
export const endMs = (l: AttendanceLesson) => startMs(l) + l.duration * 60_000

/** Whether a lesson is due a check now. */
export function needsCheck(lesson: AttendanceLesson, existing: ExistingRow | undefined, now: Date): boolean {
    if (endMs(lesson) + CHECK_AFTER_MINUTES * 60_000 > now.getTime()) return false
    if (!existing) return true
    return existing.status === 'retrying' && now.getTime() - Date.parse(existing.fetched_at) >= RETRY_AFTER_MINUTES * 60_000
}

/** The row to save for one answer from Zoom. Pure. */
export function attendanceRow(lesson: AttendanceLesson, got: ParticipantsResult, previousAttempts: number, now: Date) {
    const attempts = previousAttempts + 1
    const base = { lesson_id: lesson.id, zoom_meeting_id: lesson.zoomMeetingId, attempts, fetched_at: now.toISOString() }
    if (got.ok) {
        const s = summarizeAttendance(got.participants, startMs(lesson), endMs(lesson))
        return {
            ...base,
            status: 'saved' as const,
            kind: s.kind,
            participants: got.participants.map(keepParticipant),
            teacher_seconds: s.teacherSeconds,
            student_seconds: s.studentSeconds,
            overlap_seconds: s.overlapSeconds,
            teacher_joined_at: s.teacherJoinedAt,
            student_joined_at: s.studentJoinedAt,
            last_error: null,
        }
    }
    const longOver = now.getTime() - endMs(lesson) >= NEVER_STARTED_FINAL_AFTER_MINUTES * 60_000
    const status = got.neverStarted
        ? (longOver || attempts >= MAX_ATTEMPTS ? 'never_started' as const : 'retrying' as const)
        : (attempts >= MAX_ATTEMPTS ? 'gave_up' as const : 'retrying' as const)
    return { ...base, status, kind: got.neverStarted ? 'never_started' : null, last_error: got.reason }
}

/** Zoom lessons between two studio dates (teacher accounts left out), with any saved row. */
export async function findAttendanceLessons(
    client: DbClient,
    { from, to }: { from: string; to: string },
): Promise<{ lesson: AttendanceLesson; existing?: ExistingRow }[]> {
    const rows: any[] = []
    for (let start = 0; ; start += 1000) {
        const { data, error } = await client
            .from('lessons')
            .select('id, student_id, date, time, duration, zoom_meeting_id')
            .not('zoom_meeting_id', 'is', null)
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: true })
            .order('time', { ascending: true })
            .range(start, start + 999)
        if (error) throw new Error(`lessons query failed: ${error.message}`)
        rows.push(...(data ?? []))
        if (!data || data.length < 1000) break
    }
    if (rows.length === 0) return []

    const studentIds = [...new Set(rows.map(r => r.student_id as string))]
    const profiles = new Map<string, { credits: number | null; lesson_duration: number | null }>()
    for (let i = 0; i < studentIds.length; i += 200) {
        const { data, error } = await client.from('profiles').select('id, credits, lesson_duration').in('id', studentIds.slice(i, i + 200))
        if (error) throw new Error(`profiles query failed: ${error.message}`)
        for (const p of data ?? []) profiles.set(p.id as string, { credits: p.credits as number | null, lesson_duration: p.lesson_duration as number | null })
    }

    const lessons: AttendanceLesson[] = rows
        .filter(r => !isUntrackedTeacherAccount(profiles.get(r.student_id)))
        .map(r => ({
            id: r.id,
            date: r.date,
            time: String(r.time).slice(0, 5),
            duration: Number(r.duration) || Number(profiles.get(r.student_id)?.lesson_duration) || 60,
            zoomMeetingId: String(r.zoom_meeting_id).replace(/\D/g, ''),
        }))
        .filter(l => l.zoomMeetingId)

    const existing = new Map<string, ExistingRow>()
    const ids = lessons.map(l => l.id)
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await client.from(TABLE).select('lesson_id, status, attempts, fetched_at, kind').in('lesson_id', ids.slice(i, i + 200))
        if (error) throw new Error(`${TABLE} query failed: ${error.message}`)
        for (const r of (data ?? []) as ExistingRow[]) existing.set(r.lesson_id, r)
    }
    return lessons.map(lesson => ({ lesson, existing: existing.get(lesson.id) }))
}

/** Asks Zoom about one lesson and saves the answer. Throws only when the save itself fails. */
export async function saveLessonAttendance(
    client: DbClient,
    lesson: AttendanceLesson,
    existing: ExistingRow | undefined,
    fetchParticipants: FetchParticipants,
    now: Date = new Date(),
) {
    let got: ParticipantsResult
    try {
        got = await fetchParticipants(lesson)
    } catch (e) {
        got = { ok: false, neverStarted: false, reason: e instanceof Error ? e.message : String(e) }
    }
    const row = attendanceRow(lesson, got, existing?.attempts ?? 0, now)
    const { error } = await client.from(TABLE).upsert(row, { onConflict: 'lesson_id' })
    if (error) throw new Error(`${TABLE} save failed: ${error.message}`)
    return row
}

export type SweepResult = {
    due: number
    saved: Array<{ lessonId: string; date: string; time: string; status: string; kind: string | null }>
    errors: Array<{ lessonId: string; error: string }>
    /** Due lessons left for the next run (limit or time budget reached). */
    left: number
}

/** Zoom's answer for a lesson, with a fresh token for the run. */
export async function zoomParticipantsFetcher(): Promise<FetchParticipants | null> {
    const { getZoomAccessToken } = await import('@/lib/zoom')
    const token = await getZoomAccessToken()
    return token ? lessonParticipantsFetcher(token) : null
}

/** The cron's step: save attendance for recent Zoom lessons that are due. */
export async function sweepZoomAttendance(
    client: DbClient,
    {
        now = new Date(),
        limit = 8,
        budgetMs = 60_000,
        fetchParticipants,
    }: { now?: Date; limit?: number; budgetMs?: number; fetchParticipants?: FetchParticipants } = {},
): Promise<SweepResult> {
    const today = isoToStudioWallClock(now.toISOString()).localDate
    const candidates = await findAttendanceLessons(client, { from: shiftDateStr(today, -LOOKBACK_DAYS), to: today })
    const due = candidates.filter(c => needsCheck(c.lesson, c.existing, now))
    const result: SweepResult = { due: due.length, saved: [], errors: [], left: 0 }
    if (due.length === 0) return result

    const fetch = fetchParticipants ?? await zoomParticipantsFetcher()
    if (!fetch) throw new Error('Could not get a Zoom token')

    const started = Date.now()
    for (const [i, { lesson, existing }] of due.entries()) {
        if (i >= limit || Date.now() - started > budgetMs) {
            result.left = due.length - i
            break
        }
        try {
            const row = await saveLessonAttendance(client, lesson, existing, fetch, now)
            result.saved.push({ lessonId: lesson.id, date: lesson.date, time: lesson.time, status: row.status, kind: row.kind })
        } catch (e) {
            result.errors.push({ lessonId: lesson.id, error: e instanceof Error ? e.message : String(e) })
        }
    }
    return result
}

/** Saved rows for the admin line (#964), by lesson id. */
export async function loadAttendanceViews(client: DbClient, lessonIds: string[]): Promise<Record<string, AttendanceView>> {
    const out: Record<string, AttendanceView> = {}
    const ids = [...new Set(lessonIds)].filter(Boolean)
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await client
            .from(TABLE)
            .select('lesson_id, status, kind, teacher_seconds, student_seconds, overlap_seconds, student_joined_at')
            .in('lesson_id', ids.slice(i, i + 200))
        if (error) throw new Error(`${TABLE} query failed: ${error.message}`)
        for (const r of data ?? []) {
            out[r.lesson_id as string] = {
                status: r.status as AttendanceView['status'],
                kind: (r.kind as string | null) ?? null,
                teacherSeconds: r.teacher_seconds as number | null,
                studentSeconds: r.student_seconds as number | null,
                overlapSeconds: r.overlap_seconds as number | null,
                studentJoinedAt: r.student_joined_at as string | null,
            }
        }
    }
    return out
}
