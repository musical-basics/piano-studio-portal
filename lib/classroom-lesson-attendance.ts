import { isoToStudioWallClock } from '@/lib/studio-timezone'

/**
 * Who was in a lesson's classroom room, and for how long, from the attendance
 * the classroom records (#795: table classroom_attendance, one row per
 * connection, written from our own LiveKit server's webhooks). Used by:
 *
 *   - the morning email (#1066): a lesson only Lionel was in the room for is
 *     marked "No-show?" with the one-tap No-Show button, like Zoom's (#797)
 *   - the line on each classroom lesson in admin (#1103):
 *     "Classroom: you 31 min, student 29 min (joined 6:31pm)"
 *   - the "waiting alone" email (#1104, lib/classroom-alone-alert.ts)
 *
 * This file is the pure part, also used in the browser. Loading the rows is in
 * lib/core/classroom-lesson-attendance.ts. Admin only: never shown to families.
 */

const MINUTE = 60_000

/** Joins this close to the lesson count for it (the same hour either side as Zoom's, #797). */
export const CLASSROOM_WINDOW_MS = 60 * MINUTE
/** Under this much in total, the student did not really join (Zoom's rule, #797). */
export const CLASSROOM_STUDENT_MIN_SECONDS = 120
/** An open connection older than this lost its "left" webhook (STALE_OPEN_MS in lib/classroom-attendance.ts). */
export const CLASSROOM_STALE_OPEN_MS = 4 * 60 * MINUTE

export type ClassroomAttendanceRow = {
    student_id: string
    role: string
    joined_at: string
    left_at: string | null
}

export type ClassroomAttendanceKind =
    /** Nobody in the room around the lesson (or the student under 2 minutes, without Lionel). */
    | 'nobody'
    /** Lionel was in the room; the student never, or under 2 minutes in total. */
    | 'only_you'
    /** The student was in the room 2+ minutes, and so was Lionel. */
    | 'student_joined'
    /** The student was in the room 2+ minutes; Lionel never joined. */
    | 'host_absent'

export type ClassroomAttendance = {
    kind: ClassroomAttendanceKind
    teacherSeconds: number
    studentSeconds: number
    /** Both in the room at once. */
    togetherSeconds: number
    teacherJoinedAt: string | null
    studentJoinedAt: string | null
    /** Someone is still connected: the sums run to now. */
    inRoom: boolean
}

type Span = [number, number]

/** A connection's time, an open one up to now; null for a stale open one (counts nothing). */
function spanOf(row: ClassroomAttendanceRow, nowMs: number): Span | null {
    const start = Date.parse(row.joined_at)
    if (!Number.isFinite(start)) return null
    let end: number
    if (row.left_at) end = Date.parse(row.left_at)
    else if (nowMs - start < CLASSROOM_STALE_OPEN_MS) end = Math.max(start, nowMs)
    else return null
    return Number.isFinite(end) && end > start ? [start, end] : null
}

function isOpen(row: ClassroomAttendanceRow, nowMs: number): boolean {
    return !row.left_at && nowMs - Date.parse(row.joined_at) < CLASSROOM_STALE_OPEN_MS
}

/** Overlapping spans merged, in order; spans `gapMs` apart or closer count as one (a reload). */
export function mergeSpans(list: Span[], gapMs = 0): Span[] {
    const out: Span[] = []
    for (const [s, e] of [...list].sort((a, b) => a[0] - b[0])) {
        const last = out[out.length - 1]
        if (last && s <= last[1] + gapMs) last[1] = Math.max(last[1], e)
        else out.push([s, e])
    }
    return out
}

const seconds = (list: Span[]) => Math.round(list.reduce((sum, [s, e]) => sum + (e - s), 0) / 1000)

function overlapSeconds(a: Span[], b: Span[]): number {
    let ms = 0
    for (const [as, ae] of a) for (const [bs, be] of b) ms += Math.max(0, Math.min(ae, be) - Math.max(as, bs))
    return Math.round(ms / 1000)
}

const roleRows = (rows: ClassroomAttendanceRow[], role: 'teacher' | 'student') => rows.filter(r => r.role === role)

/**
 * A lesson's classroom attendance from the student's room rows: only
 * connections that joined within an hour of the lesson count. Time is merged,
 * so two devices or a reload never count twice.
 */
export function summarizeClassroomAttendance(
    rows: ClassroomAttendanceRow[],
    lessonStartMs: number,
    lessonEndMs: number,
    nowMs: number,
): ClassroomAttendance {
    const near = rows.filter(r => {
        if (r.role !== 'teacher' && r.role !== 'student') return false
        const at = Date.parse(r.joined_at)
        return Number.isFinite(at) && at >= lessonStartMs - CLASSROOM_WINDOW_MS && at <= lessonEndMs + CLASSROOM_WINDOW_MS
    })
    const spans = (rs: ClassroomAttendanceRow[]) => mergeSpans(rs.map(r => spanOf(r, nowMs)).filter((x): x is Span => !!x))
    const teacher = spans(roleRows(near, 'teacher'))
    const student = spans(roleRows(near, 'student'))
    const firstJoin = (spansList: Span[]) => (spansList.length ? new Date(spansList[0][0]).toISOString() : null)
    const teacherSeconds = seconds(teacher)
    const studentSeconds = seconds(student)
    let kind: ClassroomAttendanceKind = 'nobody'
    if (studentSeconds >= CLASSROOM_STUDENT_MIN_SECONDS) kind = teacherSeconds > 0 ? 'student_joined' : 'host_absent'
    else if (teacherSeconds > 0) kind = 'only_you'
    return {
        kind,
        teacherSeconds,
        studentSeconds,
        togetherSeconds: overlapSeconds(teacher, student),
        teacherJoinedAt: firstJoin(teacher),
        studentJoinedAt: firstJoin(student),
        inRoom: near.some(r => isOpen(r, nowMs)),
    }
}

