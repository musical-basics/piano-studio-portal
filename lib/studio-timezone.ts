/**
 * Studio timezone utilities
 *
 * All date-sensitive lesson logic (auto-next-lesson, "today" windows,
 * default API ranges) must use studio-local time (America/Los_Angeles)
 * rather than UTC, because:
 *
 *   - Lessons run on PST/PDT wall-clock schedules
 *   - UTC midnight can be up to 8 hours before PST midnight
 *   - Crossing UTC midnight mid-evening caused Zoom-webhook completions
 *     to be treated as "next-day" by date comparisons using new Date()
 */

export const STUDIO_TZ = 'America/Los_Angeles'

/**
 * Returns the current Date object representing "now" evaluated in studio
 * local time. Useful for date arithmetic that needs to stay in PST/PDT.
 *
 * Note: JavaScript Date objects are always UTC internally; this returns a
 * Date whose numeric value equals wall-clock studio time interpreted as UTC.
 * Use it only for date-string comparisons and addDays() math, not for
 * storing raw timestamps.
 */
export function studioNow(): Date {
    const str = new Date().toLocaleString('en-US', { timeZone: STUDIO_TZ })
    return new Date(str)
}

/**
 * Returns today's date string (YYYY-MM-DD) in studio local time.
 */
export function studioToday(): string {
    const now = studioNow()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}
