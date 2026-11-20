/**
 * Self-check for "Request a different time" (#878, lib/move-requests.ts and
 * the morning email's Approve / Decline buttons): the lesson's week, when a
 * request goes stale, the labels, the signed links, and the email built with
 * only move requests. No network, no database.
 *
 *   npx tsx scripts/check_move_requests.ts
 */
import assert from 'node:assert/strict'
import { MOVE_NOTE_MAX, cleanMoveNote, familySlotLabel, lessonWeek, outcomeForAdmin, staleReason, studioSlotLabel, weekLabel } from '../lib/move-requests'
import { describeMoveRequest, moveRequestAlertEmail } from '../lib/move-requests-email'
import { signLessonAction, verifyLessonAction } from '../lib/lesson-action-links'
import { buildMorningEmail } from '../lib/unlogged-lessons'
import type { PendingMoveRequest } from '../lib/core/move-requests'

process.env.CRON_SECRET = process.env.CRON_SECRET || 'local-check-secret'

// The week is Monday to Sunday.
assert.deepEqual(lessonWeek('2026-11-20'), { start: '2026-11-16', end: '2026-11-22' }) // Friday
assert.deepEqual(lessonWeek('2026-11-16'), { start: '2026-11-16', end: '2026-11-22' }) // Monday
assert.deepEqual(lessonWeek('2026-11-22'), { start: '2026-11-16', end: '2026-11-22' }) // Sunday
assert.deepEqual(lessonWeek('2026-12-31'), { start: '2026-12-28', end: '2027-01-03' }) // across the year
assert.equal(weekLabel('2026-11-20'), 'the week of Mon, Nov 16')

// Labels: studio time, and the family's own time when it differs.
assert.equal(studioSlotLabel('2026-11-20', '16:30'), 'Fri, Nov 20 at 4:30pm EST')
assert.equal(familySlotLabel('2026-11-20', '16:30:00', 'America/Los_Angeles'), 'Fri, Nov 20 at 4:30pm EST (1:30pm your time)')
assert.equal(familySlotLabel('2026-11-20', '16:30', 'America/New_York'), 'Fri, Nov 20 at 4:30pm EST')
assert.equal(familySlotLabel('2026-11-20', '16:30', null), 'Fri, Nov 20 at 4:30pm EST')

// Stale rules. Fri Nov 20 4:30pm EST lesson, asked to move to Sat Nov 21 5pm.
const req = { from_date: '2026-11-20', from_time: '16:30:00', to_date: '2026-11-21', to_time: '17:00:00' }
const lesson = { id: 'l1', date: '2026-11-20', time: '16:30:00', status: 'scheduled', duration: 60 }
const before = Date.parse('2026-11-19T15:00:00Z')
assert.equal(staleReason(req, lesson, before), null)
assert.equal(staleReason(req, null, before), 'lesson_changed')
assert.equal(staleReason(req, { ...lesson, status: 'completed' }, before), 'lesson_changed')
assert.equal(staleReason(req, { ...lesson, time: '17:00:00' }, before), 'lesson_changed')
assert.equal(staleReason(req, { ...lesson, date: '2026-11-19' }, before), 'lesson_changed')
// The lesson's own time comes (4:30pm EST = 21:30 UTC).
assert.equal(staleReason(req, lesson, Date.parse('2026-11-20T21:29:00Z')), null)
assert.equal(staleReason(req, lesson, Date.parse('2026-11-20T21:30:00Z')), 'lesson_passed')
// Moving earlier: the picked time comes first.
const earlier = { ...req, to_date: '2026-11-19', to_time: '18:00' }
assert.equal(staleReason(earlier, lesson, Date.parse('2026-11-19T22:59:00Z')), null)
assert.equal(staleReason(earlier, lesson, Date.parse('2026-11-19T23:00:00Z')), 'slot_passed')
assert.match(outcomeForAdmin('slot_taken'), /no longer free/)

// Move links carry the request id; one without it is refused both ways.
const now = new Date('2026-11-19T13:30:00Z')
assert.equal(signLessonAction({ lessonId: 'l1', action: 'approve_move', date: '2026-11-20', time: '16:30' }, now), null)
const approve = signLessonAction({ lessonId: 'l1', action: 'approve_move', date: '2026-11-20', time: '16:30:00', requestId: 'r1' }, now)!
const v = verifyLessonAction(approve, now)
assert.ok(v.ok)
if (v.ok) {
    assert.equal(v.claims.a, 'approve_move')
    assert.equal(v.claims.r, 'r1')
    assert.equal(v.claims.t, '16:30')
}
// The older actions still sign and verify without one.
const log = signLessonAction({ lessonId: 'l1', action: 'log', date: '2026-11-20', time: '16:30' }, now)!
assert.ok(verifyLessonAction(log, now).ok)

