/**
 * Self-check for auto-refill (#1477, lib/auto-refill.ts) with a fake Stripe
 * (lib/auto-refill-stripe.ts fakeStripe), an in-memory database and fake
 * emails: nothing touches Stripe, Supabase or Resend.
 *
 *   npx tsx scripts/check_auto_refill.ts
 *
 * Every branch: who is offered it, the wording, finding a run-out, the
 * 12-minute wait past Undo, charging once (also with two runs at once), a
 * decline and its retries and emails, a new card paying the waiting refill,
 * turning it off, the stage switch, the 20-hour guard, a charge whose outcome
 * was lost, the webhook, the checkout coming back twice, and the run cap.
 */
import assert from 'node:assert/strict'
import {
    autoRefillWording, chargeAmount, chargeRefill, completeCheckout, decideOffer, MAX_ATTEMPTS, MAX_CHARGES_PER_RUN, priceWords,
    readyToCharge, reconcilePaymentIntent, runAutoRefill, turnOffAutoRefill,
    type AutoRefillDeps, type AutoRefillStore, type CheckoutInfo, type Family, type OfferInput, type PlanRow, type RefillRow,
} from '../lib/auto-refill'
import { fakeStripe, type FakeOptions } from '../lib/auto-refill-stripe'
import { autoRefillChargedEmail, autoRefillDeclinedEmail } from '../lib/family-emails'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const T0 = Date.parse('2026-12-01T15:00:00Z')

// ------------------------------------------------------- in-memory db ---

type Ledger = { student_id: string; previous_credits: number; new_credits: number; delta: number; source: string | null; changed_at: string }