/** Anyone at all in the room around the lesson. */
export function anyoneCame(a: ClassroomAttendance): boolean {
    return a.teacherSeconds > 0 || a.studentSeconds > 0 || a.inRoom
}

/** "6:31pm", Eastern. */
export function clockOf(iso: string): string {
    const [h, m] = isoToStudioWallClock(iso).localTime.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

const mins = (s: number) => (s > 0 && s < 60 ? 'under 1 min' : `${Math.round(s / 60)} min`)

/** The admin line (#1103): "Classroom: you 31 min, student 29 min (joined 6:31pm)" and the other cases. */
export function classroomAttendanceLine(a: ClassroomAttendance): { text: string; title: string } {
    const t = a.teacherSeconds
    const s = a.studentSeconds
    const joined = a.studentJoinedAt ? ` (joined ${clockOf(a.studentJoinedAt)})` : ''
    const now = a.inRoom ? ', in the room now' : ''
    const source = "From the classroom's attendance record."
    if (t === 0 && s === 0) return { text: `Classroom: no one joined${now}`, title: source }
    if (s === 0) return { text: `Classroom: you ${mins(t)}, the student did not join${now}`, title: source }
    if (t === 0) return { text: `Classroom: student ${mins(s)}${joined}, you did not join${now}`, title: source }
    return { text: `Classroom: you ${mins(t)}, student ${mins(s)}${joined}${now}`, title: `Together in the room: ${mins(a.togetherSeconds)}. ${source}` }
}

export type ClassroomAttendanceNote = ClassroomAttendance | { kind: 'unknown'; reason: string }

/** Short plain-text note for the morning email's lesson line (#1066), like Zoom's attendanceNote. */
export function classroomAttendanceNote(a: ClassroomAttendanceNote): string {
    if (a.kind === 'unknown') return `Classroom attendance unknown (${a.reason})`
    const t = Math.round(a.teacherSeconds / 60)
    const s = Math.round(a.studentSeconds / 60)
    switch (a.kind) {
        case 'only_you': return a.studentSeconds > 0
            ? `No-show? Classroom: you were there ${t} min, the student only ${mins(a.studentSeconds)}`
            : `No-show? Classroom: only you were in the room (${t} min)`
        case 'student_joined': return `Classroom: the student was there ${s} min, you ${t} min`
        case 'host_absent': return `Classroom: the student was there ${s} min, but you never joined`
        case 'nobody': return a.studentSeconds > 0
            ? `Classroom: the student was there only ${mins(a.studentSeconds)} and you never joined`
            : 'Classroom: nobody joined'
    }
}

// ------------------------------------------------- waiting alone (#1104) ---

/** Email once the student has waited alone this long. */
export const ALONE_ALERT_MINUTES = 5
/** Lionel in the room from this long before the start counts as having started the lesson. */
export const TEACHER_EARLY_MS = 30 * MINUTE
/** A student who drops and comes back within this is still the same wait (a reload). */
export const RECONNECT_GAP_MS = 2 * MINUTE

export type AloneWait = {
    /** When the student's current stay in the room began. */
    joinedMs: number
    /** The later of that and the lesson's start: the wait counts from here. */
    aloneSinceMs: number
    minutes: number
    /** Waited ALONE_ALERT_MINUTES or more: email now. */
    due: boolean
}

/**
 * Whether the student is in their room now, waiting for a lesson Lionel has
 * not started (#1104): the student is connected, and Lionel has not been in
 * the room at all since 30 minutes before the start. The wait counts from the
 * later of the student's arrival and the lesson's start, so joining early is
 * never a wait. Null when there is nothing to report (no student, Lionel came,
 * or the lesson is over).
 */
export function waitingAlone(
    rows: ClassroomAttendanceRow[],
    lesson: { startMs: number; endMs: number },
    nowMs: number,
): AloneWait | null {
    if (nowMs >= lesson.endMs) return null
    const teacherRows = roleRows(rows, 'teacher')
    if (teacherRows.some(r => isOpen(r, nowMs))) return null
    const teacherSince = lesson.startMs - TEACHER_EARLY_MS
    const teacherCame = teacherRows.some(r => {
        const span = spanOf(r, nowMs)
        return span !== null && span[1] > teacherSince
    })
    if (teacherCame) return null

    const studentRows = roleRows(rows, 'student')
    if (!studentRows.some(r => isOpen(r, nowMs))) return null
    const stays = mergeSpans(studentRows.map(r => spanOf(r, nowMs)).filter((x): x is Span => !!x), RECONNECT_GAP_MS)
    const current = stays.find(([s, e]) => s <= nowMs && e >= nowMs)
    if (!current) return null
    const aloneSinceMs = Math.max(current[0], lesson.startMs)
    const minutes = Math.max(0, (nowMs - aloneSinceMs) / MINUTE)
    return { joinedMs: current[0], aloneSinceMs, minutes, due: minutes >= ALONE_ALERT_MINUTES }
}
