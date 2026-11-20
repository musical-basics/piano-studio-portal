/**
 * Self-check for #1092 (lib/owed-makeups.ts): which lesson events put a family
 * on the "owed a make-up" list, and the labels. No network, no database.
 *
 *   npx tsx scripts/check_owed_makeups.ts
 */
import assert from 'node:assert/strict'
import { daysAgo, owedRowFromEvent, owedWhatLabel, type OwedLessonEvent } from '../lib/owed-makeups'

const base: OwedLessonEvent = {
    id: 'e1', kind: 'cancelled', actor: 'admin', student_id: 's1', lesson_id: 'l1',
    lesson_date: '2026-11-24', lesson_time: '16:30', detail: { fee: 0, was_late: false, was_status: 'scheduled' },
    created_at: '2026-11-21T15:00:00Z',
}

// A cancel by Lionel: he says whether it was on him.
assert.deepEqual(owedRowFromEvent(base), { source: 'cancelled', status: 'ask', via: null })
assert.deepEqual(owedRowFromEvent({ ...base, detail: { ...base.detail, via: 'agent' } }), { source: 'cancelled', status: 'ask', via: 'agent' })
// Older events carry no was_status: treated as a scheduled lesson.
assert.equal(owedRowFromEvent({ ...base, detail: {} })?.status, 'ask')
assert.equal(owedRowFromEvent({ ...base, detail: null })?.status, 'ask')

// Never on the list: the family cancelled, the portal did, "student set
// inactive", removing a logged lesson, other kinds.
assert.equal(owedRowFromEvent({ ...base, actor: 'family' }), null)
assert.equal(owedRowFromEvent({ ...base, actor: 'auto' }), null)
assert.equal(owedRowFromEvent({ ...base, detail: { reason: 'student set inactive' } }), null)
assert.equal(owedRowFromEvent({ ...base, detail: { was_status: 'completed' } }), null)
for (const kind of ['booked', 'moved', 'removed', 'logged', 'no_show', 'unlogged', 'held', 'released']) {
    assert.equal(owedRowFromEvent({ ...base, kind }), null, kind)
}
assert.equal(owedRowFromEvent({ ...base, lesson_date: null }), null)

// "I missed this": owed, unless it booked the make-up itself.
const missed = { ...base, kind: 'missed', detail: { reason: '$15 account credit', was_status: 'scheduled' } }
assert.deepEqual(owedRowFromEvent(missed), { source: 'missed', status: 'owed', via: null })
assert.deepEqual(owedRowFromEvent({ ...missed, detail: { reason: '$15 account credit, make-up 2026-11-25 15:00' } }), {
    source: 'missed', status: 'settled', via: null, outcome: 'booked with "I missed this"', makeup_date: '2026-11-25', makeup_time: '15:00',
})
assert.equal(owedRowFromEvent({ ...missed, detail: { reason: 'make-up 2026-11-25 15:00' } })?.status, 'settled')

// Labels lead with the lesson's studio time.
assert.equal(owedWhatLabel({ source: 'cancelled', lesson_date: '2026-11-24', lesson_time: '16:30' }), 'Tue, Nov 24 at 4:30pm EST: you cancelled it')
assert.equal(owedWhatLabel({ source: 'cancelled', lesson_date: '2026-11-24', lesson_time: '16:30', via: 'agent' }), 'Tue, Nov 24 at 4:30pm EST: you cancelled it (by your agent)')
assert.equal(owedWhatLabel({ source: 'missed', lesson_date: '2026-11-18', lesson_time: '19:00' }), 'Wed, Nov 18 at 7:00pm EST: you missed it ("I missed this")')

const now = Date.parse('2026-11-25T12:00:00Z')
assert.equal(daysAgo('2026-11-25T08:00:00Z', now), 'today')
assert.equal(daysAgo('2026-11-24T08:00:00Z', now), 'yesterday')
assert.equal(daysAgo('2026-11-20T08:00:00Z', now), '5 days ago')

for (const s of [owedWhatLabel({ source: 'missed', lesson_date: '2026-11-18', lesson_time: '19:00' }), daysAgo('2026-11-20T08:00:00Z', now)]) {
    assert.ok(!s.includes(String.fromCharCode(0x2014)), `em dash in: ${s}`)
}

console.log('check_owed_makeups: all good')
