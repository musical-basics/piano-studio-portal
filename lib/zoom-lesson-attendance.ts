import { WINDOW_MS, classifyAttendance, type ZoomParticipant } from '@/lib/zoom-attendance'
import { isoToStudioWallClock, studioWallClockToISO } from '@/lib/studio-timezone'

/**
 * Who joined each Zoom lesson and for how long (#964), from the attendance the
 * portal saves after each lesson (#965, table zoom_lesson_attendance; saving
 * is in lib/core/zoom-lesson-attendance.ts). This file is the pure part, also
 * used in the browser: summing a meeting's joins, and the line on the lesson
 * in admin. Admin only: never shown in the family portal.
 */

/** One join, as Zoom gives it (emails and Zoom's ids are not kept). */
export type StoredParticipant = {
    name: string | null
    internal_user: boolean
    status: string | null
    join_time: string | null
    leave_time: string | null
    duration: number
}

export function keepParticipant(p: ZoomParticipant): StoredParticipant {
    return {
        name: p.name ?? null,
        internal_user: p.internal_user === true,
        status: p.status ?? null,
        join_time: p.join_time ?? null,
        leave_time: p.leave_time ?? null,
        duration: Math.max(0, Number(p.duration) || 0),
    }
}

export type AttendanceSummary = {
    /** classifyAttendance's kind, or 'later_use' when Zoom only had a later use of the meeting. */
    kind: string
    teacherSeconds: number
    studentSeconds: number
    overlapSeconds: number
    teacherJoinedAt: string | null
    studentJoinedAt: string | null
}

type Interval = [number, number]

function interval(p: ZoomParticipant): Interval | null {
    const start = p.join_time ? Date.parse(p.join_time) : NaN
    if (!Number.isFinite(start)) return null
    const left = p.leave_time ? Date.parse(p.leave_time) : NaN
    const end = Number.isFinite(left) ? left : start + Math.max(0, Number(p.duration) || 0) * 1000
    return end > start ? [start, end] : null
}

/** Overlapping or touching intervals merged, in order. */
export function mergeIntervals(list: Interval[]): Interval[] {
    const sorted = [...list].sort((a, b) => a[0] - b[0])
    const out: Interval[] = []
    for (const [s, e] of sorted) {
        const last = out[out.length - 1]
        if (last && s <= last[1]) last[1] = Math.max(last[1], e)
        else out.push([s, e])
    }
    return out
}

const seconds = (list: Interval[]) => Math.round(list.reduce((sum, [s, e]) => sum + (e - s), 0) / 1000)

/** Seconds two sets of merged intervals have in common. */
function overlap(a: Interval[], b: Interval[]): number {
    let ms = 0
    for (const [as, ae] of a) for (const [bs, be] of b) ms += Math.max(0, Math.min(ae, be) - Math.max(as, bs))
    return Math.round(ms / 1000)
}

/**
 * A lesson's attendance from Zoom's joins: only joins within an hour of the
 * lesson count (#797). Teacher = Lionel's own account (internal_user); student
 * = everyone else, waiting room included; overlap = both in the meeting at
 * once, waiting room not included. Time is merged, so two devices or a
 * rejoin are not counted twice.
 */
export function summarizeAttendance(participants: ZoomParticipant[], lessonStartMs: number, lessonEndMs: number): AttendanceSummary {
    const near = participants.filter(p => {
        const at = p.join_time ? Date.parse(p.join_time) : NaN
        return Number.isFinite(at) && at >= lessonStartMs - WINDOW_MS && at <= lessonEndMs + WINDOW_MS
    })
    const span = (ps: ZoomParticipant[]) => mergeIntervals(ps.map(interval).filter((x): x is Interval => !!x))
    const teacher = near.filter(p => p.internal_user === true)
    const student = near.filter(p => p.internal_user !== true)
    const inMeeting = (p: ZoomParticipant) => p.status !== 'in_waiting_room'
    const firstJoin = (ps: ZoomParticipant[]) => {
        const times = ps.map(p => (p.join_time ? Date.parse(p.join_time) : NaN)).filter(Number.isFinite)
        return times.length ? new Date(Math.min(...times)).toISOString() : null
    }
    let kind: string = classifyAttendance(participants, lessonStartMs, lessonEndMs).kind
    // Nobody around the lesson, but joins after it: Zoom gave a later use of
    // the same meeting link, not this lesson's (see lessonParticipantsFetcher).
    if (kind === 'other_time' && participants.some(p => p.join_time && Date.parse(p.join_time) > lessonEndMs + WINDOW_MS)) kind = 'later_use'
    return {
        kind,
        teacherSeconds: seconds(span(teacher)),
        studentSeconds: seconds(span(student)),
        overlapSeconds: overlap(span(teacher.filter(inMeeting)), span(student.filter(inMeeting))),
        teacherJoinedAt: firstJoin(teacher),
        studentJoinedAt: firstJoin(student),
    }
}

