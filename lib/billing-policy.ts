/**
 * Billing policy constants + helpers shared between the client cancellation UI
 * and the server-side cancellation logic, so the late-cancellation fee and the
 * "within 24 hours" threshold live in exactly one place.
 */

/** Flat fee (USD) charged when a student cancels within 24 hours of the lesson. */
export const LATE_CANCEL_FEE = 15

/** A cancellation counts as "late" when the lesson starts within this many hours. */
export const LATE_CANCEL_WINDOW_HOURS = 24

/**
 * True when `lessonDate`/`lessonTime` is still in the future but starts within
 * LATE_CANCEL_WINDOW_HOURS of `now`.
 *
 * `now` is supplied by the caller so each context controls its own clock: the
 * browser passes `new Date()`, the server passes studio-local time. Because the
 * lesson date/time and `now` are both parsed/derived in the same timezone, the
 * offset cancels and the hour difference is correct on either side.
 */
export function isLateCancellation(
    lessonDate: string | undefined,
    lessonTime: string | undefined,
    now: Date,
): boolean {
    if (!lessonDate) return false

    const timeStr = lessonTime || '12:00'
    const lessonDateTime = new Date(`${lessonDate}T${timeStr}:00`)
    const diffHours = (lessonDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)

    return diffHours > 0 && diffHours < LATE_CANCEL_WINDOW_HOURS
}
