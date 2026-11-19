/**
 * Self-check for "Ran short on Zoom" in the morning email (#966): which saved
 * attendance counts, the under-half rule, what is left out (no row, a later
 * use of the link, no-shows, teacher accounts, lessons that went on in the
 * classroom), the wording (logged or not, free), and that the section sits in
 * the email with today's list, Watch links and the rest kept. Fake database:
 * nothing touches prod.
 *
 *   npx tsx scripts/check_short_lessons.ts
 */
import assert from 'node:assert/strict'
process.env.CRON_SECRET = process.env.CRON_SECRET || 'check-only-secret'
import { describeShortLesson, findShortLessons, ranShort, shortLessonsSection, timeTogether, type ShortLesson } from '../lib/short-lessons'
import { buildMorningEmail, type UnloggedLesson } from '../lib/unlogged-lessons'
import type { EveningLesson } from '../lib/evening-preview'
import type { DbClient } from '../lib/supabase/admin'

const baseUrl = 'https://example.test'
const now = new Date('2026-11-16T13:30:00Z')

const row = (over: Record<string, any> = {}) => ({ lesson_id: 'x', status: 'saved', kind: 'student_joined', overlap_seconds: 180, student_seconds: 240, teacher_seconds: 420, ...over })

async function main() {
    // ------------------------------------------------------- the rule ---
    assert.deepEqual(timeTogether(row()), { seconds: 180, measure: 'together' })
    assert.deepEqual(timeTogether(row({ kind: 'host_absent', overlap_seconds: 0, student_seconds: 1500 })), { seconds: 1500, measure: 'student' })
    for (const kind of ['only_you', 'other_time', 'later_use', 'never_started']) assert.equal(timeTogether(row({ kind })), null, `${kind} says nothing about a lesson that ran`)
    assert.equal(timeTogether(row({ status: 'retrying' })), null)
    assert.equal(ranShort(14 * 60 + 59, 30), true)
    assert.equal(ranShort(15 * 60, 30), false, 'exactly half is not short')
    assert.equal(ranShort(29 * 60, 60), true)

    // ---------------------------------------------------- the finding ---
    {
        const lessons = [
            { id: 'a', student_id: 's1', date: '2026-11-15', time: '20:30:00', duration: 30, status: 'completed', free_reason: null, zoom_meeting_id: '1' }, // 3 min together, logged
            { id: 'b', student_id: 's2', date: '2026-11-15', time: '18:15:00', duration: 30, status: 'completed', free_reason: null, zoom_meeting_id: '2' }, // full lesson
            { id: 'c', student_id: 's3', date: '2026-11-15', time: '17:00:00', duration: null, status: 'scheduled', free_reason: null, zoom_meeting_id: '3' }, // profile says 60, 20 min together, unlogged
            { id: 'd', student_id: 's1', date: '2026-11-15', time: '16:00:00', duration: 30, status: 'completed', free_reason: 'free trial', zoom_meeting_id: '4' }, // short, but free
            { id: 'e', student_id: 's4', date: '2026-11-15', time: '15:00:00', duration: 30, status: 'completed', free_reason: null, zoom_meeting_id: '5' }, // later use of the link
            { id: 'f', student_id: 's5', date: '2026-11-15', time: '14:00:00', duration: 30, status: 'completed', free_reason: null, zoom_meeting_id: '6' }, // no row yet
            { id: 'g', student_id: 'teacher', date: '2026-11-15', time: '13:00:00', duration: 60, status: 'completed', free_reason: null, zoom_meeting_id: '7' },
            { id: 'h', student_id: 's6', date: '2026-11-15', time: '19:00:00', duration: 30, status: 'completed', free_reason: null, zoom_meeting_id: '8' }, // went on in the classroom
            { id: 'i', student_id: 's7', date: '2026-11-15', time: '12:00:00', duration: 30, status: 'completed', free_reason: null, zoom_meeting_id: null }, // not on Zoom
        ]
        const attendance = [
            row({ lesson_id: 'a', overlap_seconds: 180 }),
            row({ lesson_id: 'b', overlap_seconds: 1700 }),
            row({ lesson_id: 'c', overlap_seconds: 1200 }),
            row({ lesson_id: 'd', overlap_seconds: 300 }),
            row({ lesson_id: 'e', kind: 'later_use', overlap_seconds: 0 }),
            row({ lesson_id: 'g', overlap_seconds: 60 }),
            row({ lesson_id: 'h', overlap_seconds: 240 }),
        ]
        const profiles = [
            { id: 's1', name: 'Amy Example', credits: 3, lesson_duration: 30 },
            { id: 's2', name: 'Ben Example', credits: 3, lesson_duration: 30 },
            { id: 's3', name: 'Cara Example', credits: 3, lesson_duration: 60 },
            { id: 's4', name: 'Dan Example', credits: 3, lesson_duration: 30 },
            { id: 's5', name: 'Eve Example', credits: 3, lesson_duration: 30 },
            { id: 's6', name: 'Fay Example', credits: 3, lesson_duration: 30 },
            { id: 'teacher', name: 'Teacher', credits: 998, lesson_duration: 60 },
        ]
        const classroom = [{ student_id: 's6', created_at: '2026-11-16T00:20:00Z' }] // 7:20pm EST, in h's slot
        const short = await findShortLessons(fakeDb({ lessons, zoom_lesson_attendance: attendance, profiles, classroom_recordings: classroom }), '2026-11-15')
        assert.deepEqual(short.map(s => [s.id, s.duration, Math.round(s.seconds / 60), s.logged, s.free]), [
            ['d', 30, 5, true, true],
            ['c', 60, 20, false, false],
            ['a', 30, 3, true, false],
        ], 'time order; the full lesson, later use, no row, teacher, classroom and non-Zoom lessons are left out')
    }

    // ---------------------------------------------------------- words ---
    const s: ShortLesson = { id: 'a', date: '2026-11-15', time: '20:30', duration: 30, studentName: 'Amy <Example>', seconds: 180, measure: 'together', logged: true, free: false }
    assert.equal(describeShortLesson(s), 'Amy &lt;Example&gt;: 8:30pm EST, booked 30 min, together 3 min. <b>Logged, took a credit.</b>')
    assert.match(describeShortLesson({ ...s, logged: false }), /Not logged, no credit taken\.$/)
    assert.match(describeShortLesson({ ...s, free: true }), /Logged as free, no credit taken\.$/)
    assert.match(describeShortLesson({ ...s, measure: 'student', seconds: 600 }), /the student 10 min \(your account never joined\)/)
    const section = shortLessonsSection([s], { baseUrl })
    assert.equal(section.subject, '1 ran short')
    assert.match(section.html, /Ran short on Zoom \(1\)/)
    assert.match(section.html, /href="https:\/\/example\.test\/admin\?day=2026-11-15"/, 'opens that day in admin, where Undo log is')
    assert.deepEqual(shortLessonsSection([], { baseUrl }), { lines: [], html: '', subject: '' })

    // ------------------------------------------------- in the email ---
    const todayLesson: EveningLesson = {
        id: 't1', studentId: 's1', joinUrl: null, date: '2026-11-16', time: '16:30', studioTime: '4:30pm EST', familyTime: null,
        name: 'Piano Student', minutes: 30, place: 'Zoom', status: 'scheduled', flags: [],
    }
    const today = { date: '2026-11-16', lessons: [todayLesson] }
    // Nothing unlogged: today first, then ran short; the subject says both.
    const quiet = buildMorningEmail('2026-11-15', [], [], { now, baseUrl, today, short: [s] })
    assert.equal(quiet.subject, '1 ran short; today: 1 lesson')
    assert.ok(quiet.html.indexOf('Today, Monday') < quiet.html.indexOf('Ran short on Zoom'), "today's list stays first")
    // With unlogged lessons: after them, Watch kept.
    const unlogged: UnloggedLesson = {
        id: 'u1', date: '2026-11-15', time: '17:00', duration: 60, status: 'scheduled', studentId: 's3', studentName: 'Cara Example',
        accountStatus: 'active', zoomMeetingId: null, hasVideo: true, hasDropboxFolder: true, recordingUrl: 'https://www.dropbox.com/s/abc/lesson.mp4?dl=0',
    }
    const busy = buildMorningEmail('2026-11-15', [unlogged], [], { now, baseUrl, today, short: [s] })
    assert.match(busy.subject, /, 1 ran short; today: 1 lesson$/)
    assert.ok(busy.html.indexOf('Not logged yet') < busy.html.indexOf('Ran short on Zoom'))
    assert.match(busy.html, />Watch</, 'Watch buttons kept')
    // No short lessons: the email is exactly what it was (the one-tap links' signed tokens differ each build).
    const masked = (e: object) => JSON.stringify(e).replace(/t=[^"&\\]+/g, 't=X')
    assert.equal(masked(buildMorningEmail('2026-11-15', [unlogged], [], { now, baseUrl, today })), masked(buildMorningEmail('2026-11-15', [unlogged], [], { now, baseUrl, today, short: [] })))
    assert.ok(!buildMorningEmail('2026-11-15', [], [], { now, baseUrl, today }).html.includes('Ran short'))
    for (const text of [quiet.html, busy.html, quiet.footer, busy.subject]) assert.ok(!text.includes(String.fromCharCode(0x2014)), 'no em dashes')

    console.log('short lessons: all checks passed')
}

/** Just enough of supabase-js: select with eq/not/in/gte/lte/order. */
function fakeDb(tables: Record<string, Record<string, any>[]>): DbClient {
    const from = (table: string) => {
        let rows = [...(tables[table] ?? [])]
        const q: any = {
            select: () => q,
            eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return q },
            not: (c: string, op: string, v: unknown) => { if (op === 'is' && v === null) rows = rows.filter(r => r[c] != null); return q },
            in: (c: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[c])); return q },
            gte: (c: string, v: string) => { rows = rows.filter(r => r[c] >= v); return q },
            lte: (c: string, v: string) => { rows = rows.filter(r => r[c] <= v); return q },
            order: (c: string, o: { ascending: boolean }) => { rows.sort((x, y) => (x[c] < y[c] ? -1 : x[c] > y[c] ? 1 : 0) * (o.ascending ? 1 : -1)); return q },
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
