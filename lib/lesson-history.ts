import { studioWallClockToISO } from '@/lib/studio-timezone'

/**
 * The family's "Lesson history" tab (#737): every lesson on their account,
 * whether it took a lesson from their balance, and what was left after.
 * Read-only, built from the family's own lessons rows (the page reads them
 * with the family's own session, so row security keeps it to their rows).
 *
 *   - Counted: logged (status 'completed'), or a no-show ('cancelled'), which
 *     forfeits the lesson. "Left after" is the balance the log recorded
 *     (credit_snapshot), when it recorded one.
 *   - Free: logged with "Free, don't take a credit" (#756, free_reason set).
 *     Nothing was taken; "Left after" is the unchanged balance.
 *   - Not counted: over, but never logged, so nothing was taken for it.
 *   - Upcoming: not over yet.
 * Cancelled lessons are deleted, so they never show. Notes, recordings and how
 * a lesson was logged stay out of this view on purpose.
 */

export type LessonHistoryStatus = 'counted' | 'free' | 'not_counted' | 'upcoming'

export type LessonHistoryRow = {
    id: string
    /** YYYY-MM-DD, studio (Eastern) date. */
    date: string
    /** "8:15pm", Eastern. */
    clock: string
    /** Minutes. */
    duration: number
    status: LessonHistoryStatus
    /** Lessons left on the balance after this one, when it was counted and recorded. */
    leftAfter: number | null
}

export type LessonHistory = {
    rows: LessonHistoryRow[]
    booked: number
    counted: number
    free: number
    notCounted: number
    upcoming: number
    /** profiles.credits now. */
    leftNow: number | null
}

type SourceLesson = {
    id: string
    date: string
    time: string
    duration?: number | null
    status: string
    credit_snapshot?: number | null
    free_reason?: string | null
}

export function formatLessonClock(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

export function lessonHistoryStatus(lesson: SourceLesson, now: Date = new Date()): LessonHistoryStatus {
    if (lesson.status === 'completed' && typeof lesson.free_reason === 'string') return 'free'
    if (lesson.status === 'completed' || lesson.status === 'cancelled') return 'counted'
    const time = String(lesson.time).slice(0, 5)
    const endMs = Date.parse(studioWallClockToISO(lesson.date, time)) + (lesson.duration || 60) * 60_000
    return endMs > now.getTime() ? 'upcoming' : 'not_counted'
}

/** Newest first. Only the fields a family should see leave this function. */
export function buildLessonHistory(lessons: SourceLesson[], creditsNow: number | null, now: Date = new Date()): LessonHistory {
    const key = (l: SourceLesson) => `${l.date} ${String(l.time).slice(0, 5)}`
    const rows = [...lessons]
        .sort((a, b) => key(b).localeCompare(key(a)))
        .map((l): LessonHistoryRow => {
            const status = lessonHistoryStatus(l, now)
            return {
                id: l.id,
                date: l.date,
                clock: formatLessonClock(String(l.time).slice(0, 5)),
                duration: l.duration || 60,
                status,
                leftAfter: (status === 'counted' || status === 'free') && typeof l.credit_snapshot === 'number' ? l.credit_snapshot : null,
            }
        })

    return {
        rows,
        booked: rows.length,
        counted: rows.filter(r => r.status === 'counted').length,
        free: rows.filter(r => r.status === 'free').length,
        notCounted: rows.filter(r => r.status === 'not_counted').length,
        upcoming: rows.filter(r => r.status === 'upcoming').length,
        leftNow: typeof creditsNow === 'number' ? creditsNow : null,
    }
}