function memoryDb(clock: { now: number }) {
    const profiles = new Map<string, Family>()
    const plans = new Map<string, PlanRow>()
    const refills = new Map<string, RefillRow>()
    const ledger: Ledger[] = []
    let stageOff = false
    let seq = 0
    const iso = () => new Date(clock.now).toISOString()
    // updated_at must change on every write, even with a frozen clock.
    let tick = 0
    const stamp = () => new Date(clock.now).toISOString().replace('Z', `${String(++tick).padStart(6, '0')}Z`)

    function setCredits(id: string, next: number, source: string | null) {
        const p = profiles.get(id)!
        ledger.push({ student_id: id, previous_credits: p.credits, new_credits: next, delta: next - p.credits, source, changed_at: iso() })
        p.credits = next
    }

    const open = (id: string) => [...refills.values()].find(r => r.student_id === id && ['due', 'charging', 'failed'].includes(r.status)) ?? null

    const store: AutoRefillStore = {
        async plan(id) { return plans.get(id) ? { ...plans.get(id)! } : null },
        async plansOn() { return [...plans.values()].filter(p => p.status === 'on').map(p => ({ ...p })) },
        async family(id) { return profiles.get(id) ? { ...profiles.get(id)! } : null },
        async openRefill(id) { const r = open(id); return r ? { ...r } : null },
        async refill(id) { return refills.get(id) ? { ...refills.get(id)! } : null },
        async refillByPaymentIntent(pi) { const r = [...refills.values()].find(x => x.stripe_payment_intent_id === pi); return r ? { ...r } : null },
        async lastRunOutAfter(id, since) {
            const rows = ledger.filter(l => l.student_id === id && l.delta < 0 && l.new_credits <= 0 && l.changed_at > since)
            return rows.length ? rows[rows.length - 1].changed_at : null
        },
        async paidSince(id, since) {
            return [...refills.values()].some(r => r.student_id === id && r.kind === 'refill' && r.status === 'paid' && (r.paid_at ?? '') >= since)
        },
        async insertDueRefill(plan, triggeredAt) {
            if (open(plan.student_id)) return null
            const r: RefillRow = {
                id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, student_id: plan.student_id, kind: 'refill', status: 'due',
                credits: plan.credits, price_cents: plan.price_cents, amount_cents: plan.price_cents, account_credit_cents: 0, triggered_at: triggeredAt,
                stripe_payment_intent_id: null, checkout_session_id: null, attempts: 0, next_retry_at: null, last_error: null, charging_at: null,
                paid_at: null, credited_at: null, credits_before: null, credits_after: null, note: null, created_at: iso(), updated_at: stamp(),
            }
            refills.set(r.id, r)
            return { ...r }
        },
        async insertStartRefill(s) {
            const existing = [...refills.values()].find(r => r.checkout_session_id === s.sessionId)
            if (existing) return { ...existing }
            const r: RefillRow = {
                id: `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`, student_id: s.studentId, kind: 'start', status: 'paid',
                credits: s.credits, price_cents: s.priceCents, amount_cents: s.amountCents, account_credit_cents: s.accountCreditCents, triggered_at: null,
                stripe_payment_intent_id: s.paymentIntentId, checkout_session_id: s.sessionId, attempts: 1, next_retry_at: null, last_error: null,
                charging_at: null, paid_at: iso(), credited_at: null, credits_before: null, credits_after: null, note: null, created_at: iso(), updated_at: stamp(),
            }
            refills.set(r.id, r)
            return { ...r }
        },
        async openRefills() { return [...refills.values()].filter(r => ['due', 'charging', 'failed'].includes(r.status)).map(r => ({ ...r })) },
        async paidUncredited() { return [...refills.values()].filter(r => r.status === 'paid' && !r.credited_at).map(r => ({ ...r })) },
        async transition(r, patch) {
            const cur = refills.get(r.id)
            if (!cur || cur.status !== r.status || cur.updated_at !== r.updated_at) return null
            if (patch.status && ['due', 'charging', 'failed'].includes(patch.status) && !['due', 'charging', 'failed'].includes(cur.status)) {
                const other = open(cur.student_id)
                if (other && other.id !== cur.id) return null
            }
            Object.assign(cur, patch, { updated_at: stamp() })
            return { ...cur }
        },
        async credit(id) {
            const r = refills.get(id)!
            if (r.credited_at) return { previous: r.credits_before!, next: r.credits_after!, already: true }
            if (r.status !== 'paid') throw new Error(`refill is not paid (status ${r.status})`)
            const before = profiles.get(r.student_id)!.credits
            setCredits(r.student_id, before + r.credits, 'auto-refill')
            Object.assign(r, { credited_at: iso(), credits_before: before, credits_after: before + r.credits, updated_at: stamp() })
            const p = plans.get(r.student_id)
            if (p) Object.assign(p, { armed_at: iso(), last_refill_at: iso() })
            return { previous: before, next: before + r.credits, already: false }
        },
        async applyStart(s) {
            const cur = plans.get(s.studentId)
            if (cur && cur.start_session_id === s.sessionId) return null
            const row: PlanRow = {
                student_id: s.studentId, status: 'on', stripe_customer_id: s.customerId, payment_method_id: s.paymentMethodId,
                card_brand: s.card?.brand ?? null, card_last4: s.card?.last4 ?? null, credits: s.credits, price_cents: s.priceCents,
                pricing_point_id: s.pointId, started_at: iso(), armed_at: iso(), start_session_id: s.sessionId, card_session_id: cur?.card_session_id ?? null,
                ended_subscription_id: s.endedSubscriptionId, last_refill_at: cur?.last_refill_at ?? null, stopped_at: null, stopped_by: null, updated_at: iso(),
            }
            plans.set(s.studentId, row)
            return { ...row }
        },
        async applyCard(s) {
            const cur = plans.get(s.studentId)
            if (!cur || cur.card_session_id === s.sessionId) return null
            Object.assign(cur, { payment_method_id: s.paymentMethodId, card_brand: s.card?.brand ?? null, card_last4: s.card?.last4 ?? null, card_session_id: s.sessionId })
            return { ...cur }
        },
        async turnOff(id, by) {
            const cur = plans.get(id)
            if (!cur || cur.status !== 'on') return null
            Object.assign(cur, { status: 'off', stopped_at: iso(), stopped_by: by })
            return { ...cur }
        },
        async rearm(id) { const p = plans.get(id); if (p) p.armed_at = iso() },
        async chargingAllowed() { return !stageOff },
    }

    return {
        store,
        profiles, plans, refills, ledger, setCredits,
        setStageOff: (v: boolean) => { stageOff = v },
        addFamily(id: string, credits: number, extra: Partial<Family> = {}) {
            profiles.set(id, { id, name: 'Piano Student', parentName: null, email: 'family@example.com', credits, status: 'active', role: 'student', stripeCustomerId: `cus_${id.slice(0, 4)}`, ...extra })
        },
        addPlan(id: string, extra: Partial<PlanRow> = {}) {
            plans.set(id, {
                student_id: id, status: 'on', stripe_customer_id: `cus_${id.slice(0, 4)}`, payment_method_id: 'pm_fake_card', card_brand: 'visa', card_last4: '4242',
                credits: 4, price_cents: 16500, pricing_point_id: null, started_at: iso(), armed_at: iso(), start_session_id: 'cs_old', card_session_id: null,
                ended_subscription_id: null, last_refill_at: null, stopped_at: null, stopped_by: null, updated_at: iso(), ...extra,
            })
        },
    }
}

