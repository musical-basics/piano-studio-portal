/**
 * Self-check for the automatic free trial (#946, lib/free-trial.ts) and the
 * free-lesson reasons (#947, lib/free-lesson-reasons.ts). Pure: nothing
 * touches the database.
 *
 *   npx tsx scripts/check_free_trial.ts
 */
import assert from 'node:assert/strict'
import { freeTrialDecision, type TrialFacts } from '../lib/free-trial'
import { FREE_LESSON_REASONS, FREE_TRIAL_REASON } from '../lib/free-lesson-reasons'

const base: TrialFacts = { date: '2026-11-24', time: '13:15:00', others: [], creditsNow: 0, creditAdditions: 0 }
const lesson = (date: string, time: string, status: string) => ({ id: `${date}-${time}`, date, time, status })
const yes = (f: Partial<TrialFacts>) => freeTrialDecision({ ...base, ...f }).trial

// A brand new student, nothing paid: the trial.
assert.equal(yes({}), true)
// Later lessons already booked (the weekly slot) do not matter.
assert.equal(yes({ others: [lesson('2026-12-01', '13:15:00', 'scheduled')] }), true)
// Below zero is still nothing paid (no purchase ever, no ledger addition).
assert.equal(yes({ creditsNow: -1 }), true)

// Not the first lesson: another one was logged, or was a no-show.
assert.equal(yes({ others: [lesson('2026-11-17', '13:15:00', 'completed')] }), false)
assert.equal(yes({ others: [lesson('2026-11-30', '13:15:00', 'completed')] }), false, 'logged later counts too')
assert.equal(yes({ others: [lesson('2026-11-17', '13:15:00', 'cancelled')] }), false)
// An earlier lesson still unlogged would be the trial instead.
assert.equal(yes({ others: [lesson('2026-11-17', '13:15:00', 'scheduled')] }), false)
assert.equal(yes({ others: [lesson('2026-11-24', '10:00:00', 'scheduled')] }), false, 'earlier the same day')

// Paid: lessons on the balance, or the ledger ever added some (a purchase,
// a plan payment, or the old +1 'free trial' fix, so never free twice).
assert.equal(yes({ creditsNow: 4 }), false)
assert.equal(yes({ creditsNow: 1 }), false)
assert.equal(yes({ creditAdditions: 1 }), false)
assert.equal(yes({ creditsNow: 0, creditAdditions: 2 }), false)
// Teacher accounts (hundreds of credits) never.
assert.equal(yes({ creditsNow: 998 }), false)

// Every no says why.
assert.match(freeTrialDecision({ ...base, creditsNow: 4 }).why, /paid/)

// The reasons: his four words, and the trial's reason is one of them.
assert.deepEqual([...FREE_LESSON_REASONS], ['Make-up', 'My mistake', 'Trial', 'Gift'])
assert.ok(FREE_LESSON_REASONS.includes(FREE_TRIAL_REASON))

console.log('check_free_trial: all good')
