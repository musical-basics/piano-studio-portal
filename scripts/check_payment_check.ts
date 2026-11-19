// Verifies reconcilePayments in lib/payment-check.ts, the matching behind the
// "Payments and lessons added" part of the credit check on the 1st (#757).
// No test runner is configured, so run it directly:
//
//   npx tsx scripts/check_payment_check.ts
//
// Synthetic data only: no database, no Stripe.
import { reconcilePayments, type LedgerChange, type StudioPayment } from '../lib/payment-check'

let pass = 0, fail = 0
function check(desc: string, got: unknown, want: unknown) {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) { pass++; console.log(`  ok   ${desc}`) }
    else { fail++; console.log(`  FAIL ${desc}\n         got  ${g}\n         want ${w}`) }
}

const MONTH = '2026-10'
const t = (iso: string) => Date.parse(iso)
let seq = 0
const pay = (studentId: string, at: string, kind: StudioPayment['kind'], lessons: number | null, extra: Partial<StudioPayment> = {}): StudioPayment =>
    ({ id: `p${++seq}`, studentId, kind, lessons, amountCents: 16500, refunded: false, atMs: t(at), ...extra })
const change = (studentId: string, at: string, prev: number, next: number, extra: Partial<LedgerChange> = {}): LedgerChange =>
    ({ id: `c${++seq}`, studentId, prev, next, delta: next - prev, source: null, note: null, atMs: t(at), ...extra })
const names = new Map([['a', 'Student A'], ['b', 'Student B']])
const run = (payments: StudioPayment[], ledger: LedgerChange[], month = MONTH) => reconcilePayments(month, payments, ledger, names)
const kinds = (payments: StudioPayment[], ledger: LedgerChange[], month = MONTH) => run(payments, ledger, month).findings.map(f => f.kind)

console.log('\nPayments that add their lessons:')
check('plan renewal adds 4 seconds later', kinds([pay('a', '2026-10-08T15:39:00Z', 'plan', 4)], [change('a', '2026-10-08T15:39:53Z', 11, 15)]), [])
check('package adds 4 at checkout', kinds([pay('a', '2026-10-05T13:01:00Z', 'package', 4)], [change('a', '2026-10-05T13:01:58Z', -1, 3)]), [])
check('lessons added by hand a day before the payment', kinds([pay('a', '2026-10-10T12:00:00Z', 'plan', 4)], [change('a', '2026-10-09T12:00:00Z', 0, 4)]), [])
check('two payments, two additions (double subscription)', kinds(
    [pay('a', '2026-10-15T20:14:00Z', 'plan', 4), pay('a', '2026-10-15T20:16:00Z', 'plan', 4)],
    [change('a', '2026-10-15T20:14:50Z', 3, 7), change('a', '2026-10-15T20:16:34Z', 7, 11)]), [])
check('plan without a lesson count, any addition counts', kinds([pay('a', '2026-10-08T15:00:00Z', 'plan', null)], [change('a', '2026-10-08T15:01:00Z', 0, 4)]), [])

console.log('\nPayments that do not:')
check('plan paid, nothing added', kinds([pay('a', '2026-10-08T15:39:00Z', 'plan', 4)], []), ['payment_without_lessons'])
check('plan paid, added 3 days later: both sides flagged',
    kinds([pay('a', '2026-10-08T15:00:00Z', 'plan', 4)], [change('a', '2026-10-11T16:00:00Z', 0, 4)]),
    ['payment_without_lessons', 'lessons_without_payment'])
check('plan paid, only 1 added', kinds([pay('a', '2026-10-08T15:00:00Z', 'plan', 4)], [change('a', '2026-10-08T15:01:00Z', 0, 1)]), ['wrong_lessons'])
check('lessons added to the other student do not count',
    kinds([pay('a', '2026-10-08T15:00:00Z', 'plan', 4)], [change('b', '2026-10-08T15:01:00Z', 0, 4)]),
    ['payment_without_lessons', 'lessons_without_payment'])
check('a free trial next to a payment is not its lessons', kinds(
    [pay('a', '2026-10-08T15:00:00Z', 'plan', 4)],
    [change('a', '2026-10-08T16:00:00Z', 0, 1, { source: 'free trial' })]), ['payment_without_lessons'])

console.log('\nLessons added without a payment:')
check('unlabelled +2, no payment', kinds([], [change('a', '2026-10-09T16:40:00Z', 2, 4)]), ['lessons_without_payment'])
check('labelled +1 (free trial)', kinds([], [change('a', '2026-10-09T16:40:00Z', 0, 1, { source: 'free trial' })]), [])
check('+1 with only a note', kinds([], [change('a', '2026-10-09T16:40:00Z', 3, 4, { note: 'credit not charged' })]), [])
check('-1 then +1 a day and a half later (given back)',
    kinds([], [change('a', '2026-10-22T23:23:00Z', 11, 10), change('a', '2026-10-24T09:12:00Z', 10, 11)]), [])
