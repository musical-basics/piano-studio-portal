/**
 * Self-check for the monthly statement wording (#936, lib/monthly-statements.ts):
 * date lists, the family's own calendar, the balance line, the payment date,
 * parent vs adult wording, and no dashes or dollar amounts. Pure: nothing
 * touches the database, Stripe or Resend.
 *
 *   npx tsx scripts/check_monthly_statements.ts
 */
import assert from 'node:assert/strict'
import { buildStatement, familyDate, formatDateList, formatPaymentDate, previousMonthOf, type StatementFacts } from '../lib/monthly-statements'

const base: StatementFacts = {
    month: '2026-11',
    studentFirst: 'Sam',
    greetingName: 'Alex',
    toParent: true,
    held: [
        { date: '2026-11-02', time: '17:30:00' },
        { date: '2026-11-09', time: '17:30:00' },
        { date: '2026-11-16', time: '17:30:00', free: true },
    ],
    missed: [],
    creditsNow: 3,
    nextPaymentAt: '2026-12-15T17:00:00Z',
    familyTz: 'America/Los_Angeles',
    historyUrl: 'https://lessons.musicalbasics.com/student?tab=history',
    canReply: true,
}

// Months and lists.
assert.equal(previousMonthOf('2026-12-01'), '2026-11')
assert.equal(previousMonthOf('2027-01-01'), '2026-12')
assert.equal(formatDateList([{ date: '2026-11-09' }, { date: '2026-11-02' }]), 'November 2 and 9')
assert.equal(formatDateList([{ date: '2026-10-31' }, { date: '2026-11-07' }, { date: '2026-11-14' }]), 'October 31, November 7 and 14')
assert.equal(formatDateList([{ date: '2026-11-02' }, { date: '2026-11-02' }, { date: '2026-11-09', note: 'free' }]), 'November 2 (2 lessons) and 9 (free)')
assert.equal(formatDateList([]), '')

// The family's own calendar: 9pm Eastern is the next day in Berlin, the same day in L.A.
assert.equal(familyDate('2026-11-05', '21:00:00', 'Europe/Berlin'), '2026-11-06')
assert.equal(familyDate('2026-11-05', '21:00:00', 'America/Los_Angeles'), '2026-11-05')
assert.equal(familyDate('2026-11-05', '21:00:00', 'UTC'), '2026-11-05') // the column default means "unknown"
assert.equal(familyDate('2026-11-05', '21:00:00', null), '2026-11-05')

// Payment date: the family's calendar, Eastern when unknown.
assert.equal(formatPaymentDate('2026-12-15T03:00:00Z', null), 'December 14')
assert.equal(formatPaymentDate('2026-12-15T03:00:00Z', 'Europe/Berlin'), 'December 15')

// A parent, on a plan.
const parent = buildStatement(base)
assert.equal(parent.subject, "Sam's November lesson summary")
assert.equal(parent.greeting, 'Hi Alex,')
assert.equal(parent.intro, "Here's Sam's lesson summary for November:")
assert.deepEqual(parent.rows, [
    { label: 'Lessons held', value: '3 - November 2, 9 and 16 (free)' },
    { label: 'Lessons left', value: '3' },
    { label: 'Next payment', value: 'December 15' },
])
assert.ok(parent.text.includes('History tab of the portal: https://lessons.musicalbasics.com/student?tab=history'))
assert.ok(parent.text.includes('Any questions, just reply to this email!'))
assert.ok(parent.text.endsWith('See you soon!\nLionel'))

// An adult, ahead of the balance, no plan, a no-show, no reply address.
const adult = buildStatement({
    ...base,
    toParent: false,
    greetingName: 'Sam',
    held: [],
    missed: [{ date: '2026-11-20', time: '18:00:00' }],
    creditsNow: -2,
    nextPaymentAt: null,
    canReply: false,
})
assert.equal(adult.subject, 'Your November lesson summary')
assert.equal(adult.intro, "Here's your lesson summary for November:")
assert.deepEqual(adult.rows, [
    { label: 'Lessons held', value: 'none' },
    { label: 'Missed (still counted)', value: 'November 20' },
    { label: 'Lessons left', value: '0 (2 lessons ahead of the credit balance)' },
])
assert.ok(!adult.text.includes('reply'))
assert.equal(adult.preview, 'No lessons in November, 0 left')

// No greeting name.
assert.equal(buildStatement({ ...base, greetingName: null }).greeting, 'Hi there,')

// Never an em dash, an en dash or a dollar amount.
for (const c of [parent, adult]) {
    const all = [c.subject, c.preview, c.heading, c.text].join('\n')
    assert.ok(!/[\u2013\u2014]/.test(all), 'no long dashes')
    assert.ok(!all.includes('$'), 'no dollar amounts')
}

console.log('check_monthly_statements: all good')