function setup(opts: FakeOptions = {}) {
    const clock = { now: T0 }
    const db = memoryDb(clock)
    const stripe = fakeStripe(opts)
    const familyEmails: { to: string; subject: string; html: string }[] = []
    const studioEmails: { subject: string; lines: string[] }[] = []
    const tracked: string[] = []
    const deps: AutoRefillDeps = {
        store: db.store,
        stripe,
        notify: {
            family: async (to, e) => { familyEmails.push({ to, ...e }); return true },
            studio: async e => { studioEmails.push(e); return true },
            track: async (id, action) => { tracked.push(action) },
        },
        emails: { charged: autoRefillChargedEmail, declined: autoRefillDeclinedEmail },
        appUrl: 'https://lessons.example.com',
        now: () => clock.now,
    }
    return { clock, db, stripe, deps, familyEmails, studioEmails, tracked }
}

const A = '0000000a-0000-4000-8000-000000000001'
const B = '0000000b-0000-4000-8000-000000000002'
const charges = (s: ReturnType<typeof fakeStripe>) => s.calls.filter(c => c.op === 'charge')

/** A lesson log: one credit taken. */
function lesson(t: ReturnType<typeof setup>, id: string) {
    t.db.setCredits(id, t.db.profiles.get(id)!.credits - 1, 'lesson')
}