/** #1070: Zoom's recording webhook logs a lesson on its own only when the student was in the meeting this long. */
export const AUTO_LOG_MIN_STUDENT_SECONDS = 10 * 60

/**
 * Seconds the student was in the meeting itself around the lesson (#1070).
 * Unlike summarizeAttendance's studentSeconds, the waiting room does not count
 * here: a student never let in was not taught, so no credit is taken for it.
 */
export function studentSecondsInMeeting(participants: ZoomParticipant[], lessonStartMs: number, lessonEndMs: number): number {
    return summarizeAttendance(participants.filter(p => p.status !== 'in_waiting_room'), lessonStartMs, lessonEndMs).studentSeconds
}

// --------------------------------------------------------- the line ---

/** What the admin line needs from a saved row. */
export type AttendanceView = {
    status: 'saved' | 'never_started' | 'retrying' | 'gave_up'
    kind: string | null
    teacherSeconds: number | null
    studentSeconds: number | null
    overlapSeconds: number | null
    studentJoinedAt: string | null
}

/** Only lessons on Zoom that have started get a line. */
export function showsAttendance(lesson: { date: string; time: string; zoom_meeting_id?: string | null }, now: Date = new Date()): boolean {
    if (!lesson.zoom_meeting_id) return false
    return Date.parse(studioWallClockToISO(lesson.date, lesson.time.slice(0, 5))) <= now.getTime()
}

function clock(iso: string): string {
    const [h, m] = isoToStudioWallClock(iso).localTime.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

const mins = (s: number) => (s > 0 && s < 60 ? 'under 1 min' : `${Math.round(s / 60)} min`)

/** "Zoom: you 31 min, student 29 min (joined 6:31pm)" and the other cases. */
export function attendanceLine(view: AttendanceView | null | undefined): { text: string; title: string | null } {
    if (!view || view.status === 'retrying') return { text: 'Zoom: not checked yet', title: 'Zoom attendance is saved about 30 minutes after the lesson ends.' }
    if (view.status === 'gave_up') return { text: 'Zoom: could not read who joined', title: 'Zoom did not answer after several tries.' }
    if (view.status === 'never_started') return { text: 'Zoom: no one joined (the meeting never started)', title: null }
    if (view.kind === 'later_use') {
        return {
            text: 'Zoom: not available (the meeting link was used again later)',
            title: 'Zoom reports only the newest use of a meeting link. Older uses need one more Zoom permission (past meeting instances).',
        }
    }

    const t = view.teacherSeconds ?? 0
    const s = view.studentSeconds ?? 0
    const joined = view.studentJoinedAt ? ` (joined ${clock(view.studentJoinedAt)})` : ''
    const title = t > 0 && s > 0 && view.overlapSeconds != null ? `Together in the meeting: ${mins(view.overlapSeconds)}` : null
    if (t === 0 && s === 0) return { text: 'Zoom: no one joined', title: null }
    if (s === 0) return { text: `Zoom: you ${mins(t)}, the student did not join`, title: null }
    if (t === 0) return { text: `Zoom: student ${mins(s)}${joined}, your account did not join`, title: null }
    return { text: `Zoom: you ${mins(t)}, student ${mins(s)}${joined}`, title }
}
