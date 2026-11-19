/**
 * "Request a different time" (#878): plain helpers shared by the server code
 * (lib/core/move-requests.ts), the morning email and the self-check script. No
 * database or server-only imports here.
 *
 * A family asks to move one upcoming lesson to one of Lionel's free slots in
 * that lesson's week (Monday to Sunday, studio dates). Nothing moves until he
 * approves. A pending request goes stale when the lesson is moved some other
 * way, logged or cancelled, when the lesson's time or the picked time comes,
 * or when the picked time is no longer free.
 */

import { shiftDateStr, studioWallClockToISO, weekdayOfDateStr } from '@/lib/studio-timezone'
import { formatLessonTimeForFamily, formatStudioTime } from '@/lib/family-time'

export type MoveRequestStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'withdrawn'

/** Why a request ended (lesson_move_requests.outcome starts with one of these). */
export type MoveRequestOutcome =
    | 'moved'
    | 'declined'
    | 'withdrawn'
    | 'slot_taken'
    | 'slot_passed'
    | 'lesson_passed'
    | 'lesson_changed'

export type MoveRequestRow = {
    id: string
    lesson_id: string
    student_id: string
    from_date: string
    from_time: string
    to_date: string
    to_time: string
    duration: number
    status: MoveRequestStatus
    outcome: string | null
    decided_via: string | null
    decided_at: string | null
    created_at: string
}

/** The lesson as the stale check needs it (null when the row is gone). */
export type MoveRequestLesson = {
    id: string
    date: string
    time: string
    status: string
    duration: number | null
}

/** The Monday-to-Sunday week (studio dates) a lesson falls in. */
export function lessonWeek(date: string): { start: string; end: string } {
    const weekday = weekdayOfDateStr(date) // 0 = Sunday
    const start = shiftDateStr(date, weekday === 0 ? -6 : 1 - weekday)
    return { start, end: shiftDateStr(start, 6) }
}

/** "Thu, Nov 20" */
export function shortDayLabel(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Thu, Nov 20 at 4:30pm EST", studio time (admin and Lionel's email). */
export function studioSlotLabel(date: string, time: string): string {
    return `${shortDayLabel(date)} at ${formatStudioTime(time.slice(0, 5), date)}`
}

/** "Thu, Nov 20 at 4:30pm EST (1:30pm your time)", as the family reads it (#729). */
export function familySlotLabel(date: string, time: string, familyTz: string | null | undefined): string {
    return `${shortDayLabel(date)} at ${formatLessonTimeForFamily(date, time.slice(0, 5), familyTz)}`
}

/** "the week of Mon, Nov 17" */
export function weekLabel(date: string): string {
    return `the week of ${shortDayLabel(lessonWeek(date).start)}`
}

/** When a studio date and HH:MM time happens, as epoch ms. */
export function studioStartMs(date: string, time: string): number {
    return Date.parse(studioWallClockToISO(date, time.slice(0, 5)))
}

/**
 * Why a pending request can no longer be approved, judged without asking
 * whether the picked time is still free (the caller checks that against the
 * schedule). Null while it still can be.
 */
export function staleReason(
    request: Pick<MoveRequestRow, 'from_date' | 'from_time' | 'to_date' | 'to_time'>,
    lesson: MoveRequestLesson | null,
    nowMs: number = Date.now(),
): Exclude<MoveRequestOutcome, 'moved' | 'declined' | 'withdrawn' | 'slot_taken'> | null {
    if (!lesson) return 'lesson_changed'
    if (lesson.status !== 'scheduled') return 'lesson_changed'
    if (lesson.date !== request.from_date || String(lesson.time).slice(0, 5) !== request.from_time.slice(0, 5)) return 'lesson_changed'
    if (studioStartMs(lesson.date, String(lesson.time)) <= nowMs) return 'lesson_passed'
    if (studioStartMs(request.to_date, request.to_time) <= nowMs) return 'slot_passed'
    return null
}

/** Plain words for Lionel (admin and the email) on why a request closed. */
export function outcomeForAdmin(outcome: string | null): string {
    const kind = (outcome || '').split(':')[0]
    switch (kind) {
        case 'moved': return 'the lesson was moved'
        case 'declined': return 'it was declined'
        case 'withdrawn': return 'the family withdrew it'
        case 'slot_taken': return 'that time is no longer free (another lesson or event is there now, or it is outside your hours)'
        case 'slot_passed': return 'the time they picked has passed'
        case 'lesson_passed': return "the lesson's own time has come"
        case 'lesson_changed': return 'the lesson was moved, logged or cancelled some other way'
        default: return outcome || 'it was closed'
    }
}
