/**
 * Self-check for #1093 (lib/calendar-busy.ts): which Google Calendar events
 * block free slots, with made-up events. No network, no database.
 *
 *   npx tsx scripts/check_calendar_busy.ts
 */
import assert from 'node:assert/strict'
import { busyFromCalendarEvent, isDayOffTitle, loadCalendarBusy } from '../lib/calendar-busy'
import { PORTAL_EVENT_MARKER } from '../lib/google-calendar'

const portalAccount = 'portal@example.iam.gserviceaccount.com'
const opts = { portalAccount, lessonEventIds: new Set(['linked-lesson']) }
const timed = (summary: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
    ({ id: summary, summary, start: { dateTime: start }, end: { dateTime: end }, ...extra })
const allDay = (summary: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
    ({ id: summary, summary, start: { date: start }, end: { date: end }, ...extra })

// A personal appointment, 2:00-3:30pm EST on Tue Nov 24.
let v = busyFromCalendarEvent(timed('Dentist', '2026-11-24T14:00:00-05:00', '2026-11-24T15:30:00-05:00'), opts)
assert.deepEqual(v.blocks, [{ date: '2026-11-24', start: 840, end: 930, allDay: false }])

// The same given in UTC, or in Pacific time, lands on the same studio minutes.
v = busyFromCalendarEvent(timed('Dentist', '2026-11-24T19:00:00Z', '2026-11-24T20:30:00Z'), opts)
assert.deepEqual(v.blocks, [{ date: '2026-11-24', start: 840, end: 930, allDay: false }])
v = busyFromCalendarEvent(timed('Dentist', '2026-11-24T11:00:00-08:00', '2026-11-24T12:30:00-08:00'), opts)
assert.deepEqual(v.blocks, [{ date: '2026-11-24', start: 840, end: 930, allDay: false }])

// Past midnight: split over the two days.
v = busyFromCalendarEvent(timed('Late flight', '2026-11-24T22:30:00-05:00', '2026-11-25T01:00:00-05:00'), opts)
assert.deepEqual(v.blocks, [
    { date: '2026-11-24', start: 1350, end: 1440, allDay: false },
    { date: '2026-11-25', start: 0, end: 60, allDay: false },
])

// Lesson events never block: the portal made it, it carries the tag, or a lesson points at it.
assert.equal(busyFromCalendarEvent(timed('A - Piano Lesson', '2026-11-24T16:00:00-05:00', '2026-11-24T17:00:00-05:00', { creator: { email: portalAccount.toUpperCase() } }), opts).blocks.length, 0)
assert.equal(busyFromCalendarEvent(timed('A - Piano Lesson', '2026-11-24T16:00:00-05:00', '2026-11-24T17:00:00-05:00', { extendedProperties: { private: { [PORTAL_EVENT_MARKER.key]: PORTAL_EVENT_MARKER.value } } }), opts).blocks.length, 0)
assert.equal(busyFromCalendarEvent({ ...timed('Lesson', '2026-11-24T16:00:00-05:00', '2026-11-24T17:00:00-05:00'), id: 'linked-lesson' }, opts).blocks.length, 0)
// One he typed in by hand is his time, so it blocks.
assert.equal(busyFromCalendarEvent(timed('Extra - Piano Lesson', '2026-11-24T16:00:00-05:00', '2026-11-24T17:00:00-05:00', { creator: { email: 'someone@example.com' } }), opts).blocks.length, 1)

// Marked "Free", declined, birthdays and working location: no block.
assert.equal(busyFromCalendarEvent(timed('Optional webinar', '2026-11-24T14:00:00-05:00', '2026-11-24T15:00:00-05:00', { transparency: 'transparent' }), opts).blocks.length, 0)
assert.equal(busyFromCalendarEvent(timed('Meeting', '2026-11-24T14:00:00-05:00', '2026-11-24T15:00:00-05:00', { attendees: [{ self: true, responseStatus: 'declined' }] }), opts).blocks.length, 0)
assert.equal(busyFromCalendarEvent(timed('Meeting', '2026-11-24T14:00:00-05:00', '2026-11-24T15:00:00-05:00', { attendees: [{ self: true, responseStatus: 'accepted' }] }), opts).blocks.length, 1)
assert.equal(busyFromCalendarEvent(allDay('Birthday', '2026-11-24', '2026-11-25', { eventType: 'birthday' }), opts).blocks.length, 0)
assert.equal(busyFromCalendarEvent(allDay('Home', '2026-11-24', '2026-11-25', { eventType: 'workingLocation' }), opts).blocks.length, 0)
assert.equal(busyFromCalendarEvent(timed('Old', '2026-11-24T14:00:00-05:00', '2026-11-24T15:00:00-05:00', { status: 'cancelled' }), opts).blocks.length, 0)

// All-day events: Google makes them "Free" by default (transparent).
const free = { transparency: 'transparent' }
// A reminder or a birthday typed in by hand does not block.
assert.equal(busyFromCalendarEvent(allDay("Mom's birthday", '2026-11-24', '2026-11-25', free), opts).blocks.length, 0)
assert.equal(busyFromCalendarEvent(allDay('Pay rent', '2026-12-01', '2026-12-02', free), opts).blocks.length, 0)
// A day off blocks the whole day, even left "Free".
assert.deepEqual(busyFromCalendarEvent(allDay('Thanksgiving', '2026-11-26', '2026-11-27', free), opts).blocks, [{ date: '2026-11-26', start: 0, end: 1440, allDay: true }])
// Several days (Google's end date is the day after).
assert.deepEqual(busyFromCalendarEvent(allDay('Vacation in Taiwan', '2026-12-21', '2026-12-24', free), opts).blocks.map(b => b.date), ['2026-12-21', '2026-12-22', '2026-12-23'])
// Marked "Busy" on purpose: blocks whatever the title.
assert.equal(busyFromCalendarEvent(allDay('Recording day', '2026-11-28', '2026-11-29'), opts).blocks.length, 1)
// Out of office blocks.
assert.equal(busyFromCalendarEvent(allDay('Gone', '2026-11-28', '2026-11-29', { ...free, eventType: 'outOfOffice' }), opts).blocks.length, 1)

for (const t of ['Off', 'off', 'Day off', 'OFF - family', 'Away', 'Closed', 'Holiday', 'Christmas Eve', 'Xmas', "New Year's Day", 'No lessons', 'No lesson today', 'Travelling', 'Traveling to NYC', 'Trip', 'Out of office', 'OOO', 'Sick', 'Studio closed', 'Time off']) {
    assert.ok(isDayOffTitle(t), `should be a day off: ${t}`)
}
for (const t of ["Mom's birthday", 'Pay rent', 'Recital practice', 'Offer deadline', 'Coffee', 'Take out trash', 'Payday', 'Kickoff']) {
    assert.ok(!isDayOffTitle(t), `should not be a day off: ${t}`)
}

// Loading: lesson events of the caller are taken out, and an unreadable calendar is left out (logged).
async function checkLoading() {
    process.env.GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || portalAccount
    process.env.GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY || 'not-a-real-key'
    process.env.GOOGLE_BUSY_CALENDAR_IDS = 'personal@example.com, broken@example.com'
    const quiet = console.error
    const logged: string[] = []
    console.error = (...a: unknown[]) => { logged.push(a.join(' ')) }
    const loaded = await loadCalendarBusy('2026-11-24T05:00:00Z', '2026-11-25T05:00:00Z', {
        lessonEventIds: new Set(['lesson-evt']),
        list: async (id) => {
            if (id === 'broken@example.com') throw new Error('403 Forbidden')
            if (id === 'personal@example.com') return [timed('Dentist', '2026-11-24T14:00:00-05:00', '2026-11-24T15:30:00-05:00') as any]
            return [{ ...timed('Lesson by hand', '2026-11-24T16:00:00-05:00', '2026-11-24T17:00:00-05:00'), id: 'lesson-evt' } as any,
                timed('Call', '2026-11-24T18:00:00-05:00', '2026-11-24T18:30:00-05:00') as any]
        },
    })
    console.error = quiet
    assert.deepEqual(loaded.failed, ['broken@example.com'])
    assert.deepEqual(loaded.blocks.map(b => `${b.date} ${b.start}-${b.end}`).sort(), ['2026-11-24 1080-1110', '2026-11-24 840-930'])
    assert.ok(logged.some(l => l.includes('broken@example.com')))
}

checkLoading().then(() => console.log('check_calendar_busy: all good'))
