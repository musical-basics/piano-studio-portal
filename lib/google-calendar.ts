import { google, type calendar_v3 } from 'googleapis'
import { STUDIO_TZ } from '@/lib/studio-timezone'

const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'), // Fixes newline issues in Vercel/Env
    scopes: ['https://www.googleapis.com/auth/calendar'],
})

const calendar = google.calendar({ version: 'v3', auth })

const calendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary'

export type GoogleCalendarEvent = calendar_v3.Schema$Event

/** The description every lesson event the portal creates carries. */
export const PORTAL_EVENT_DESCRIPTION = 'Lesson scheduled via Studio Portal.'

/**
 * A hidden tag on every lesson event the portal creates (since #925), so the
 * morning calendar check (lib/calendar-sync.ts) can tell them apart from
 * Lionel's own events with certainty. Not shown anywhere on the calendar.
 */
export const PORTAL_EVENT_MARKER = { key: 'studioPortal', value: 'lesson' } as const

export function lessonEventSummary(studentName: string): string {
    return `${studentName} - Piano Lesson`
}

// Google needs both ends as studio wall-clock strings to pair with timeZone
// STUDIO_TZ. Going through a Date and toISOString() would hand it the
// UTC instant instead, which then gets re-read as studio time and stretches the
// event by the whole UTC offset -- so add the minutes to the wall clock directly.
export function addMinutesToWallClock(date: string, time: string, minutes: number) {
    const [h, m] = time.split(':').map(Number)
    const total = h * 60 + m + minutes
    const dayOffset = Math.floor(total / 1440)
    const mins = ((total % 1440) + 1440) % 1440

    let endDate = date
    if (dayOffset !== 0) {
        // Midnight rollover: shift the calendar date without touching the clock.
        const d = new Date(`${date}T12:00:00Z`)
        d.setUTCDate(d.getUTCDate() + dayOffset)
        endDate = d.toISOString().slice(0, 10)
    }

    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    return `${endDate}T${hh}:${mm}:00`
}

/** A lesson event's start and end, as Google takes them (studio wall clock + zone). */
export function lessonEventTimes(date: string, time: string, durationMinutes: number) {
    const hhmm = time.slice(0, 5)
    return {
        start: { dateTime: `${date}T${hhmm}:00`, timeZone: STUDIO_TZ },
        end: { dateTime: addMinutesToWallClock(date, hhmm, durationMinutes), timeZone: STUDIO_TZ },
    }
}

/** Exactly what a new lesson event looks like on the studio calendar. */
export function buildLessonEvent(studentName: string, date: string, time: string, durationMinutes: number): GoogleCalendarEvent {
    return {
        summary: lessonEventSummary(studentName),
        description: PORTAL_EVENT_DESCRIPTION,
        ...lessonEventTimes(date, time, durationMinutes),
        colorId: '11', // 11 = Red (Tomato)
        extendedProperties: { private: { [PORTAL_EVENT_MARKER.key]: PORTAL_EVENT_MARKER.value } },
    }
}

function googleStatus(error: any): number | undefined {
    return error?.code ?? error?.response?.status
}

const isGone = (error: unknown) => googleStatus(error) === 404 || googleStatus(error) === 410

/** Creates a lesson event and returns its id. Throws Google's error. */
export async function insertLessonEvent(studentName: string, date: string, time: string, durationMinutes: number): Promise<string> {
    const response = await calendar.events.insert({
        calendarId: calendarId(),
        requestBody: buildLessonEvent(studentName, date, time, durationMinutes),
    })
    if (!response.data.id) throw new Error('Google created the event but returned no id')
    return response.data.id
}

/**
 * Moves an event to a lesson's slot, changing only its start and end. 'missing'
 * when the event is gone from the calendar; any other Google error is thrown.
 */
