/**
 * Self-check for saved Zoom lesson attendance (#964, #965): summing a
 * meeting's joins (merged time, waiting room, overlap, the hour window), the
 * admin line's words, when a lesson is due a check, retries and giving up,
 * the cron's sweep, and the line rendered as admin sees it. Fake Zoom and a
 * fake database: nothing touches prod.
 *
 *   npx tsx scripts/check_zoom_lesson_attendance.ts
 */
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { attendanceLine, mergeIntervals, showsAttendance, summarizeAttendance, type AttendanceView } from '../lib/zoom-lesson-attendance'
import {
    MAX_ATTEMPTS, attendanceRow, lessonParticipantsFetcher, loadAttendanceViews, needsCheck, sweepZoomAttendance,
    type AttendanceLesson, type ExistingRow, type FetchParticipants,
} from '../lib/core/zoom-lesson-attendance'
import { ZoomAttendanceLine } from '../components/admin/zoom-attendance-line'
import type { ZoomParticipant, fetchPastInstances } from '../lib/zoom-attendance'
import type { DbClient } from '../lib/supabase/admin'

const T = Date.parse
// A real lesson's shape (names and emails made up): Sun Nov 15, 6:15pm EST, 30 min.
const lesson: AttendanceLesson = { id: 'L1', date: '2026-11-15', time: '18:15', duration: 30, zoomMeetingId: '83708069249' }
const startMs = T('2026-11-15T23:15:00Z')
const endMs = T('2026-11-15T23:45:00Z')
const real: ZoomParticipant[] = [
    { name: 'Teacher', user_email: 'teacher@example.com', internal_user: true, status: 'in_meeting', join_time: '2026-11-15T23:12:44Z', leave_time: '2026-11-15T23:49:25Z', duration: 2201 },
    { name: 'Student', user_email: 'family@example.com', internal_user: false, status: 'in_waiting_room', join_time: '2026-11-15T23:14:53Z', leave_time: '2026-11-15T23:15:28Z', duration: 35 },
    { name: 'Student', internal_user: false, status: 'in_waiting_room', join_time: '2026-11-15T23:16:16Z', leave_time: '2026-11-15T23:16:24Z', duration: 8 },
    { name: 'Student', internal_user: false, status: 'in_meeting', join_time: '2026-11-15T23:16:25Z', leave_time: '2026-11-15T23:49:23Z', duration: 1978 },
]

const weekLaterJoins = () => real.map(p => ({ ...p, join_time: new Date(T(p.join_time!) + 7 * 864e5).toISOString() }))

