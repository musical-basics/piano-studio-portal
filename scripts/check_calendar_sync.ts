/**
 * Self-check for the morning calendar check (#925, lib/calendar-sync.ts): the
 * comparison rules (missing, wrong time, leftover, linking a lost event, never
 * touching events the portal did not make), carrying out a plan one item at a
 * time, the dry run, and the email. Fake calendar and fake database: nothing
 * touches Google or prod.
 *
 *   npx tsx scripts/check_calendar_sync.ts
 */
import assert from 'node:assert/strict'
import {
    MAX_DELETES_PER_RUN,
    applyCalendarSync,
    buildCalendarSyncEmail,
    expectedTimes,
    planCalendarSync,
    portalOwnership,
    runCalendarSync,
    timesMatch,
    toSyncEvent,
    type CalendarPort,
    type LinkedLookup,
    type SyncAction,
    type SyncEvent,
    type SyncInput,
    type SyncLesson,
    type SyncResult,
} from '../lib/calendar-sync'
import { PORTAL_EVENT_DESCRIPTION, PORTAL_EVENT_MARKER, buildLessonEvent } from '../lib/google-calendar'
import { studioWallClockToISO } from '../lib/studio-timezone'
import { summarizeJobRun } from '../lib/scheduled-jobs'
import type { DbClient } from '../lib/supabase/admin'

const SA = 'portal@studio.iam.gserviceaccount.com'
const WINDOW = { from: '2026-11-19', to: '2026-12-03' }

let n = 0
function lesson(over: Partial<SyncLesson> = {}): SyncLesson {
    n++
    return { id: `l${n}`, studentName: 'Amy Example', date: '2026-11-22', time: '17:30', duration: 30, status: 'scheduled', eventId: null, ...over }
}

/** A portal-made event at a studio wall-clock slot. */
function event(over: Partial<SyncEvent> & { date?: string; time?: string; minutes?: number } = {}): SyncEvent {
    n++
    const { date = '2026-11-22', time = '17:30', minutes = 30, ...rest } = over
    const t = expectedTimes({ date, time, duration: minutes })
    return {
        id: `e${n}`,
        summary: 'Amy Example - Piano Lesson',
        description: PORTAL_EVENT_DESCRIPTION,
        start: t.start,
        end: t.end,
        allDayDate: null,
        createdByPortal: true,
        marked: false,
        ...rest,
    }
}

function input(lessons: SyncLesson[], windowEvents: SyncEvent[], linked: [string, LinkedLookup][] = []): SyncInput {
    return { window: WINDOW, lessons, windowEvents, linked: new Map(linked) }
}

const kinds = (actions: SyncAction[]) => actions.map(a => a.kind).sort()

function fakePort(over: Partial<CalendarPort> = {}) {
    const calls: string[] = []
    let made = 0
    const port: CalendarPort = {
        portalAccount: SA,
        listEvents: async () => [],
        getEvent: async () => null,
        createEvent: async (name, date, time, duration) => { calls.push(`create ${name} ${date} ${time} ${duration}`); return `new${++made}` },
        retimeEvent: async (id, date, time, duration) => { calls.push(`retime ${id} ${date} ${time} ${duration}`); return 'updated' },
        deleteEvent: async id => { calls.push(`delete ${id}`) },
        ...over,
    }
    return { port, calls }
}