export async function patchLessonEventTime(
    eventId: string,
    date: string,
    time: string,
    durationMinutes: number,
): Promise<'updated' | 'missing'> {
    try {
        const response = await calendar.events.patch({
            calendarId: calendarId(),
            eventId,
            requestBody: lessonEventTimes(date, time, durationMinutes),
        })
        // A patch on an event deleted from the calendar can still succeed but
        // leaves it deleted; treat that the same as not found.
        return response.data.status === 'cancelled' ? 'missing' : 'updated'
    } catch (error) {
        if (isGone(error)) return 'missing'
        throw error
    }
}

/** Deletes an event; already gone counts as done. Any other Google error is thrown. */
export async function removeCalendarEvent(eventId: string): Promise<void> {
    try {
        await calendar.events.delete({ calendarId: calendarId(), eventId })
    } catch (error) {
        if (isGone(error)) return
        throw error
    }
}

/** One event by id, or null when it is gone (deleted or cancelled). Other errors are thrown. */
export async function getCalendarEvent(eventId: string): Promise<GoogleCalendarEvent | null> {
    try {
        const response = await calendar.events.get({ calendarId: calendarId(), eventId })
        return response.data.status === 'cancelled' ? null : response.data
    } catch (error) {
        if (isGone(error)) return null
        throw error
    }
}

/**
 * Every live event between two instants (recurring ones expanded). Throws Google's error.
 * Another calendar the service account can read may be named (#1093's busy times).
 */
export async function listCalendarEvents(
    timeMinIso: string,
    timeMaxIso: string,
    { calendarId: otherCalendar, timeoutMs }: { calendarId?: string; timeoutMs?: number } = {},
): Promise<GoogleCalendarEvent[]> {
    const events: GoogleCalendarEvent[] = []
    let pageToken: string | undefined
    do {
        const response = await calendar.events.list({
            calendarId: otherCalendar || calendarId(),
            timeMin: timeMinIso,
            timeMax: timeMaxIso,
            singleEvents: true,
            maxResults: 2500,
            pageToken,
        }, timeoutMs ? { timeout: timeoutMs } : {})
        events.push(...(response.data.items ?? []))
        pageToken = response.data.nextPageToken ?? undefined
    } while (pageToken)
    return events.filter(e => e.status !== 'cancelled')
}

export async function createGoogleCalendarEvent(
    studentName: string,
    date: string, // YYYY-MM-DD
    time: string, // HH:MM
    durationMinutes: number
) {
    try {
        const id = await insertLessonEvent(studentName, date, time, durationMinutes)
        console.log('✅ Google Event Created:', id)
        return id // We return this so we can save it to Supabase
    } catch (error) {
        console.error('❌ Google Calendar Error:', error)
        return null // Return null so the app doesn't crash if Google fails
    }
}

/**
 * Move a lesson's existing event to a new slot. Only the start and end change, so
 * anything edited on the event by hand (title, notes, color) stays.
 *
 * Returns 'updated' when Google has the new time, 'missing' when the event is gone
 * (deleted on the calendar), so the caller can create a fresh one, and 'failed' for
 * anything else, where creating another event could leave a duplicate.
 */
export async function updateGoogleCalendarEvent(
    eventId: string,
    date: string, // YYYY-MM-DD, studio wall clock
    time: string, // HH:MM, studio wall clock
    durationMinutes: number,
): Promise<'updated' | 'missing' | 'failed'> {
    try {
        return await patchLessonEventTime(eventId, date, time, durationMinutes)
    } catch (error: any) {
        console.error('❌ Google Calendar update error:', error?.message || error)
        return 'failed'
    }
}

/**
 * Remove a lesson's event from the studio calendar. Returns true when the event
 * is gone afterwards, including when Google says it was already deleted (404/410),
 * so callers can treat a repeat delete as success.
 */
export async function deleteGoogleCalendarEvent(eventId: string): Promise<boolean> {
    try {
        await removeCalendarEvent(eventId)
        return true
    } catch (error: any) {
        console.error('❌ Google Calendar delete error:', error?.message || error)
        return false
    }
}
