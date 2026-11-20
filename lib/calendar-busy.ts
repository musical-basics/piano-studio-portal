/**
 * Lionel's own Google Calendar events as busy time, for the free slots offered
 * to families (#1093): a make-up or a move never lands on a personal
 * appointment. Read only; nothing here changes the calendar.
 *
 * Calendars read: the studio calendar (GOOGLE_CALENDAR_ID, the one lesson
 * events go on) plus any in GOOGLE_BUSY_CALENDAR_IDS (comma-separated, e.g. a
 * personal calendar shared with the portal's service account with "See all
 * event details"). One that can't be read is logged and skipped.
 *
 * What blocks (busyFromCalendarEvent, pure, checked in
 * scripts/check_calendar_busy.ts):
 *   - lesson events never do: anything the portal's service account made (it
 *     only makes lesson events) or that a lesson row points to. The lesson
 *     itself is already busy time in the free-slot finder.
 *   - a timed event blocks its own span, unless it is marked "Free" on the
 *     calendar or he declined it.
 *   - an all-day event blocks the whole day when it is marked "Busy", is an
 *     out-of-office event, or its title says the day is off ("Off", "Day off",
 *     "Holiday", "Vacation", "Away", "Travelling", "Thanksgiving", "Christmas",
 *     "No lessons", ...). Google makes all-day events "Free" by default, so a
 *     birthday or a reminder does not block, and a typed-in "Thanksgiving"
 *     still does.
 *   - birthdays and working-location entries never block.
 */

import { PORTAL_EVENT_MARKER, listCalendarEvents, type GoogleCalendarEvent } from '@/lib/google-calendar'
import { isoToStudioWallClock, shiftDateStr } from '@/lib/studio-timezone'

/** Minutes after studio midnight, end exclusive. */
export type BusyBlock = { date: string; start: number; end: number; allDay: boolean }

export type BusyVerdict = { blocks: BusyBlock[]; why: string }

