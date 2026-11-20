/**
 * Free lesson slots in the next few days, for booking a make-up (#789).
 *
 * Reuses the studio's own availability: the hours Lionel set per weekday in
 * Profile Settings (profiles.available_hours on the admin, studio wall-clock),
 * minus every lesson that isn't cancelled (any student), every event
 * (consultations, recitals, ...) and, since #1093, Lionel's own Google Calendar
 * events (lib/calendar-busy.ts: a personal appointment, an all-day "Off" or
 * "Thanksgiving"; lesson events are lessons already). All in studio (Eastern)
 * time, regardless of the server's clock, unlike the older student make-up
 * finder. A calendar that can't be read is logged and left out.
 */

import type { DbClient } from '@/lib/supabase/admin'
import { isoToStudioWallClock, shiftDateStr, studioToday, studioTzAbbr, studioWallClockToISO, weekdayOfDateStr } from '@/lib/studio-timezone'
import { loadCalendarBusy } from '@/lib/calendar-busy'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** Slots start on the hour or half hour. */
const STEP_MINUTES = 30
/** A slot today must start at least this long from now. */
const MIN_NOTICE_MINUTES = 60

export type FreeSlot = {
    date: string
    /** HH:MM studio time */
    time: string
    /** "Thu, Nov 20 at 4:30pm EST" */
    label: string
}

type DayHours = { day: string; start: string; end: string; enabled: boolean }

const toMin = (hhmm: string) => {
    const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
    return h * 60 + m
}
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

function slotLabel(date: string, time: string): string {
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const min = toMin(time)
    const h = Math.floor(min / 60)
    return `${day} at ${h % 12 || 12}:${time.slice(3, 5)}${h >= 12 ? 'pm' : 'am'} ${studioTzAbbr(date)}`
}

/**
 * Every free start time from `fromDate` (default today) through `days - 1` days
 * after it (studio dates) that fits a lesson of `duration` minutes inside the set
 * hours without touching another lesson or event. Days before today give nothing.
 */
export async function findFreeSlotsCore({
    client,
    duration,
    days = 7,
    ignoreLessonIds = [],
    fromDate,
    minNoticeMinutes = MIN_NOTICE_MINUTES,
    calendar = true,
}: {
    client: DbClient
    duration: number
    days?: number
    /** Lessons not to count as busy (the missed lesson itself, which is about to go). */
    ignoreLessonIds?: string[]
    /** First studio date to look at (YYYY-MM-DD); default today. */
    fromDate?: string
    /** A slot today must start at least this many minutes from now (default 60). */
    minNoticeMinutes?: number
    /** Also skip Lionel's Google Calendar events (#1093). Default true. */
    calendar?: boolean
}): Promise<{ slots: FreeSlot[] } | { error: string }> {
    const { data: admin, error: adminError } = await client
        .from('profiles')
        .select('available_hours')
        .eq('role', 'admin')
        .limit(1)
        .single()
    if (adminError) return { error: `Could not read your available hours: ${adminError.message}` }
    const hours = (Array.isArray(admin?.available_hours) ? admin.available_hours : []) as DayHours[]
    if (!hours.some(h => h.enabled)) return { error: 'No available hours are set (Profile Settings), so there are no free slots to offer.' }

    const today = studioToday()
    const start = fromDate && fromDate > today ? fromDate : today
    const last = shiftDateStr(fromDate || today, days - 1)
    if (last < start) return { slots: [] }

    const busy = new Map<string, Array<[number, number]>>()
    const addBusy = (date: string, start: number, end: number) => {
        if (!busy.has(date)) busy.set(date, [])
        busy.get(date)!.push([start, end])
    }

    const { data: lessons, error: lessonsError } = await client
        .from('lessons')
        .select('id, date, time, duration, status, google_event_id')
        .gte('date', start)
        .lte('date', last)
        .neq('status', 'cancelled')
    if (lessonsError) return { error: `Could not read the schedule: ${lessonsError.message}` }
    // A lesson's own calendar event is never busy time on top of it (nor for
    // the lesson being moved, which is ignored here).
    const lessonEventIds = new Set<string>()
    for (const l of lessons || []) {
        if (l.google_event_id) lessonEventIds.add(String(l.google_event_id))
        if (ignoreLessonIds.includes(l.id)) continue
        const start = toMin(String(l.time))
        addBusy(l.date, start, start + (l.duration || 60))
    }

    const { data: events, error: eventsError } = await client
        .from('events')
        .select('start_time, duration_minutes, duration')
        .gte('start_time', studioWallClockToISO(shiftDateStr(start, -1), '00:00'))
        .lt('start_time', studioWallClockToISO(shiftDateStr(last, 1), '00:00'))
    if (eventsError) return { error: `Could not read events: ${eventsError.message}` }
    for (const e of events || []) {
        const { localDate, localTime } = isoToStudioWallClock(e.start_time)
        if (!localDate) continue
        const start = toMin(localTime)
        const len = e.duration_minutes || e.duration || 60
        addBusy(localDate, start, start + len)
        // An event running past midnight also blocks the start of the next day.
        if (start + len > 1440) addBusy(shiftDateStr(localDate, 1), 0, start + len - 1440)
    }

    if (calendar) {
        const found = await loadCalendarBusy(
            studioWallClockToISO(start, '00:00'),
            studioWallClockToISO(shiftDateStr(last, 1), '00:00'),
            { lessonEventIds },
        )
        for (const b of found.blocks) addBusy(b.date, b.start, b.end)
    }

    const now = isoToStudioWallClock(new Date().toISOString())
    const earliestToday = toMin(now.localTime) + minNoticeMinutes

    const slots: FreeSlot[] = []
    for (let date = start; date <= last; date = shiftDateStr(date, 1)) {
        const set = hours.find(h => h.enabled && h.day === WEEKDAYS[weekdayOfDateStr(date)])
        if (!set) continue
        const open = toMin(set.start)
        const close = toMin(set.end)
        const taken = busy.get(date) || []
        // First start on the hour or half hour at or after opening.
        let from = Math.ceil(open / STEP_MINUTES) * STEP_MINUTES
        for (; from + duration <= close; from += STEP_MINUTES) {
            if (date === today && from < earliestToday) continue
            const end = from + duration
            if (taken.some(([s, e]) => from < e && end > s)) continue
            const time = toHHMM(from)
            slots.push({ date, time, label: slotLabel(date, time) })
        }
    }
    return { slots }
}