async function main() {
    // 1. The approved wording (#1279), with each family's own lessons and price.
    assert.equal(autoRefillWording(4, 16500).full,
        'Auto-refill: 4 lessons for $165. Your card is charged only when your lessons run out, never on a schedule. Turn it off anytime in Settings.')
    assert.equal(autoRefillWording(4, 22500).title, 'Auto-refill: 4 lessons for $225')
    assert.equal(priceWords(21167), '$211.67')

    // 2. Who is offered it (#1278).
    const base: OfferInput = {
        inRollout: true, role: 'student', status: 'active', credits: 3,
        monthly: { id: 'pt1', credits: 4, price: 16500 }, monthlyFixedLength: false, running: null, existing: null,
    }
    const running = { id: 'sub_1', status: 'active', fixedLength: false, ending: false, periodEnd: '2026-12-15T00:00:00Z' }
    assert.equal(decideOffer({ ...base, inRollout: false }).show, false, 'old half: not offered')
    assert.deepEqual(decideOffer({ ...base, existing: { status: 'on', credits: 4, price_cents: 16500 } }), { show: false, reason: 'already on', on: true })
    assert.equal(decideOffer({ ...base, status: 'inactive' }).show, false)
    assert.equal(decideOffer({ ...base, role: 'admin' }).show, false)
    assert.equal(decideOffer({ ...base, monthly: null }).show, false, 'no monthly price, no offer')
    const save = decideOffer(base)
    assert.ok(save.show && save.mode === 'save' && save.priceCents === 16500 && save.credits === 4 && save.title === 'Auto-refill: 4 lessons for $165')
    const buy = decideOffer({ ...base, credits: 0 })
    assert.ok(buy.show && buy.mode === 'buy', 'out of lessons: the first 4 are bought now')
    assert.ok((d => d.show && d.mode === 'buy')(decideOffer({ ...base, credits: -2 })))
    const sw = decideOffer({ ...base, running })
    assert.ok(sw.show && sw.mode === 'switch' && sw.subscriptionId === 'sub_1' && sw.subscriptionEndsAt === running.periodEnd, 'monthly plan: switch, ending it at period end')
    const sw2 = decideOffer({ ...base, running: { ...running, ending: true } })
    assert.ok(sw2.show && sw2.mode === 'switch' && sw2.subscriptionId === null, 'already ending: nothing to end')
    assert.equal(decideOffer({ ...base, running: { ...running, fixedLength: true } }).show, false, 'quarter still running')
    assert.equal(decideOffer({ ...base, monthlyFixedLength: true, running: { ...running, ending: true } }).show, false, 'last month of a quarter')
    assert.equal(decideOffer({ ...base, running: { ...running, status: 'past_due' } }).show, false)
    const quarterDone = decideOffer({ ...base, monthlyFixedLength: true, monthly: { id: 'q', credits: 4, price: 21167 } })
    assert.ok(quarterDone.show && quarterDone.priceCents === 21167, 'quarter ended: offered at their plan price')

    // 3. Small rules.
    assert.deepEqual(chargeAmount(16500, 0), { amountCents: 16500, creditUsedCents: 0 })
    assert.deepEqual(chargeAmount(16500, 1500), { amountCents: 15000, creditUsedCents: 1500 })
    assert.deepEqual(chargeAmount(16500, 99999), { amountCents: 50, creditUsedCents: 16450 }, 'Stripe minimum stays on the card')
    const due = { status: 'due' as const, triggered_at: new Date(T0 - 5 * MIN).toISOString(), created_at: new Date(T0).toISOString(), next_retry_at: null }
    assert.equal(readyToCharge(due, T0), false, 'within the Undo window')
    assert.equal(readyToCharge(due, T0 + 8 * MIN), true, '12 minutes after the lesson log')
    assert.equal(readyToCharge({ ...due, status: 'failed', next_retry_at: null }, T0 + DAY * 30), false, 'stopped trying')
    assert.equal(readyToCharge({ ...due, status: 'failed', next_retry_at: new Date(T0 + 1000).toISOString() }, T0 + 2000), true)

    // 4. A run-out is found and charged once; lessons labelled 'auto-refill'.
    {
        const t = setup()
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        let r = await runAutoRefill(t.deps)
        assert.equal(r.found.length, 0, 'lessons left: nothing')
        lesson(t, A) // 1 -> 0
        r = await runAutoRefill(t.deps)
        assert.equal(r.found.length, 1, 'ran out: a due refill')
        assert.equal(charges(t.stripe).length, 0, 'not charged inside the Undo window')
        t.clock.now += 13 * MIN
        r = await runAutoRefill(t.deps)
        assert.equal(r.charged[0].outcome, 'paid')
        assert.equal(t.db.profiles.get(A)!.credits, 4)
        assert.equal(t.db.ledger.at(-1)!.source, 'auto-refill')
        assert.equal(charges(t.stripe).length, 1)
        assert.equal(charges(t.stripe)[0].args.amountCents, 16500)
        assert.equal(charges(t.stripe)[0].args.paymentIntentId, null, 'first try creates the PaymentIntent')
        assert.equal(t.familyEmails.length, 1)
        assert.equal(t.familyEmails[0].subject, '4 lessons added (auto-refill)')
        assert.ok(t.familyEmails[0].html.includes('4 lessons for $165') && t.familyEmails[0].html.includes('ending 4242'))
        assert.ok(!/balance|total/i.test(t.familyEmails[0].html), 'no balance or payment math')
        assert.ok(t.studioEmails[0].subject.startsWith('Auto-refill charged'))
        assert.deepEqual(t.tracked, ['refill_charged'])
        // Runs again: nothing more.
        t.clock.now += 15 * MIN
        await runAutoRefill(t.deps)
        t.db.profiles.get(A)!.credits = 0 // a hand edit to 0 with no lesson since: no charge
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, 1, 'one charge for one run-out')
        // The next run-out, a day later, is a new refill.
        t.db.profiles.get(A)!.credits = 1
        t.clock.now += DAY
        lesson(t, A)
        t.clock.now += 13 * MIN
        await runAutoRefill(t.deps)
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, 2)
        assert.equal(t.db.profiles.get(A)!.credits, 4)
    }

    // 5. Two runs at once never charge twice.
    {
        const t = setup()
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(t, A)
        t.clock.now += 13 * MIN
        const [r1, r2] = await Promise.all([runAutoRefill(t.deps), runAutoRefill(t.deps)])
        const paid = [...r1.charged, ...r2.charged].filter(c => c.outcome === 'paid').length
        assert.equal(paid, 1)
        assert.equal(charges(t.stripe).length, 1)
        assert.equal(t.db.profiles.get(A)!.credits, 4)
        const refill = [...t.db.refills.values()][0]
        const again = await Promise.all([chargeRefill(t.deps, refill, { force: true }), chargeRefill(t.deps, refill, { force: true })])
        assert.deepEqual(again.map(a => a.outcome), ['busy', 'busy'], 'a paid refill is never charged again')
        assert.equal(charges(t.stripe).length, 1)
    }

    // 6. Undone before the charge: skipped, no charge.
    {
        const t = setup()
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(t, A)
        await runAutoRefill(t.deps)
        t.db.setCredits(A, 1, 'undo')
        t.clock.now += 13 * MIN
        const r = await runAutoRefill(t.deps)
        assert.equal(r.charged[0].outcome, 'skipped')
        assert.equal(charges(t.stripe).length, 0)
        assert.equal([...t.db.refills.values()][0].status, 'skipped')
    }

    // 7. Declined (#1277): family emailed a fix link, studio told, retried 3 days on, lessons keep going.
    {
        const t = setup({ decline: true })
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(t, A)
        t.clock.now += 13 * MIN
        await runAutoRefill(t.deps)
        let refill = [...t.db.refills.values()][0]
        assert.equal(refill.status, 'failed')
        assert.equal(refill.attempts, 1)
        assert.equal(refill.next_retry_at, new Date(t.clock.now + 3 * DAY).toISOString())
        assert.equal(t.familyEmails.length, 1)
        assert.equal(t.familyEmails[0].subject, "Your auto-refill didn't go through")
        assert.ok(t.familyEmails[0].html.includes('/student/settings#auto-refill'), 'a link to fix the card and pay')
        assert.ok(t.familyEmails[0].html.includes('keep going'))
        assert.ok(t.studioEmails[0].subject.startsWith('Auto-refill declined: '))
        assert.ok(t.studioEmails[0].lines.some(l => l.includes('Your card was declined.')))
        assert.deepEqual(t.tracked, ['refill_declined'])
        // Lessons keep going below 0; no second refill while this one is open.
        lesson(t, A)
        t.clock.now += DAY
        await runAutoRefill(t.deps)
        assert.equal(t.db.profiles.get(A)!.credits, -1)
        assert.equal(t.db.refills.size, 1)
        assert.equal(charges(t.stripe).length, 1, 'no retry before 3 days')
        // Day 3: the same PaymentIntent is tried again; only the studio hears.
        t.clock.now += 2 * DAY + MIN
        await runAutoRefill(t.deps)
        refill = [...t.db.refills.values()][0]
        assert.equal(charges(t.stripe).length, 2)
        assert.equal(charges(t.stripe)[1].args.paymentIntentId, refill.stripe_payment_intent_id, 'a retry confirms the same PaymentIntent')
        assert.equal(charges(t.stripe)[1].args.attempt, 2)
        assert.equal(t.familyEmails.length, 1)
        assert.ok(t.studioEmails.at(-1)!.subject.includes('again (try 2)'))
        // Day 6: the last try; the family gets one more email; no more tries.
        t.clock.now += 3 * DAY + MIN
        await runAutoRefill(t.deps)
        refill = [...t.db.refills.values()][0]
        assert.equal(refill.attempts, MAX_ATTEMPTS)
        assert.equal(refill.next_retry_at, null)
        assert.equal(t.familyEmails.length, 2)
        assert.equal(t.familyEmails[1].subject, 'Your auto-refill is still waiting for a card')
        assert.ok(t.studioEmails.at(-1)!.subject.includes('stopped trying'))
        t.clock.now += 10 * DAY
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, 3, 'no fourth try')

        // A new card in Settings pays the waiting refill straight away, on the same PaymentIntent.
        t.stripe.charges.clear()
        const ok = fakeStripe()
        t.deps.stripe = ok
        const card: CheckoutInfo = {
            id: 'cs_card_1', status: 'complete', mode: 'setup', customerId: `cus_${A.slice(0, 4)}`,
            metadata: { userId: A, type: 'auto_refill_card' }, paymentMethodId: 'pm_fake_new_card', paymentIntentId: null, amountTotal: null,
        }
        const res = await completeCheckout(t.deps, card)
        assert.equal(res.charge, 'paid')
        assert.equal(charges(ok)[0].args.paymentIntentId, refill.stripe_payment_intent_id)
        assert.equal(charges(ok)[0].args.paymentMethodId, 'pm_fake_new_card')
        assert.equal(t.db.profiles.get(A)!.credits, 3, '-1 plus 4')
        assert.equal(t.db.plans.get(A)!.card_last4, '5556')
        const twice = await completeCheckout(t.deps, card)
        assert.equal(twice.action, 'already', 'the webhook and the return page: applied once')
        assert.equal(charges(ok).length, 1)
    }

    // 8. Turned off with a declined refill: the refill is cancelled, the monthly plan they left resumes.
    {
        const t = setup({ decline: true })
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString(), ended_subscription_id: 'sub_old' })
        lesson(t, A)
        t.clock.now += 13 * MIN
        await runAutoRefill(t.deps)
        const res = await turnOffAutoRefill(t.deps, A, 'family')
        assert.deepEqual(res, { ok: true, wasOn: true, resumedMonthly: true, cancelledRefill: true })
        assert.equal([...t.db.refills.values()][0].status, 'cancelled')
        assert.ok(t.stripe.calls.some(c => c.op === 'cancelCharge'))
        assert.ok(t.stripe.calls.some(c => c.op === 'resumePlan' && c.args.subscriptionId === 'sub_old'))
        assert.ok(t.tracked.includes('turned_off'))
        assert.equal((await turnOffAutoRefill(t.deps, A, 'family')).wasOn, false)
        t.clock.now += 4 * DAY
        lesson(t, A)
        t.clock.now += 13 * MIN
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, 1, 'off: never charged again')
    }

    // 9. Stage off pauses charging; on again, it charges.
    {
        const t = setup()
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(t, A)
        t.clock.now += 13 * MIN
        t.db.setStageOff(true)
        const r = await runAutoRefill(t.deps)
        assert.equal(r.paused, true)
        assert.equal(charges(t.stripe).length, 0)
        t.db.setStageOff(false)
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, 1)
    }

    // 10. Never two paid refills within 20 hours; then it goes through.
    {
        const t = setup()
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(t, A)
        t.clock.now += 13 * MIN
        await runAutoRefill(t.deps)
        t.db.profiles.get(A)!.credits = 1
        t.clock.now += 2 * HOUR
        lesson(t, A)
        t.clock.now += 13 * MIN
        const r = await runAutoRefill(t.deps)
        assert.equal(r.charged[0].outcome, 'held')
        assert.equal(charges(t.stripe).length, 1)
        t.clock.now += 18 * HOUR
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, 2)
    }

    // 11. A charge whose answer was lost: looked up after 10 minutes, charged once.
    {
        const t = setup({ throwOnCharge: true })
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(t, A)
        t.clock.now += 13 * MIN
        let r = await runAutoRefill(t.deps)
        assert.equal(r.charged[0].outcome, 'unknown')
        assert.equal([...t.db.refills.values()][0].status, 'charging')
        const ok = fakeStripe()
        t.deps.stripe = ok
        t.clock.now += 5 * MIN
        await runAutoRefill(t.deps)
        assert.equal(charges(ok).length, 0, 'not touched for 10 minutes')
        t.clock.now += 6 * MIN
        r = await runAutoRefill(t.deps)
        assert.equal(r.recovered[0].outcome, 'unknown', 'Stripe never saw it: back to due')
        assert.equal(charges(ok).length, 1, 'then charged on the same run')
        assert.equal(t.db.profiles.get(A)!.credits, 4)
    }

    // 12. Stripe took it but the run died before recording: found and recorded, no second charge.
    {
        const t = setup()
        t.db.addFamily(A, 0)
        t.db.addPlan(A)
        const plan = t.db.plans.get(A)!
        const refill = (await t.db.store.insertDueRefill(plan, new Date(T0).toISOString()))!
        const pi = `pi_fake_${refill.id}`
        t.stripe.charges.set(pi, { status: 'succeeded', paymentIntentId: pi })
        Object.assign(t.db.refills.get(refill.id)!, { status: 'charging', charging_at: new Date(T0).toISOString(), attempts: 1 })
        t.clock.now += 11 * MIN
        const r = await runAutoRefill(t.deps)
        assert.equal(r.recovered[0].outcome, 'paid')
        assert.equal(charges(t.stripe).length, 0)
        assert.equal(t.db.profiles.get(A)!.credits, 4)
        // The webhook's payment_intent.succeeded for it changes nothing.
        assert.equal(await reconcilePaymentIntent(t.deps, pi, refill.id), 'paid')
        assert.equal(t.db.profiles.get(A)!.credits, 4)
        assert.equal(await reconcilePaymentIntent(t.deps, 'pi_other', null), 'not_ours')
    }

    // 13. Paid but not credited (the run died between): the next run adds the lessons once.
    {
        const t = setup()
        t.db.addFamily(A, 0)
        t.db.addPlan(A)
        const refill = (await t.db.store.insertDueRefill(t.db.plans.get(A)!, new Date(T0).toISOString()))!
        Object.assign(t.db.refills.get(refill.id)!, { status: 'paid', paid_at: new Date(T0).toISOString() })
        const r = await runAutoRefill(t.deps)
        assert.deepEqual(r.credited, [refill.id])
        await runAutoRefill(t.deps)
        assert.equal(t.db.profiles.get(A)!.credits, 4)
    }

    // 14. Turning it on: first 4 lessons when out (once, however often the checkout comes back), switch ends the monthly plan.
    {
        const t = setup()
        t.db.addFamily(A, -1)
        const start: CheckoutInfo = {
            id: 'cs_start_1', status: 'complete', mode: 'payment', customerId: `cus_${A.slice(0, 4)}`,
            metadata: { userId: A, type: 'auto_refill_start', credits: '4', priceCents: '16500', pointId: 'pt1', accountCreditCents: '1500' },
            paymentMethodId: 'pm_fake_card', paymentIntentId: 'pi_start', amountTotal: 15000,
        }
        const r1 = await completeCheckout(t.deps, start)
        const r2 = await completeCheckout(t.deps, start)
        assert.equal(r1.action, 'started')
        assert.equal(r2.action, 'already')
        assert.equal(t.db.profiles.get(A)!.credits, 3, '-1 plus 4, once')
        assert.equal(t.db.ledger.filter(l => l.source === 'auto-refill').length, 1)
        assert.equal(t.db.plans.get(A)!.status, 'on')
        assert.equal(t.db.plans.get(A)!.card_last4, '4242')
        assert.deepEqual(t.tracked, ['chosen'])
        assert.ok(t.stripe.calls.some(c => c.op === 'useAccountCredit' && c.args.key === 'cs_start_1' && c.args.cents === 1500))
        const startRow = [...t.db.refills.values()].find(r => r.kind === 'start')!
        assert.equal(startRow.amount_cents, 15000)
        assert.equal(startRow.account_credit_cents, 1500)
        // The first purchase does not count as a refill for the 20-hour guard or a run-out.
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, 0)

        const u = setup()
        u.db.addFamily(B, 5)
        const sw: CheckoutInfo = {
            id: 'cs_switch_1', status: 'complete', mode: 'setup', customerId: `cus_${B.slice(0, 4)}`,
            metadata: { userId: B, type: 'auto_refill_start', credits: '4', priceCents: '22500', endSubscriptionId: 'sub_monthly' },
            paymentMethodId: 'pm_fake_card', paymentIntentId: null, amountTotal: null,
        }
        assert.equal((await completeCheckout(u.deps, sw)).action, 'started')
        assert.equal(u.db.profiles.get(B)!.credits, 5, 'nothing bought now')
        assert.ok(u.stripe.calls.some(c => c.op === 'endPlanAtPeriodEnd' && c.args.subscriptionId === 'sub_monthly'))
        assert.equal(u.db.plans.get(B)!.price_cents, 22500)
        assert.ok(u.studioEmails[0].lines.some(l => l.includes('monthly plan was set to stop')))
        // Someone else's checkout, an unfinished one, or another kind: ignored.
        assert.equal((await completeCheckout(u.deps, { ...sw, id: 'cs_x', customerId: 'cus_someone_else' })).action, 'ignored')
        assert.equal((await completeCheckout(u.deps, { ...sw, id: 'cs_y', status: 'open' })).action, 'ignored')
        assert.equal((await completeCheckout(u.deps, { ...sw, id: 'cs_z', metadata: { ...sw.metadata, type: 'one-time' } })).action, 'ignored')
    }

    // 15. Dollar account credit comes off a refill; no card on file, an inactive family.
    {
        const t = setup({ accountCreditCents: 1500 })
        t.db.addFamily(A, 1)
        t.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(t, A)
        t.clock.now += 13 * MIN
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe)[0].args.amountCents, 15000)
        assert.ok(t.stripe.calls.some(c => c.op === 'useAccountCredit' && c.args.cents === 1500))
        assert.ok(t.familyEmails[0].html.includes('$15 account credit was used'))

        const u = setup()
        u.db.addFamily(A, 1)
        u.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString(), payment_method_id: null })
        lesson(u, A)
        u.clock.now += 13 * MIN
        await runAutoRefill(u.deps)
        assert.equal([...u.db.refills.values()][0].status, 'failed')
        assert.equal([...u.db.refills.values()][0].last_error, 'no saved card (no_card)')
        assert.equal(charges(u.stripe).length, 0)

        // Stripe refuses the request (not the card): only the studio hears.
        const w = setup({ refuse: true })
        w.db.addFamily(A, 1)
        w.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(w, A)
        w.clock.now += 13 * MIN
        await runAutoRefill(w.deps)
        assert.equal([...w.db.refills.values()][0].status, 'failed')
        assert.equal(w.familyEmails.length, 0, 'the family is not told their card was declined')
        assert.ok(w.studioEmails[0].subject.includes('Stripe refused the charge'))
        assert.deepEqual(w.tracked, [])

        const v = setup()
        v.db.addFamily(A, 1, { status: 'inactive' })
        v.db.addPlan(A, { armed_at: new Date(T0 - HOUR).toISOString() })
        lesson(v, A)
        v.clock.now += 13 * MIN
        await runAutoRefill(v.deps)
        assert.equal([...v.db.refills.values()][0].status, 'skipped')
        assert.equal(charges(v.stripe).length, 0)
    }

    // 16. At most 5 charges a run; the rest next run.
    {
        const t = setup()
        const ids = Array.from({ length: 7 }, (_, i) => `0000000c-0000-4000-8000-${String(i).padStart(12, '0')}`)
        for (const id of ids) {
            t.db.addFamily(id, 1)
            t.db.addPlan(id, { armed_at: new Date(T0 - HOUR).toISOString() })
            lesson(t, id)
        }
        t.clock.now += 13 * MIN
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, MAX_CHARGES_PER_RUN)
        await runAutoRefill(t.deps)
        assert.equal(charges(t.stripe).length, 7)
        assert.ok(ids.every(id => t.db.profiles.get(id)!.credits === 4))
    }

    // 17. No em dashes in anything a family or Lionel reads.
    const texts = [
        autoRefillWording(4, 16500).full,
        autoRefillChargedEmail({ firstName: 'A', credits: 4, priceCents: 16500, cardLast4: '1', creditUsedCents: 100, settingsUrl: 'x' }).html,
        autoRefillDeclinedEmail({ firstName: 'A', credits: 4, priceCents: 16500, cardLast4: '1', nextTry: 'Mon', settingsUrl: 'x', final: true }).html,
    ]
    const EM_DASH = String.fromCharCode(0x2014)
    for (const s of texts) assert.ok(!s.includes(EM_DASH), 'no em dash')

    console.log('check_auto_refill: all good')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