async function main() {
    // ------------------------------------------------------------ sums ---
    const s = summarizeAttendance(real, startMs, endMs)
    assert.deepEqual(s, {
        kind: 'student_joined',
        teacherSeconds: 2201,
        studentSeconds: 2021, // waiting room counts as there
        overlapSeconds: 1978, // both in the meeting at once; waiting room does not count
        teacherJoinedAt: '2026-11-15T23:12:44.000Z',
        studentJoinedAt: '2026-11-15T23:14:53.000Z',
    })

    // Two devices at once, or a rejoin overlapping, is not counted twice.
    const twoDevices = summarizeAttendance([
        real[0],
        { internal_user: false, status: 'in_meeting', join_time: '2026-11-15T23:15:00Z', leave_time: '2026-11-15T23:45:00Z', duration: 1800 },
        { internal_user: false, status: 'in_meeting', join_time: '2026-11-15T23:20:00Z', leave_time: '2026-11-15T23:30:00Z', duration: 600 },
    ], startMs, endMs)
    assert.equal(twoDevices.studentSeconds, 1800)
    assert.deepEqual(mergeIntervals([[5, 9], [1, 3], [3, 4], [8, 12]]), [[1, 4], [5, 12]])

    // A meeting opened again the next day: those joins are not this lesson's.
    const reopened = summarizeAttendance([...real, { internal_user: false, status: 'in_meeting', join_time: '2026-11-16T23:00:00Z', leave_time: '2026-11-17T00:00:00Z', duration: 3600 }], startMs, endMs)
    assert.equal(reopened.studentSeconds, 2021)
    assert.equal(summarizeAttendance([], startMs, endMs).kind, 'other_time')
    // Only a later use of the same link (a week on): not this lesson's attendance.
    const weekLater = real.map(p => ({ ...p, join_time: new Date(T(p.join_time!) + 7 * 864e5).toISOString(), leave_time: new Date(T(p.leave_time!) + 7 * 864e5).toISOString() }))
    assert.equal(summarizeAttendance(weekLater, startMs, endMs).kind, 'later_use')
    assert.equal(summarizeAttendance(weekLater, startMs, endMs).studentSeconds, 0)
    // Only an earlier use (a moved lesson): nobody came at the lesson's time.
    const dayBefore = real.map(p => ({ ...p, join_time: new Date(T(p.join_time!) - 864e5).toISOString(), leave_time: new Date(T(p.leave_time!) - 864e5).toISOString() }))
    assert.equal(summarizeAttendance(dayBefore, startMs, endMs).kind, 'other_time')
    // No leave time: Zoom's duration stands in.
    assert.equal(summarizeAttendance([{ internal_user: true, join_time: '2026-11-15T23:15:00Z', duration: 600 }], startMs, endMs).teacherSeconds, 600)

    // ----------------------------------------------------------- line ---
    const view = (over: Partial<AttendanceView> = {}): AttendanceView => ({
        status: 'saved', kind: 'student_joined', teacherSeconds: 2201, studentSeconds: 2021, overlapSeconds: 1978, studentJoinedAt: '2026-11-15T23:14:53Z', ...over,
    })
    assert.deepEqual(attendanceLine(view()), { text: 'Zoom: you 37 min, student 34 min (joined 6:14pm)', title: 'Together in the meeting: 33 min' })
    assert.equal(attendanceLine(null).text, 'Zoom: not checked yet')
    assert.equal(attendanceLine(view({ status: 'retrying' })).text, 'Zoom: not checked yet')
    assert.equal(attendanceLine(view({ status: 'gave_up' })).text, 'Zoom: could not read who joined')
    assert.equal(attendanceLine(view({ status: 'never_started' })).text, 'Zoom: no one joined (the meeting never started)')
    assert.equal(attendanceLine(view({ teacherSeconds: 0, studentSeconds: 0, studentJoinedAt: null })).text, 'Zoom: no one joined')
    assert.equal(attendanceLine(view({ kind: 'later_use', teacherSeconds: 0, studentSeconds: 0, studentJoinedAt: null })).text,
        'Zoom: not available (the meeting link was used again later)', 'never says "no one joined" when Zoom only had a later use')
    assert.equal(attendanceLine(view({ studentSeconds: 0, studentJoinedAt: null })).text, 'Zoom: you 37 min, the student did not join')
    assert.equal(attendanceLine(view({ teacherSeconds: 0 })).text, 'Zoom: student 34 min (joined 6:14pm), your account did not join')
    assert.equal(attendanceLine(view({ studentSeconds: 40 })).text, 'Zoom: you 37 min, student under 1 min (joined 6:14pm)')
    // Summer time reads in EDT wall clock.
    assert.match(attendanceLine(view({ studentJoinedAt: '2026-07-15T22:31:00Z' })).text, /joined 6:31pm/)

    const now = new Date('2026-11-19T15:00:00Z')
    assert.equal(showsAttendance({ date: '2026-11-15', time: '18:15:00', zoom_meeting_id: '1' }, now), true)
    assert.equal(showsAttendance({ date: '2026-11-15', time: '18:15', zoom_meeting_id: null }, now), false, 'classroom lessons get no Zoom line')
    assert.equal(showsAttendance({ date: '2026-11-20', time: '18:15', zoom_meeting_id: '1' }, now), false, 'not before the lesson starts')

    // ------------------------------------------------------ when due ---
    const at = (iso: string) => new Date(iso)
    const row = (over: Partial<ExistingRow>): ExistingRow => ({ lesson_id: 'L1', status: 'saved', attempts: 1, fetched_at: '2026-11-16T00:20:00Z', ...over })
    assert.equal(needsCheck(lesson, undefined, at('2026-11-16T00:10:00Z')), false, 'not until 30 minutes after it ends')
    assert.equal(needsCheck(lesson, undefined, at('2026-11-16T00:15:00Z')), true)
    assert.equal(needsCheck(lesson, row({}), at('2026-11-17T00:00:00Z')), false, 'saved once is saved for good')
    assert.equal(needsCheck(lesson, row({ status: 'retrying' }), at('2026-11-16T00:30:00Z')), false, 'a retry waits')
    assert.equal(needsCheck(lesson, row({ status: 'retrying' }), at('2026-11-16T00:50:00Z')), true)
    assert.equal(needsCheck(lesson, row({ status: 'gave_up' }), at('2026-11-17T00:00:00Z')), false)
    assert.equal(needsCheck(lesson, row({ status: 'never_started' }), at('2026-11-17T00:00:00Z')), false)

    // ------------------------------------------------------ the rows ---
    const saved = attendanceRow(lesson, { ok: true, participants: real }, 0, at('2026-11-16T00:15:00Z')) as any
    assert.equal(saved.status, 'saved')
    assert.equal(saved.attempts, 1)
    assert.equal(saved.participants.length, 4, 'every join kept')
    assert.deepEqual(saved.participants[1], { name: 'Student', internal_user: false, status: 'in_waiting_room', join_time: '2026-11-15T23:14:53Z', leave_time: '2026-11-15T23:15:28Z', duration: 35 })
    assert.ok(!JSON.stringify(saved).includes('@'), 'emails are not kept')
    assert.equal(saved.teacher_seconds, 2201)
    assert.equal(saved.last_error, null)

    const never = { ok: false as const, neverStarted: true, reason: 'never started' }
    assert.equal(attendanceRow(lesson, never, 0, at('2026-11-16T00:15:00Z')).status, 'retrying', 'too soon to be sure it never ran')
    assert.equal(attendanceRow(lesson, never, 0, at('2026-11-16T03:00:00Z')).status, 'never_started')
    const down = { ok: false as const, neverStarted: false, reason: 'Zoom answered 500' }
    for (let prev = 0; prev < MAX_ATTEMPTS - 1; prev++) assert.equal(attendanceRow(lesson, down, prev, now).status, 'retrying')
    const last = attendanceRow(lesson, down, MAX_ATTEMPTS - 1, now)
    assert.equal(last.status, 'gave_up')
    assert.equal(last.last_error, 'Zoom answered 500')

    // ------------------------------------- which use of the meeting ---
    {
        const calls: string[] = []
        const fakeZoom = (instances: Awaited<ReturnType<typeof fetchPastInstances>>) => ({
            instances: async () => instances,
            participants: async (_id: string, _token: string, opts: { uuid?: string } = {}) => {
                calls.push(opts.uuid ?? 'latest')
                return { ok: true as const, participants: opts.uuid === 'later' ? weekLaterJoins() : real }
            },
        })
        const read = (zoom: ReturnType<typeof fakeZoom>) => lessonParticipantsFetcher('token', zoom as any)(lesson)

        // With the permission: only the use at the lesson's time (host opened it 2 hours early still counts).
        let got = await read(fakeZoom({ ok: true, instances: [
            { uuid: 'early/open', start_time: '2026-11-15T21:20:00Z' },
            { uuid: 'later', start_time: '2026-11-22T23:12:00Z' },
        ] }))
        assert.deepEqual(calls, ['early/open'])
        assert.ok(got.ok && got.participants.length === 4)

        // The meeting ran, but only at other times: nobody joined this lesson.
        calls.length = 0
        got = await read(fakeZoom({ ok: true, instances: [{ uuid: 'later', start_time: '2026-11-22T23:12:00Z' }] }))
        assert.deepEqual(calls, [])
        assert.ok(got.ok && got.participants.length === 0)

        // Without the permission (today's Zoom app): the latest use, as before.
        calls.length = 0
        got = await read(fakeZoom({ ok: false, neverStarted: false, missingScope: true, reason: 'Zoom answered 400 (4711)' }))
        assert.deepEqual(calls, ['latest'])
        assert.ok(got.ok)

        // Never started: said so without asking for participants.
        calls.length = 0
        got = await read(fakeZoom({ ok: false, neverStarted: true, missingScope: false, reason: 'never started' }))
        assert.deepEqual(calls, [])
        assert.ok(!got.ok && got.neverStarted)

        // An empty list of uses: fall back to the latest.
        calls.length = 0
        await read(fakeZoom({ ok: true, instances: [] }))
        assert.deepEqual(calls, ['latest'])
    }

    // ----------------------------------------------------- the sweep ---
    {
        const lessons = [
            { id: 'a', student_id: 's1', date: '2026-11-18', time: '17:30:00', duration: 30, zoom_meeting_id: '111' },
            { id: 'b', student_id: 's1', date: '2026-11-18', time: '19:00:00', duration: 30, zoom_meeting_id: '222' },
            { id: 'c', student_id: 's2', date: '2026-11-18', time: '20:00:00', duration: 30, zoom_meeting_id: '333' },
            { id: 't', student_id: 'teacher', date: '2026-11-18', time: '12:00:00', duration: 60, zoom_meeting_id: '444' },
            { id: 'old', student_id: 's1', date: '2026-11-01', time: '17:30:00', duration: 30, zoom_meeting_id: '555' }, // outside the week
            { id: 'soon', student_id: 's1', date: '2026-11-19', time: '09:45:00', duration: 30, zoom_meeting_id: '666' }, // ended 15 min ago
            { id: 'done', student_id: 's2', date: '2026-11-17', time: '17:30:00', duration: 30, zoom_meeting_id: '777' },
        ]
        const profiles = [{ id: 's1', credits: 4, lesson_duration: 30 }, { id: 's2', credits: 2, lesson_duration: 30 }, { id: 'teacher', credits: 998, lesson_duration: 60 }]
        const table = [{ lesson_id: 'done', status: 'saved', attempts: 1, fetched_at: '2026-11-17T23:30:00Z' }]
        const db = fakeDb({ lessons, profiles, zoom_lesson_attendance: table })
        const asked: string[] = []
        // The same joins, moved to lesson a's time (Wed Nov 18, 5:30pm EST).
        const shift = T('2026-11-18T22:30:00Z') - startMs
        const moved = (iso?: string) => (iso ? new Date(T(iso) + shift).toISOString() : iso)
        const forA = real.map(p => ({ ...p, join_time: moved(p.join_time), leave_time: moved(p.leave_time) }))
        const fetch: FetchParticipants = async l => {
            const id = l.zoomMeetingId
            asked.push(id)
            if (id === '222') throw new Error('socket hang up')
            if (id === '333') return { ok: false, neverStarted: true, reason: 'never started' }
            return { ok: true, participants: forA }
        }
        const sweepNow = new Date('2026-11-19T15:00:00Z') // 10am Eastern
        const r = await sweepZoomAttendance(db.client, { now: sweepNow, limit: 2, fetchParticipants: fetch })
        assert.equal(r.due, 3, 'teacher account, old, not-yet-over and already saved lessons are not due')
        assert.deepEqual(asked, ['111', '222'], 'oldest first, at most the limit')
        assert.equal(r.left, 1)
        assert.deepEqual(r.saved.map(x => [x.lessonId, x.status]), [['a', 'saved'], ['b', 'retrying']], 'a Zoom error is saved as a retry, not thrown')
        assert.equal(db.rows('zoom_lesson_attendance').find(x => x.lesson_id === 'b')!.last_error, 'socket hang up')

        const r2 = await sweepZoomAttendance(db.client, { now: sweepNow, fetchParticipants: fetch })
        assert.deepEqual(r2.saved.map(x => [x.lessonId, x.status]), [['c', 'never_started']], 'b waits for its retry; c is long over')

        // Nothing due: Zoom is never asked (no token needed).
        const r3 = await sweepZoomAttendance(db.client, { now: sweepNow, fetchParticipants: async () => { throw new Error('should not be called') } })
        assert.equal(r3.due, 0)

        const views = await loadAttendanceViews(db.client, ['a', 'c', 'nope'])
        assert.equal(views.a.studentSeconds, 2021)
        assert.equal(views.c.status, 'never_started')
        assert.equal(views.nope, undefined)

        // A failed save is listed, and the next lesson still goes.
        const broken = fakeDb({ lessons: lessons.slice(0, 1).concat(lessons[2]), profiles, zoom_lesson_attendance: [] }, { failUpsertFor: 'a' })
        const r4 = await sweepZoomAttendance(broken.client, { now: sweepNow, fetchParticipants: async () => ({ ok: true, participants: real }) })
        assert.deepEqual(r4.errors.map(e => e.lessonId), ['a'])
        assert.deepEqual(r4.saved.map(x => x.lessonId), ['c'])
    }

    // ---------------------------------------------------- the line, rendered ---
    {
        const past = { id: 'L1', date: '2026-11-15', time: '18:15:00', zoom_meeting_id: '83708069249' }
        const html = renderToStaticMarkup(React.createElement(ZoomAttendanceLine, { lesson: past, views: { L1: view() }, now }))
        assert.match(html, /Zoom: you 37 min, student 34 min \(joined 6:14pm\)/)
        assert.match(html, /title="Together in the meeting: 33 min"/)
        assert.match(renderToStaticMarkup(React.createElement(ZoomAttendanceLine, { lesson: past, views: {}, now })), /Zoom: not checked yet/)
        assert.equal(renderToStaticMarkup(React.createElement(ZoomAttendanceLine, { lesson: past, views: null, now })), '', 'nothing while loading')
        assert.equal(renderToStaticMarkup(React.createElement(ZoomAttendanceLine, { lesson: { ...past, zoom_meeting_id: null }, views: {}, now })), '')
        assert.equal(renderToStaticMarkup(React.createElement(ZoomAttendanceLine, { lesson: { ...past, date: '2026-11-25' }, views: {}, now })), '')
        assert.ok(!html.includes(String.fromCharCode(0x2014)), 'no em dashes')
    }

    console.log('zoom lesson attendance: all checks passed')
}

