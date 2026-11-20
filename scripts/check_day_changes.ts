/**
 * Self-check for admin's "Today's changes" (#1005): the words of each kind of
 * lesson event, credit changes folded into the lesson line they belong to (the
 * closest one when two lines read the same balances), and the lines rebuilt
 * from older records only where nothing was recorded. Fake rows: nothing
 * touches prod.
 *
 *   npx tsx scripts/check_day_changes.ts
 */
import assert from 'node:assert/strict'
import { buildDayChanges, creditSource, lessonWhen, summarizeDayChanges, type CreditRow, type DayChangeInput, type EventRow, type LessonRow } from '../lib/day-changes'

const S = 'stu-1'
const at = (hhmmss: string) => `2026-11-20T${hhmmss}${hhmmss.includes('.') ? '00' : '.000'}Z` // 22:00Z = 5pm EST

function ev(over: Partial<EventRow>): EventRow {
    return { id: Math.random().toString(36).slice(2), lesson_id: 'L1', student_id: S, kind: 'booked', actor: 'admin', lesson_date: '2026-12-05', lesson_time: '07:30', detail: {}, created_at: at('22:00:00'), ...over }
}
function cr(over: Partial<CreditRow>): CreditRow {
    return { id: Math.random().toString(36).slice(2), student_id: S, previous_credits: 5, new_credits: 4, delta: -1, source: null, note: null, changed_at: at('22:00:00'), ...over }
}
function input(over: Partial<DayChangeInput>): DayChangeInput {
    return { events: [], credits: [], cancellations: [], created: [], autoLogs: [], moves: [], lessons: new Map(), names: new Map([[S, 'Test Kid']]), ...over }
}

// Words.
assert.equal(lessonWhen('2026-12-05', '07:30'), 'Sat Dec 5, 7:30am')
assert.equal(lessonWhen('2026-12-05', '19:00:00'), 'Sat Dec 5, 7:00pm')
{
    const lines = buildDayChanges(input({ events: [
        ev({ kind: 'booked', actor: 'auto', detail: { reason: 'standing weekly lesson' }, created_at: at('15:00:00') }),
        ev({ kind: 'moved', detail: { from: { date: '2026-12-05', time: '07:00' }, to: { date: '2026-12-06', time: '08:00' }, via: 'agent' }, created_at: at('16:00:00') }),
        ev({ kind: 'cancelled', actor: 'family', detail: { was_late: true, fee: 15 }, created_at: at('17:00:00') }),
        ev({ kind: 'logged', actor: 'auto', detail: { credits_before: 5, credits_after: 4, source: 'zoom_webhook' }, created_at: at('18:00:00') }),
        ev({ kind: 'no_show', detail: { credits_before: 4, credits_after: 3, via: 'email button' }, created_at: at('19:00:00') }),
        ev({ kind: 'held', detail: { reason: 'waiting on a parent' }, created_at: at('20:00:00') }),
    ] }))
    assert.deepEqual(lines.map(l => l.kind), ['held', 'no_show', 'logged', 'cancelled', 'moved', 'booked'], 'newest first')
    const [held, noShow, logged, cancelled, moved, booked] = lines
    assert.equal(booked.what, 'Booked Sat Dec 5, 7:30am')
    assert.equal(booked.extra, 'standing weekly lesson')
    assert.equal(booked.who, 'the portal on its own')
    assert.equal(moved.what, 'Moved Sat Dec 5, 7:00am to Sun Dec 6, 8:00am')
    assert.equal(moved.extra, 'through your agent')
    assert.equal(moved.who, 'you')
    assert.equal(cancelled.who, 'the family')
    assert.equal(cancelled.extra, 'late (inside 24 hours), $15.00 late fee added')
    assert.equal(logged.extra, 'lessons left 5 to 4, Zoom recording')
    assert.equal(noShow.what, 'Marked Sat Dec 5, 7:30am a no-show')
    assert.equal(noShow.extra, 'lessons left 4 to 3, from the email button')
    assert.equal(held.extra, 'waiting on a parent')
    assert.equal(booked.clock, '10:00am')
    assert.equal(booked.studentName, 'Test Kid')
    assert.equal(summarizeDayChanges(lines), '1 booked, 1 moved, 1 cancelled, 1 logged, 1 no-show, 1 put on hold')
}