check('-1 then +1 20 minutes later (given back)',
    kinds([], [change('a', '2026-10-06T02:59:00Z', 11, 10), change('a', '2026-10-06T03:16:00Z', 10, 11)]), [])
check('-1 then +1 five days later is not a give-back',
    kinds([], [change('a', '2026-10-01T12:00:00Z', 5, 4), change('a', '2026-10-06T12:00:00Z', 4, 5)]), ['lessons_without_payment'])
check('one deduction gives back only one addition',
    kinds([], [change('a', '2026-10-06T02:00:00Z', 5, 4), change('a', '2026-10-06T03:00:00Z', 4, 5), change('a', '2026-10-06T04:00:00Z', 5, 6)]),
    ['lessons_without_payment'])
check('+4 by mistake, taken straight back', kinds([], [change('a', '2026-10-06T02:00:00Z', 1, 5), change('a', '2026-10-06T02:05:00Z', 5, 1)]), [])
check('+1 then a lesson the next day is still flagged', kinds([], [change('a', '2026-10-06T02:00:00Z', 1, 2), change('a', '2026-10-07T02:00:00Z', 2, 1)]), ['lessons_without_payment'])
check('another Stripe payment explains a hand top-up',
    kinds([pay('a', '2026-10-06T12:00:00Z', 'other', null)], [change('a', '2026-10-07T12:00:00Z', 0, 4)]), [])
check('another Stripe payment with nothing added is fine', kinds([pay('a', '2026-10-06T12:00:00Z', 'other', null)], []), [])

console.log('\nRefunds:')
check('refunded package, lessons kept', kinds([pay('a', '2026-10-05T13:00:00Z', 'package', 4, { refunded: true })], [change('a', '2026-10-05T13:01:00Z', 0, 4)]), ['refunded_lessons_kept'])
check('refunded package, lessons taken back', kinds(
    [pay('a', '2026-10-05T13:00:00Z', 'package', 4, { refunded: true })],
    [change('a', '2026-10-05T13:01:00Z', 0, 4), change('a', '2026-10-12T13:00:00Z', 4, 0)]), [])
check('refunded package, nothing added', kinds([pay('a', '2026-10-05T13:00:00Z', 'package', 4, { refunded: true })], []), [])
check('refunded other payment does not explain a top-up',
    kinds([pay('a', '2026-10-06T12:00:00Z', 'other', null, { refunded: true })], [change('a', '2026-10-06T13:00:00Z', 0, 4)]), ['lessons_without_payment'])

console.log('\nMonth edges (studio time, Eastern):')
const lateOct = [pay('a', '2026-11-01T03:30:00Z', 'plan', 4)] // Oct 31 11:30pm EDT
const earlyNov = [change('a', '2026-11-01T04:30:00Z', 0, 4)]  // Nov 1 12:30am EDT
check('Oct 31 payment, lessons on Nov 1: October is clean', kinds(lateOct, earlyNov, '2026-10'), [])
check('Oct 31 payment, lessons on Nov 1: November is clean', kinds(lateOct, earlyNov, '2026-11'), [])
check('payment in September is not reported in October', kinds([pay('a', '2026-09-20T12:00:00Z', 'plan', 4)], []), [])

console.log('\nCounts and wording:')
const r = run(
    [pay('a', '2026-10-08T15:39:00Z', 'plan', 4, { amountCents: 18667 }), pay('b', '2026-10-09T12:00:00Z', 'plan', 4)],
    [change('a', '2026-10-08T15:39:53Z', -1, 3), change('b', '2026-10-20T12:00:00Z', 0, 2), change('a', '2026-10-21T12:00:00Z', 0, 1, { source: 'free trial' })],
)
check('counts', [r.payments, r.paidCents, r.additions, r.lessonsAdded, r.paidFor, r.labelled, r.givenBack], [2, 35167, 3, 7, 1, 1, 0])
check('payment line', r.findings[0].detail, 'paid $165.00 on Oct 9 (monthly plan, 4 lessons), but no lessons were added within 2 days.')
check('addition line', r.findings[1].detail, '2 lessons added Oct 20 8:00am (0 to 2) with no Stripe payment within 2 days and no reason noted. Fine if it was paid another way or given on purpose.')
check('no em dashes anywhere', r.findings.some(f => f.detail.includes(String.fromCharCode(0x2014))), false)
const big = run([pay('a', '2026-10-08T15:00:00Z', 'package', 12, { amountCents: 123456 })], [])
check('thousands separator', big.findings[0].detail, 'paid $1,234.56 on Oct 8 (package, 12 lessons), but no lessons were added within 2 days.')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
