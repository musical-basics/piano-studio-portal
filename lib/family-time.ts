import { studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'

/**
 * Lesson times as families read them (Lionel's #729): "5:30pm EST (2:30pm your time)".
 *
 * Lesson times are stored as studio wall clock (Eastern). A family's own zone is
 * profiles.timezone. When it is set and their clock reads differently, emails show
 * both; otherwise Eastern only. Pure Intl, so it gives the same answer on Vercel
 * (UTC), on a laptop, or in the browser.
 */

/**
 * British Columbia stopped changing clocks on 2026-11-01 and stays on UTC-7 all year,
 * but the tz data shipped with Node still says America/Vancouver falls back to PST
 * (UTC-8). B.C. families are stored as this fixed zone instead. Note the Etc sign is
 * inverted: Etc/GMT+7 means UTC-7.
 */
export const BC_FIXED_ZONE = 'Etc/GMT+7'

/** The instant B.C. would have fallen back (2am PDT, 2026-11-01) but did not. */
const BC_PERMANENT_FROM = Date.parse('2026-11-01T09:00:00Z')

/**
 * Values that mean "never set" rather than where a family lives. 'UTC' is the
 * profiles.timezone column default, so it says nothing about the family.
 */
const UNSET_ZONES = new Set([
    'UTC', 'Etc/UTC', 'UCT', 'Etc/UCT', 'GMT', 'Etc/GMT', 'Etc/GMT0', 'Etc/GMT+0', 'Etc/GMT-0',
    'Greenwich', 'Etc/Greenwich', 'Universal', 'Etc/Universal', 'Zulu', 'Etc/Zulu',
])

/**
 * The zone to show a family's own time in, or null to show Eastern only (unset,
 * the UTC default, or not a zone Intl knows). America/Vancouver is read as the B.C.
 * fixed offset from the day the clocks stopped changing.
 */
export function familyTimeZone(tz: string | null | undefined, at?: Date): string | null {
    const zone = (tz ?? '').trim()
    if (!zone || UNSET_ZONES.has(zone)) return null
    if (zone === 'America/Vancouver' && (!at || at.getTime() >= BC_PERMANENT_FROM)) return BC_FIXED_ZONE
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone })
        return zone
    } catch {
        return null
    }
}

/** "17:30" -> "5:30pm" */
function clock12(hhmm: string): string {
    const [h, m = '00'] = hhmm.split(':')
    const hn = parseInt(h, 10)
    return `${hn % 12 || 12}:${m.padStart(2, '0')}${hn >= 12 ? 'pm' : 'am'}`
}

/** "5:30pm EST": a stored lesson time with the studio zone label for that moment. */
export function formatStudioTime(time: string, date: string): string {
    const hhmm = time.slice(0, 5)
    return `${clock12(hhmm)} ${studioTzAbbr(new Date(studioWallClockToISO(date, hhmm)))}`
}

/**
 * The family's own reading of a lesson time: "2:30pm your time", or with the
 * weekday when their date differs from the studio's ("Fri 12:30am your time").
 * Null when their zone is unknown or their clock reads the same as Eastern.
 */
export function familyLocalTime(date: string, time: string, familyTz: string | null | undefined): string | null {
    const hhmm = time.slice(0, 5)
    const at = new Date(studioWallClockToISO(date, hhmm))
    const zone = familyTimeZone(familyTz, at)
    if (!zone || isNaN(at.getTime())) return null

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at)
    const get = (type: string) => parts.find(p => p.type === type)?.value || ''
    const localDate = `${get('year')}-${get('month')}-${get('day')}`
    const localTime = `${get('hour')}:${get('minute')}`

    if (localDate === date && localTime === hhmm) return null
    const label = `${clock12(localTime)} your time`
    return localDate === date ? label : `${get('weekday')} ${label}`
}

/**
 * What a family email says for a lesson time: "5:30pm EST (2:30pm your time)",
 * or just "5:30pm EST" when the family's zone is unset or reads the same as Eastern.
 */
export function formatLessonTimeForFamily(date: string, time: string, familyTz: string | null | undefined): string {
    const studio = formatStudioTime(time, date)
    let local: string | null = null
    try {
        local = familyLocalTime(date, time, familyTz)
    } catch (e) {
        // Never let the extra line break a reminder run: fall back to Eastern only.
        console.error('formatLessonTimeForFamily: family time skipped:', e)
    }
    return local ? `${studio} (${local})` : studio
}