// The morning email with only a move request: it goes out, buttons and all.
const pending: PendingMoveRequest = {
    id: 'r1', lessonId: 'l1', studentId: 's1', studentName: 'Piano Student',
    fromDate: '2026-11-20', fromTime: '16:30', toDate: '2026-11-21', toTime: '17:00', duration: 60,
    fromLabel: 'Fri, Nov 20 at 4:30pm EST', toLabel: 'Sat, Nov 21 at 5:00pm EST', createdAt: '2026-11-19T12:00:00Z',
    note: null,
}
const only = buildMorningEmail('2026-11-18', [], [], { now, baseUrl: 'https://example.test', moveRequests: [pending] })
assert.equal(only.subject, '1 family asks to move a lesson')
assert.match(only.html, />Approve</)
assert.match(only.html, />Decline</)
assert.equal((only.html.match(/https:\/\/example\.test\/api\/lesson-action\?t=/g) || []).length, 2)
assert.match(only.html, /sends that 1 family the usual/)
assert.match(only.footer, /Nothing from Wednesday, Nov 18 is waiting to be logged/)
assert.equal(only.lines.length, 1)

// Two requests: plural subject.
const two = buildMorningEmail('2026-11-18', [], [], { now, baseUrl: 'https://example.test', moveRequests: [pending, { ...pending, id: 'r2' }] })
assert.equal(two.subject, '2 families ask to move a lesson')

// Without requests the email reads as before.
const none = buildMorningEmail('2026-11-18', [], [], { now, baseUrl: 'https://example.test' })
assert.equal(none.html, '')

// The family's note (#1346): one trimmed line, capped, shown escaped under the request.
assert.equal(cleanMoveNote('  soccer   game \n\n after school '), 'soccer game after school')
assert.equal(cleanMoveNote('   '), null)
assert.equal(cleanMoveNote(undefined), null)
assert.equal(cleanMoveNote(42), null)
assert.equal(cleanMoveNote('x'.repeat(500))!.length, MOVE_NOTE_MAX)
assert.equal(Array.from(cleanMoveNote('\u{1F3B9}'.repeat(300))!).length, MOVE_NOTE_MAX)
assert.doesNotMatch(describeMoveRequest(pending), /note/)
const noted = describeMoveRequest({ ...pending, note: 'travelling <b>& back</b>' })
assert.match(noted, /Their note: &ldquo;travelling &lt;b&gt;&amp; back&lt;\/b&gt;&rdquo;/)
const notedEmail = buildMorningEmail('2026-11-18', [], [], { now, baseUrl: 'https://example.test', moveRequests: [{ ...pending, note: 'soccer game' }] })
assert.match(notedEmail.html, /Their note: &ldquo;soccer game&rdquo;/)

// The email the moment a family asks (#1323): one request, its buttons, the admin link, the note.
const alert = moveRequestAlertEmail({ ...pending, note: 'soccer game' }, { now, baseUrl: 'https://example.test' })
assert.equal(alert.subject, 'Piano Student asks to move Fri, Nov 20 at 4:30pm EST')
assert.equal((alert.html.match(/https:\/\/example\.test\/api\/lesson-action\?t=/g) || []).length, 2)
assert.match(alert.html, />Approve</)
assert.match(alert.html, />Decline</)
assert.match(alert.html, /href="https:\/\/example\.test\/admin"/)
assert.match(alert.html, /Their note: &ldquo;soccer game&rdquo;/)
assert.doesNotMatch(alert.html, /<h3/)
assert.equal(alert.lines.length, 1)
// Asked the day before (Thu 8:30am EST, lesson Fri 4:30pm EST, 32h away): flagged as soon.
assert.match(alert.html, /Soon:<\/b> the lesson is in about 32 hours/)
// Same day: 2 hours before.
assert.match(moveRequestAlertEmail(pending, { now: new Date('2026-11-20T19:30:00Z'), baseUrl: 'https://example.test' }).html, /in about 2 hours/)
// A week ahead: no nudge.
assert.doesNotMatch(moveRequestAlertEmail(pending, { now: new Date('2026-11-13T19:30:00Z'), baseUrl: 'https://example.test' }).html, /Soon:/)

// No em dashes anywhere a person reads.
for (const s of [alert.subject, alert.html, alert.footer, only.subject, only.html, only.footer, two.subject, weekLabel('2026-11-20'), outcomeForAdmin('lesson_changed')]) {
    assert.ok(!s.includes(String.fromCharCode(0x2014)), `em dash in: ${s}`)
}

console.log('check_move_requests: all checks passed')
