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

// The ONE place the portal's code names the studio time zone. Every stored
// lesson date/time is wall-clock in this zone with no offset. The database
// row studio_settings.timezone says the same thing for other apps (Lionel's
// calendar app reads it live); the two must always change together, along
// with converting the stored times (see docs/studio-timezone.md).
export const STUDIO_TZ = 'America/Los_Angeles'

/**
 * Short zone label for display, e.g. "PST"/"PDT" or "EST"/"EDT", correct for
 * the date in question (daylight time or not). Pass the lesson's date when
 * there is one; defaults to now.
 */
export function studioTzAbbr(at: Date | string = new Date()): string {
    const d = typeof at === 'string' ? new Date(`${at.slice(0, 10)}T12:00:00Z`) : at
    const part = new Intl.DateTimeFormat('en-US', { timeZone: STUDIO_TZ, timeZoneName: 'short' })
        .formatToParts(d)
        .find(p => p.type === 'timeZoneName')?.value
    return part || 'ET'
}

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
 *
 * Built from Intl formatting alone, so it is also safe in the browser. Client
 * code must use this instead of `new Date().toISOString().split('T')[0]`,
 * which is the UTC date and rolls over to tomorrow at 4pm PST / 5pm PDT.
 */
export function studioToday(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: STUDIO_TZ })
}

/** Shift a YYYY-MM-DD string by whole calendar days, in any runtime timezone. */
export function shiftDateStr(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

/** Day of the week (0 = Sunday) of a YYYY-MM-DD string, in any runtime timezone. */
export function weekdayOfDateStr(dateStr: string): number {
    return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
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
