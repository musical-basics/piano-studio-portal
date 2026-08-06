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

/**
 * Milliseconds to ADD to a UTC instant to get the studio wall-clock reading
 * (negative for LA: UTC-7/-8). Computed via Intl parts only, so the result is
 * identical regardless of the runtime's own timezone.
 */
function studioOffsetMs(atInstant: Date): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: STUDIO_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    const parts = dtf.formatToParts(atInstant)
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value || 0)
    const wallAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
    return wallAsUTC - atInstant.getTime()
}

/**
 * Interpret a YYYY-MM-DD + HH:MM as STUDIO wall-clock and return the real
 * UTC instant as an ISO string. Never parse studio times with `new Date()`
 * directly: that uses the runtime's timezone (UTC on Vercel, the viewer's
 * machine in the browser) and shifts the stored instant.
 */
export function studioWallClockToISO(dateStr: string, timeStr: string): string {
    const wallAsUTC = new Date(`${dateStr}T${timeStr}:00Z`)
    // Two passes so the offset is evaluated at the actual instant (DST-safe
    // except inside the transition hour itself).
    let offset = studioOffsetMs(wallAsUTC)
    let instant = new Date(wallAsUTC.getTime() - offset)
    offset = studioOffsetMs(instant)
    instant = new Date(wallAsUTC.getTime() - offset)
    return instant.toISOString()
}

/**
 * The studio wall-clock date and time of a stored instant, regardless of the
 * runtime's timezone. Use for displaying event timestamptz values so an admin
 * traveling outside PST still sees studio times.
 */
export function isoToStudioWallClock(isoString: string): { localDate: string; localTime: string } {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return { localDate: '', localTime: '' }
    const localDate = date.toLocaleDateString('en-CA', { timeZone: STUDIO_TZ })
    const localTime = date.toLocaleTimeString('en-GB', { timeZone: STUDIO_TZ, hour: '2-digit', minute: '2-digit' })
    return { localDate, localTime }
}