// A credit change folds into the closest line with the same balances; the leftover one shows alone.
{
    const lines = buildDayChanges(input({
        events: [
            ev({ kind: 'logged', detail: { credits_before: 537, credits_after: 536 }, created_at: at('22:00:01') }),
            ev({ kind: 'unlogged', detail: { credits_before: 536, credits_after: 537, mode: 'unlog' }, created_at: at('22:00:03') }),
            ev({ kind: 'no_show', detail: { credits_before: 537, credits_after: 536 }, created_at: at('22:00:06') }),
        ],
        credits: [
            cr({ previous_credits: 537, new_credits: 536, changed_at: at('22:00:00.9') }),
            cr({ previous_credits: 536, new_credits: 537, delta: 1, source: 'log undone: wrong', changed_at: at('22:00:02.9') }),
            cr({ previous_credits: 537, new_credits: 536, source: 'no-show', changed_at: at('22:00:05.9') }),
            cr({ previous_credits: 536, new_credits: 537, delta: 1, source: 'test cleanup', changed_at: at('22:00:07') }),
        ],
    }))
    assert.equal(lines.length, 4)
    const credit = lines.filter(l => l.kind === 'credit')
    assert.equal(credit.length, 1, 'only the cleanup is left on its own')
    assert.equal(credit[0].extra, 'test entry (test cleanup)')
}

// A credit change far from the log stays its own line.
{
    const lines = buildDayChanges(input({
        events: [ev({ kind: 'logged', detail: { credits_before: 5, credits_after: 4 }, created_at: at('12:00:00') })],
        credits: [cr({ changed_at: at('22:00:00') })],
    }))
    assert.equal(lines.length, 2)
}

// Older records: only where nothing was recorded.
{
    const lesson: LessonRow = { id: 'L9', student_id: S, date: '2026-11-19', time: '17:30', status: 'completed', created_at: at('01:00:00'), completed_source: 'zoom_webhook', credit_snapshot_before: 3, credit_snapshot: 2 }
    const lines = buildDayChanges(input({
        events: [ev({ kind: 'cancelled', lesson_id: 'L2' })],
        cancellations: [
            { id: 'c1', lesson_id: 'L2', student_id: S, lesson_date: '2026-12-05', lesson_time: '07:30', cancelled_by: 'admin', was_late: false, fee_charged: 0, cancelled_at: at('22:00:00') },
            { id: 'c2', lesson_id: 'L3', student_id: S, lesson_date: '2026-12-06', lesson_time: '16:00', cancelled_by: 'student', was_late: false, fee_charged: '0', cancelled_at: at('21:00:00') },
        ],
        credits: [cr({ previous_credits: 3, new_credits: 2, changed_at: at('23:00:00') })],
        lessons: new Map([['L9', lesson]]),
    }))
    const derived = lines.filter(l => l.derived)
    assert.equal(derived.length, 2, 'the recorded cancel is not repeated from the cancellation log')
    const cancel = derived.find(l => l.kind === 'cancelled')!
    assert.equal(cancel.who, 'the family')
    const log = derived.find(l => l.kind === 'logged')!
    assert.equal(log.what, 'Logged Thu Nov 19, 5:30pm')
    assert.equal(log.who, 'the portal on its own')
    assert.ok(!lines.some(l => l.kind === 'credit'), 'the credit change is named by its lesson')
}

// Ledger labels.
assert.deepEqual(creditSource('admin adjustment', 'goodwill', 1), { who: 'you', words: 'adjustment: goodwill' })
assert.equal(creditSource('monthly plan', null, 4).who, 'the family')
assert.equal(creditSource('monthly plan renewal', null, 4).who, 'the portal on its own')
assert.equal(creditSource(null, null, 2).words, 'lessons added, no reason recorded')
assert.equal(creditSource(null, null, 2).who, null)

console.log('check_day_changes: all good')