/** Just enough of supabase-js: select with not/gte/lte/in/order/range, and upsert on lesson_id. */
function fakeDb(tables: Record<string, Record<string, any>[]>, { failUpsertFor }: { failUpsertFor?: string } = {}) {
    const from = (table: string) => {
        let rows = [...(tables[table] ?? [])]
        const orders: [string, boolean][] = []
        const q: any = {
            select: () => q,
            not: (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) rows = rows.filter(r => r[c] != null); return q },
            gte: (c: string, v: string) => { rows = rows.filter(r => r[c] >= v); return q },
            lte: (c: string, v: string) => { rows = rows.filter(r => r[c] <= v); return q },
            in: (c: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[c])); return q },
            order: (c: string, o: { ascending: boolean }) => { orders.push([c, o.ascending]); return q },
            range: (a: number, b: number) => {
                rows.sort((x, y) => {
                    for (const [c, asc] of orders) if (x[c] !== y[c]) return (x[c] < y[c] ? -1 : 1) * (asc ? 1 : -1)
                    return 0
                })
                rows = rows.slice(a, b + 1)
                return q
            },
            upsert: async (row: Record<string, any>) => {
                if (row.lesson_id === failUpsertFor) return { error: { message: 'database timed out' } }
                const list = (tables[table] ??= [])
                const i = list.findIndex(r => r.lesson_id === row.lesson_id)
                if (i >= 0) list[i] = { ...list[i], ...row }
                else list.push({ ...row })
                return { error: null }
            },
            then: (ok: (x: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, bad),
        }
        return q
    }
    return { client: { from } as unknown as DbClient, rows: (t: string) => tables[t] ?? [] }
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