async function main() {
    // ---------------------------------------------------------- times ---
    // Eastern wall clock to instants, in winter and summer, and past midnight.
    assert.deepEqual(expectedTimes({ date: '2026-11-22', time: '17:30', duration: 30 }),
        { start: '2026-11-22T22:30:00.000Z', end: '2026-11-22T23:00:00.000Z' })
    assert.deepEqual(expectedTimes({ date: '2026-07-15', time: '17:30', duration: 60 }),
        { start: '2026-07-15T21:30:00.000Z', end: '2026-07-15T22:30:00.000Z' })
    assert.deepEqual(expectedTimes({ date: '2026-11-22', time: '23:30', duration: 60 }),
        { start: '2026-11-23T04:30:00.000Z', end: '2026-11-23T05:30:00.000Z' })

    // A Google event as Google returns it (offset form) matches its lesson.
    const g = toSyncEvent({
        id: 'abc', summary: 'Amy Example - Piano Lesson', description: PORTAL_EVENT_DESCRIPTION,
        start: { dateTime: '2026-11-22T17:30:00-05:00', timeZone: 'America/New_York' },
        end: { dateTime: '2026-11-22T18:00:00-05:00', timeZone: 'America/New_York' },
        creator: { email: SA.toUpperCase() },
    }, SA)
    assert.equal(g.createdByPortal, true, 'creator email compared without case')
    assert.equal(g.marked, false)
    assert.ok(timesMatch(g, { date: '2026-11-22', time: '17:30', duration: 30 }))
    assert.ok(!timesMatch(g, { date: '2026-11-22', time: '17:30', duration: 60 }), 'a wrong end is a mismatch')
    assert.ok(!timesMatch(g, { date: '2026-11-22', time: '17:45', duration: 30 }), 'a wrong start is a mismatch')
    const allDay = toSyncEvent({ id: 'x', start: { date: '2026-11-22' }, end: { date: '2026-11-23' } }, SA)
    assert.equal(allDay.start, null)
    assert.equal(allDay.allDayDate, '2026-11-22')
    assert.ok(!timesMatch(allDay, { date: '2026-11-22', time: '17:30', duration: 30 }))
    assert.equal(toSyncEvent({ id: 'x', creator: { email: SA } }, '').createdByPortal, false, 'no service account known: never ours')

    // A fresh lesson event: same title, text, color and times as before, plus the hidden tag.
    const built = buildLessonEvent('Amy Example', '2026-11-22', '17:30', 30)
    assert.equal(built.summary, 'Amy Example - Piano Lesson')
    assert.equal(built.description, PORTAL_EVENT_DESCRIPTION)
    assert.equal(built.colorId, '11')
    assert.deepEqual(built.start, { dateTime: '2026-11-22T17:30:00', timeZone: 'America/New_York' })
    assert.deepEqual(built.end, { dateTime: '2026-11-22T18:00:00', timeZone: 'America/New_York' })
    assert.equal(built.extendedProperties?.private?.[PORTAL_EVENT_MARKER.key], PORTAL_EVENT_MARKER.value)
    assert.deepEqual(buildLessonEvent('A', '2026-11-22', '17:30:00', 30).start, built.start, 'HH:MM:SS from the database works too')
    const tagged = toSyncEvent({ ...built, id: 'y', creator: { email: SA } }, SA)
    assert.equal(tagged.marked, true)

    // ------------------------------------------------------ ownership ---
    assert.equal(portalOwnership(event()), 'certain')
    assert.equal(portalOwnership(event({ marked: true, summary: 'Renamed by hand', description: '' })), 'certain', 'tag + portal account')
    assert.equal(portalOwnership(event({ description: 'notes Lionel typed' })), 'looks-like', 'portal title, description edited')
    assert.equal(portalOwnership(event({ createdByPortal: false })), 'looks-like', 'portal title, made by someone else')
    assert.equal(portalOwnership(event({ createdByPortal: false, marked: true })), 'looks-like', 'a copied tag alone is not enough')
    assert.equal(portalOwnership(event({ summary: 'Dentist', description: '', createdByPortal: false })), 'not-ours')

    // ---------------------------------------------------------- plans ---
    // All matching: nothing to do.
    {
        const e = event()
        const p = planCalendarSync(input([lesson({ eventId: e.id })], [e]))
        assert.equal(p.checked, 1)
        assert.equal(p.matched, 1)
        assert.deepEqual(p.actions, [])
    }

    // Missing: no id saved, or the event deleted from the calendar.
    {
        const a = lesson()
        const b = lesson({ eventId: 'gone' })
        const p = planCalendarSync(input([a, b], [], [['gone', null]]))
        assert.deepEqual(p.actions.map(x => x.kind === 'create' && [x.lesson.id, x.why]), [[a.id, 'no-event'], [b.id, 'event-gone']])
    }

    // Wrong time: the old 7-8 hour end, and an event on another day (outside the window).
    {
        const long = event({ minutes: 30 + 8 * 60 })
        const elsewhere = event({ date: '2026-12-20' })
        const a = lesson({ eventId: long.id })
        const b = lesson({ eventId: elsewhere.id, date: '2026-11-24', time: '13:15' })
        const p = planCalendarSync(input([a, b], [long], [[elsewhere.id, elsewhere]]))
        assert.deepEqual(kinds(p.actions), ['retime', 'retime'])
        assert.equal(p.matched, 0)
    }

    // A Google error reading one lesson's event is listed; the others still get planned.
    {
        const a = lesson({ eventId: 'broken' })
        const b = lesson()
        const p = planCalendarSync(input([a, b], [], [['broken', { error: 'Backend Error' }]]))
        assert.deepEqual(kinds(p.actions), ['create', 'error'])
        const err = p.actions.find(x => x.kind === 'error')!
        assert.ok(err.kind === 'error' && /Backend Error/.test(err.message))
    }

    // Leftover: a portal event no lesson points to is deleted; Lionel's own events are never touched.
    {
        const leftover = event({ date: '2026-11-25' })
        const lookalike = event({ date: '2026-11-26', createdByPortal: false })
        const edited = event({ date: '2026-11-27', description: 'moved by hand' })
        const mine = event({ summary: 'Dinner with friends', description: '', createdByPortal: false })
        const p = planCalendarSync(input([], [leftover, lookalike, edited, mine]))
        assert.deepEqual(p.actions.filter(x => x.kind === 'delete').map(x => x.kind === 'delete' && x.event.id), [leftover.id])
        assert.deepEqual(p.actions.filter(x => x.kind === 'leave').map(x => x.kind === 'leave' && x.event.id).sort(), [lookalike.id, edited.id].sort())
        assert.ok(!p.actions.some(x => 'event' in x && x.event.id === mine.id), 'personal event never listed')
    }

    // A lesson that lost its event id takes its own unlinked event back instead of a duplicate:
    // exact start first, else the same day (and then its time is fixed).
    {
        const exact = event()
        const sameDay = event({ date: '2026-11-24', time: '09:00', summary: 'Ben Example - Piano Lesson' })
        const other = event({ summary: 'Someone Else - Piano Lesson', date: '2026-11-24', time: '13:15' })
        const a = lesson()
        const b = lesson({ studentName: 'Ben Example', date: '2026-11-24', time: '13:15' })
        const p = planCalendarSync(input([a, b], [exact, sameDay, other]))
        const links = p.actions.filter(x => x.kind === 'link').map(x => x.kind === 'link' && [x.lesson.id, x.event.id, x.retime])
        assert.deepEqual(links, [[a.id, exact.id, false], [b.id, sameDay.id, true]])
        // Another student's event at the very same time is not taken: it is a leftover.
        assert.deepEqual(p.actions.filter(x => x.kind === 'delete').map(x => x.kind === 'delete' && x.event.id), [other.id])
        assert.ok(!p.actions.some(x => x.kind === 'create'))
    }

    // Two lessons pointing at one event: the lesson it matches keeps it, the other gets its own.
    {
        const e = event({ date: '2026-11-24', time: '13:15' })
        const wrong = lesson({ eventId: e.id })
        const right = lesson({ eventId: e.id, date: '2026-11-24', time: '13:15' })
        const p = planCalendarSync(input([wrong, right], [e]))
        assert.equal(p.matched, 1)
        assert.deepEqual(p.actions.map(x => x.kind === 'create' && [x.lesson.id, x.why]), [[wrong.id, 'event-shared']])
    }

    // Logged lessons: their events are theirs (never leftovers), and an unlinked event a logged
    // lesson with no event could own is left alone, not deleted.
    {
        const linkedDone = event({ time: '09:00' })
        const unlinked = event({ time: '10:00' })
        const done = lesson({ status: 'completed', time: '09:00', eventId: linkedDone.id })
        const doneNoEvent = lesson({ status: 'completed', time: '10:00' })
        const p = planCalendarSync(input([done, doneNoEvent], [linkedDone, unlinked]))
        assert.equal(p.checked, 0, 'only scheduled lessons are checked')
        assert.deepEqual(p.actions.map(x => x.kind === 'leave' && x.event.id), [unlinked.id])
    }

    // Too many leftovers at once: none deleted, all listed.
    {
        const many = Array.from({ length: MAX_DELETES_PER_RUN + 1 }, (_, i) => event({ date: `2026-11-2${i % 7}`, time: `1${i}:00` }))
        const p = planCalendarSync(input([], many))
        assert.ok(!p.actions.some(x => x.kind === 'delete'))
        assert.equal(p.actions.filter(x => x.kind === 'leave').length, many.length)
        const few = planCalendarSync(input([], many.slice(0, MAX_DELETES_PER_RUN)))
        assert.equal(few.actions.filter(x => x.kind === 'delete').length, MAX_DELETES_PER_RUN)
    }

    // A lesson moved beyond the window whose event stayed inside it: the event follows its lesson.
    {
        const e = event({ date: '2026-11-25' })
        const moved = lesson({ eventId: e.id, date: '2026-12-10' })
        const p = planCalendarSync(input([moved], [e]))
        assert.equal(p.checked, 0)
        assert.deepEqual(p.actions.map(x => x.kind === 'retime' && x.lesson.id), [moved.id])
        // The same event on its lesson's day: nothing to do.
        assert.deepEqual(planCalendarSync(input([lesson({ eventId: e.id, date: '2026-11-25' })], [e])).actions, [])
    }

    // ---------------------------------------------------------- apply ---
    {
        const e1 = event({ minutes: 480 })
        const gone = event({ date: '2026-11-24', time: '18:00' })
        const left = event({ date: '2026-11-25' })
        const look = event({ date: '2026-11-26', createdByPortal: false })
        const a = lesson({ eventId: e1.id })
        const b = lesson({ studentName: 'Ben Example', date: '2026-11-24', eventId: gone.id })
        const c = lesson({ studentName: 'Cara Example', date: '2026-11-26' })
        const plan = planCalendarSync(input([a, b, c], [e1, gone, left, look]))
        assert.deepEqual(kinds(plan.actions), ['create', 'delete', 'leave', 'retime', 'retime'])

        const saved: string[] = []
        const { port, calls } = fakePort({
            // b's event vanishes between reading and fixing: a new one is made instead.
            retimeEvent: async (id, date, time, duration) => {
                calls.push(`retime ${id} ${date} ${time} ${duration}`)
                return id === gone.id ? 'missing' : 'updated'
            },
        })
        const results = await applyCalendarSync(plan, port, async (lessonId, eventId) => { saved.push(`${lessonId}=${eventId}`) })
        assert.ok(results.filter(r => r.kind !== 'leave').every(r => r.done && !r.error))
        assert.ok(calls.includes(`retime ${e1.id} 2026-11-22 17:30 30`))
        assert.ok(calls.includes('create Ben Example 2026-11-24 17:30 30'))
        assert.ok(calls.includes('create Cara Example 2026-11-26 17:30 30'))
        assert.ok(calls.includes(`delete ${left.id}`))
        assert.ok(!calls.some(x => x.includes(look.id)), 'the look-alike is never touched')
        assert.deepEqual(saved.sort(), [`${b.id}=new1`, `${c.id}=new2`].sort())
        assert.ok(results.find(r => r.kind === 'retime' && r.lesson.id === b.id)?.recreated)

        // One failure is listed and the rest still happen.
        const { port: flaky, calls: flakyCalls } = fakePort({
            createEvent: async name => { if (name === 'Cara Example') throw new Error('Rate Limit Exceeded'); return 'ok1' },
            deleteEvent: async () => { throw new Error('Forbidden') },
        })
        const r2 = await applyCalendarSync(plan, flaky, async () => {})
        assert.equal(r2.length, plan.actions.length)
        assert.match(r2.find(r => r.kind === 'create')!.error!, /Rate Limit Exceeded/)
        assert.match(r2.find(r => r.kind === 'delete')!.error!, /Forbidden/)
        assert.ok(flakyCalls.some(x => x.startsWith(`retime ${e1.id}`)), 'later items still ran')

        // Made but not saved: said so (tomorrow's run links it back by name and time).
        const r3 = await applyCalendarSync({ ...plan, actions: plan.actions.filter(x => x.kind === 'create') }, fakePort().port, async () => { throw new Error('db down') })
        assert.match(r3[0].error!, /not saved on the lesson.*db down/)

        // Delete re-checks ownership right before deleting.
        const { port: guard, calls: guardCalls } = fakePort()
        const r4 = await applyCalendarSync({ ...plan, actions: [{ kind: 'delete', event: look }] }, guard, async () => {})
        assert.ok(r4[0].error && guardCalls.length === 0)

        // ------------------------------------------------------ email ---
        const email = buildCalendarSyncEmail(results)!
        assert.equal(email.subject, 'Calendar check: fixed 4 events, 1 to check')
        assert.match(email.html, /Fixed the time: Sun, Nov 22, 5:30pm EST, Amy Example \(30 min\) \(was 5:30pm to 1:30am the next day\)/)
        assert.match(email.html, /Removed a leftover event/)
        assert.match(email.html, /Left alone, please check/)
        const failedEmail = buildCalendarSyncEmail(r2)!
        assert.match(failedEmail.subject, /2 problems/)
        assert.match(failedEmail.html, /Could not fix[\s\S]*Add the missing event: Thu, Nov 26, 5:30pm EST, Cara Example \(30 min\): Rate Limit Exceeded/)
        assert.equal(buildCalendarSyncEmail([]), null, 'nothing to say on a clean morning')
        const tricky: SyncResult = { kind: 'create', why: 'no-event', lesson: lesson({ studentName: 'A <b>' }), done: true }
        assert.match(buildCalendarSyncEmail([tricky])!.html, /A &lt;b&gt;/)
        for (const text of [email.subject, email.html, email.footer, failedEmail.html]) assert.ok(!text.includes(String.fromCharCode(0x2014)), 'no em dashes')
    }

    // ------------------------------------------------- run (dry and real) ---
    {
        const today = '2026-11-19'
        const rows = [
            { id: 'r1', student_id: 's1', date: '2026-11-22', time: '17:30:00', duration: 30, status: 'scheduled', google_event_id: 'g1' },
            { id: 'r2', student_id: 's2', date: '2026-11-24', time: '13:15:00', duration: null, status: 'scheduled', google_event_id: null },
            { id: 'r3', student_id: 's1', date: '2026-12-25', time: '10:00:00', duration: 30, status: 'scheduled', google_event_id: 'g3' },
        ]
        const profiles = [{ id: 's1', name: 'Amy Example', lesson_duration: 30 }, { id: 's2', name: null, lesson_duration: 45 }]
        const updates: string[] = []
        const db = fakeDb({ lessons: rows, profiles }, updates)
        const gEvent = (id: string, start: string, end: string, summary = 'Amy Example - Piano Lesson') => ({
            id, summary, description: PORTAL_EVENT_DESCRIPTION, creator: { email: SA },
            start: { dateTime: start, timeZone: 'America/New_York' }, end: { dateTime: end, timeZone: 'America/New_York' },
        })
        const listed = [
            gEvent('g1', '2026-11-22T17:30:00-05:00', '2026-11-23T01:30:00-05:00'), // 8 hours too long
            gEvent('g3', '2026-11-30T10:00:00-05:00', '2026-11-30T10:30:00-05:00'), // r3's event, left on an old date
            gEvent('g9', '2026-11-28T09:00:00-05:00', '2026-11-28T09:30:00-05:00', 'Gone Student - Piano Lesson'), // no lesson
            { id: 'p1', summary: 'Haircut', creator: { email: 'someone@example.com' }, start: { dateTime: '2026-11-28T09:00:00-05:00' }, end: { dateTime: '2026-11-28T10:00:00-05:00' } },
            gEvent('g0', '2026-11-18T21:00:00-05:00', '2026-11-19T05:00:00-05:00', 'Yesterday - Piano Lesson'), // starts before the window
        ]
        let sent = 0
        const send = async () => { sent++; return true }
        const { port, calls } = fakePort({ listEvents: async () => listed })

        const dry = await runCalendarSync(db, { dryRun: true, today, port, send })
        assert.equal(calls.length, 0, 'a dry run changes nothing on the calendar')
        assert.equal(updates.length, 0, 'a dry run changes nothing in the database')
        assert.equal(sent, 0, 'a dry run sends nothing')
        assert.equal(dry.emailed, false)
        assert.ok(dry.email, 'a dry run still shows the email it would send')
        assert.deepEqual(dry.window, { from: '2026-11-19', to: '2026-12-03' })
        assert.equal(dry.checked, 2)
        const summary = dry.results.map(r => `${r.kind}:${'lesson' in r ? r.lesson.id : r.event.id}`).sort()
        assert.deepEqual(summary, ['create:r2', 'delete:g9', 'retime:r1', 'retime:r3'])
        const r2 = dry.results.find(r => r.kind === 'create')!
        assert.ok(r2.kind === 'create' && r2.lesson.studentName === 'Student' && r2.lesson.duration === 45, 'same fallbacks as booking')
        assert.match(dry.email!.subject, /would fix 4 events/)
        assert.match(dry.email!.html, /Add the missing event/)

        const real = await runCalendarSync(db, { today, port, send })
        assert.equal(real.emailed, true)
        assert.equal(sent, 1)
        assert.deepEqual(calls.sort(), [
            'create Student 2026-11-24 13:15 45',
            'delete g9',
            'retime g1 2026-11-22 17:30 30',
            'retime g3 2026-12-25 10:00 30',
        ])
        assert.deepEqual(updates, ['r2.google_event_id=new1'])

        // A clean morning: no email.
        const clean = fakeDb({ lessons: [rows[0]], profiles }, [])
        const { port: cleanPort } = fakePort({ listEvents: async () => [gEvent('g1', '2026-11-22T17:30:00-05:00', '2026-11-22T18:00:00-05:00')] })
        sent = 0
        const quiet = await runCalendarSync(clean, { today, port: cleanPort, send })
        assert.equal(quiet.results.length, 0)
        assert.equal(quiet.email, null)
        assert.equal(sent, 0)
    }

    // ------------------------------------------------------ jobs page ---
    assert.equal(summarizeJobRun('calendar-sync', { checked: 12, counts: { created: 0, linked: 0, retimed: 0, deleted: 0, leftAlone: 0, errors: 0 } }), 'All 12 lessons matched')
    assert.equal(summarizeJobRun('calendar-sync', { checked: 12, counts: { created: 1, retimed: 2, deleted: 1, leftAlone: 1, errors: 1 }, emailed: true }),
        '4 events fixed, 1 problem, 1 left alone to check, emailed you')

    console.log('calendar sync: all checks passed')
}

/** Just enough of supabase-js for the loader: select with gte/lt/in/limit, and update().eq(). */
function fakeDb(tables: Record<string, Record<string, any>[]>, updates: string[]): DbClient {
    const from = (table: string) => {
        let rows = [...(tables[table] ?? [])]
        let patch: Record<string, unknown> | null = null
        const q: any = {
            select: () => q,
            gte: (col: string, v: string) => { rows = rows.filter(r => r[col] >= v); return q },
            lt: (col: string, v: string) => { rows = rows.filter(r => r[col] < v); return q },
            in: (col: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[col])); return q },
            limit: () => q,
            update: (p: Record<string, unknown>) => { patch = p; return q },
            eq: (col: string, v: unknown) => {
                if (patch) for (const r of rows.filter(r => r[col] === v)) for (const [k, val] of Object.entries(patch)) updates.push(`${r.id}.${k}=${val}`)
                return q
            },
            then: (ok: (x: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, bad),
        }
        return q
    }
    return { from } as unknown as DbClient
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