/** An all-day title that means "no lessons that day". */
const DAY_OFF = /^(off|out|away|closed)\b|\b(day off|days off|time off|off day|holidays?|vacation|travel(l?ing)?|trip|out of (the )?office|ooo|sick|no lessons?|studio closed|thanksgiving|christmas|xmas|new year'?s?)\b/i

export function isDayOffTitle(title: string): boolean {
    return DAY_OFF.test(title.trim())
}

const toMin = (hhmm: string) => {
    const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
    return (h % 24) * 60 + m
}

/** Splits [startIso, endIso) into per-studio-date blocks. */
function timedBlocks(startIso: string, endIso: string): BusyBlock[] {
    const s = isoToStudioWallClock(startIso)
    const e = isoToStudioWallClock(endIso)
    if (!s.localDate || !e.localDate || Date.parse(endIso) <= Date.parse(startIso)) return []
    const blocks: BusyBlock[] = []
    let date = s.localDate
    let from = toMin(s.localTime)
    // A guard against a runaway multi-week event: at most 31 days.
    for (let i = 0; i < 31 && date <= e.localDate; i++) {
        const to = date === e.localDate ? toMin(e.localTime) : 1440
        if (to > from) blocks.push({ date, start: from, end: to, allDay: false })
        date = shiftDateStr(date, 1)
        from = 0
    }
    return blocks
}

/** Every date of an all-day event (Google's end date is exclusive). */
function allDayBlocks(startDate: string, endDate: string | null | undefined): BusyBlock[] {
    const last = endDate && endDate > startDate ? shiftDateStr(endDate, -1) : startDate
    const blocks: BusyBlock[] = []
    for (let date = startDate, i = 0; date <= last && i < 31; date = shiftDateStr(date, 1), i++) {
        blocks.push({ date, start: 0, end: 1440, allDay: true })
    }
    return blocks
}

/**
 * Whether one calendar event is busy time, and when (studio dates and
 * minutes). `portalAccount` is the service account's email; `lessonEventIds`
 * the google_event_id of lesson rows.
 */
export function busyFromCalendarEvent(
    e: GoogleCalendarEvent,
    { portalAccount, lessonEventIds }: { portalAccount: string; lessonEventIds: ReadonlySet<string> },
): BusyVerdict {
    const none = (why: string): BusyVerdict => ({ blocks: [], why })
    if (e.status === 'cancelled') return none('cancelled')
    const byPortal = !!portalAccount && (e.creator?.email || '').toLowerCase() === portalAccount.toLowerCase()
    const marked = e.extendedProperties?.private?.[PORTAL_EVENT_MARKER.key] === PORTAL_EVENT_MARKER.value
    if (byPortal || marked || (e.id && lessonEventIds.has(e.id))) return none('lesson event')
    if (e.eventType === 'birthday') return none('birthday')
    if (e.eventType === 'workingLocation') return none('working location')
    const me = (e.attendees || []).find(a => a.self)
    if (me?.responseStatus === 'declined') return none('declined')

    const title = e.summary || ''
    const free = e.transparency === 'transparent'
    const outOfOffice = e.eventType === 'outOfOffice'

    if (e.start?.date) {
        if (!free || outOfOffice || isDayOffTitle(title)) {
            return { blocks: allDayBlocks(e.start.date, e.end?.date), why: !free ? 'all-day, marked busy' : outOfOffice ? 'out of office' : 'all-day, day off' }
        }
        return none('all-day, not a day off')
    }
    if (free && !outOfOffice) return none('marked free')
    const start = e.start?.dateTime
    const end = e.end?.dateTime
    if (!start || !end) return none('no time')
    return { blocks: timedBlocks(start, end), why: outOfOffice ? 'out of office' : 'timed event' }
}

/** The calendars to read: the studio calendar plus GOOGLE_BUSY_CALENDAR_IDS. */
export function busyCalendarIds(): string[] {
    const ids = [process.env.GOOGLE_CALENDAR_ID || 'primary']
    for (const raw of (process.env.GOOGLE_BUSY_CALENDAR_IDS || '').split(',')) {
        const id = raw.trim()
        if (id && !ids.includes(id)) ids.push(id)
    }
    return ids
}

export type CalendarBusyResult = {
    blocks: BusyBlock[]
    /** Calendars that could not be read (each also logged). */
    failed: string[]
}

type Lister = (calendarId: string, timeMinIso: string, timeMaxIso: string) => Promise<GoogleCalendarEvent[]>

const CACHE_MS = 60_000
type TaggedBlock = BusyBlock & { eventId: string }
const cache = new Map<string, { at: number; result: { blocks: TaggedBlock[]; failed: string[] } }>()

/**
 * Busy blocks from the calendars between two instants. Never throws: a
 * calendar that can't be read is listed in `failed` and logged, and the rest
 * still count. Cached for a minute per window, since one page can ask several
 * times (each pending move request re-checks its slot).
 */
export async function loadCalendarBusy(
    timeMinIso: string,
    timeMaxIso: string,
    { lessonEventIds, list }: { lessonEventIds: ReadonlySet<string>; list?: Lister },
): Promise<CalendarBusyResult> {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        return { blocks: [], failed: ['(Google Calendar is not set up here)'] }
    }
    const key = `${timeMinIso}|${timeMaxIso}`
    const hit = list ? undefined : cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) return withoutLessons(hit.result, lessonEventIds)

    const lister: Lister = list ?? ((calendarId, min, max) => listCalendarEvents(min, max, { calendarId, timeoutMs: 6000 }))
    const ids = busyCalendarIds()
    const portalAccount = process.env.GOOGLE_CLIENT_EMAIL || ''
    const blocks: TaggedBlock[] = []
    const failed: string[] = []
    await Promise.all(ids.map(async (id, i) => {
        const name = i === 0 ? 'studio calendar' : id
        try {
            for (const e of await lister(id, timeMinIso, timeMaxIso)) {
                // Lesson ids differ per caller, so they are taken out below.
                const v = busyFromCalendarEvent(e, { portalAccount, lessonEventIds: new Set() })
                for (const b of v.blocks) blocks.push({ ...b, eventId: e.id || '' })
            }
        } catch (err: any) {
            failed.push(name)
            console.error(`[calendar-busy] could not read the ${name}: ${err?.message ?? err}. Free slots leave it out (lessons and events still count).`)
        }
    }))
    const result = { blocks, failed }
    if (!list && failed.length === 0) cache.set(key, { at: Date.now(), result })
    return withoutLessons(result, lessonEventIds)
}

function withoutLessons(result: { blocks: TaggedBlock[]; failed: string[] }, lessonEventIds: ReadonlySet<string>): CalendarBusyResult {
    return {
        blocks: result.blocks
            .filter(b => !(b.eventId && lessonEventIds.has(b.eventId)))
            .map(({ date, start, end, allDay }) => ({ date, start, end, allDay })),
        failed: result.failed,
    }
}
