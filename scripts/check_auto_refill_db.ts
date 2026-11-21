/**
 * Auto-refill (#1477) against the real database, as the test student ("Piano
 * Student"), with the fake Stripe (lib/auto-refill-stripe.ts fakeStripe) and
 * no emails: nothing reaches Stripe or Resend. Checks the tables, the one-open
 * index, credit_auto_refill and its 'auto-refill' ledger label, and the
 * conditional updates, end to end:
 *
 *   turn on (first 4 lessons) -> twice, added once -> a lesson runs them out
 *   -> charged once -> another run-out, declined -> lessons keep going, no
 *   second refill -> new card pays it -> turned off.
 *
 * The test student's lessons end exactly where they started and its
 * auto-refill rows are removed (the ledger keeps labelled rows, as for any
 * change). Refuses to run if the test student already has auto-refill.
 *
 *   npx tsx scripts/check_auto_refill_db.ts
 */
import assert from 'node:assert/strict'
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from '../lib/supabase/admin'
import { dbStore } from '../lib/auto-refill-db'
import { fakeStripe } from '../lib/auto-refill-stripe'
import { completeCheckout, runAutoRefill, turnOffAutoRefill, type AutoRefillDeps } from '../lib/auto-refill'
import { TEST_STUDENT_ID } from '../lib/rollouts'
import { autoRefillChargedEmail, autoRefillDeclinedEmail } from '../lib/family-emails'

const MIN = 60_000
const HOUR = 60 * MIN

async function main() {
    const client = createAdminClient()
    const credits = async () => {
        const { data } = await client.from('profiles').select('credits').eq('id', TEST_STUDENT_ID).single()
        return Number(data!.credits)
    }
    const adjust = async (delta: number, reason: string) => {
        const { error } = await client.rpc('adjust_lesson_credits', { p_student: TEST_STUDENT_ID, p_delta: delta, p_reason: reason })
        if (error) throw new Error(error.message)
    }
    const store = dbStore(client)
    if (await store.plan(TEST_STUDENT_ID)) throw new Error('the test student already has auto-refill; not touching it')

    const start = await credits()
    const startedAt = new Date().toISOString()
    console.log(`test student starts with ${start} lessons`)
    const clock = { offset: 0 }
    const studio: string[] = []
    const family: string[] = []
    const deps = (stripe = fakeStripe()): AutoRefillDeps & { stripe: ReturnType<typeof fakeStripe> } => ({
        store,
        stripe,
        notify: {
            family: async (_to, e) => { family.push(e.subject); return true },
            studio: async e => { studio.push(e.subject); return true },
            track: async () => {},
        },
        emails: { charged: autoRefillChargedEmail, declined: autoRefillDeclinedEmail },
        appUrl: 'http://localhost:3031',
        now: () => Date.now() + clock.offset,
    })

    try {
        // 1. Turned on while out of lessons? Here with lessons left, in payment mode: 4 added, once.
        const d1 = deps()
        const { url } = await d1.stripe.createCheckout({
            mode: 'payment', kind: 'auto_refill_start', customerId: 'cus_fake_test', userId: TEST_STUDENT_ID, credits: 4, priceCents: 15500,
            pointId: null, endSubscriptionId: null, refillId: null, successUrl: 'http://x/?s={CHECKOUT_SESSION_ID}', cancelUrl: 'http://x',
        })
        const session = await d1.stripe.getCheckout(url.split('s=')[1])
        // The test student's real Stripe customer is on its profile; the fake checkout must match it.
        const { data: prof } = await client.from('profiles').select('stripe_customer_id').eq('id', TEST_STUDENT_ID).single()
        session.customerId = prof!.stripe_customer_id
        const r1 = await completeCheckout(d1, session)
        const r2 = await completeCheckout(d1, session)
        assert.equal(r1.action, 'started')
        assert.equal(r2.action, 'already')
        assert.equal(await credits(), start + 4, 'first 4 lessons added once')
        const { data: led } = await client.from('credit_transactions').select('source, note, delta').eq('student_id', TEST_STUDENT_ID).gte('changed_at', startedAt).order('changed_at')
        assert.deepEqual(led!.map((l: any) => `${l.source}|${l.note}|${l.delta}`), ['auto-refill|auto-refill started|4'], 'labelled in the credit history')
        console.log('1. turned on: +4 once, labelled auto-refill')

        // 2. Lessons run out (a lesson after the plan was armed): one refill, charged once.
        await adjust(-(start + 4 - 1), 'auto-refill check: down to 1 lesson')
        await adjust(-1, 'auto-refill check: a lesson runs them out')
        assert.equal(await credits(), 0)
        const d2 = deps()
        clock.offset = 13 * MIN
        const [a, b] = await Promise.all([runAutoRefill(d2), runAutoRefill(d2)])
        const paid = [...a.charged, ...b.charged].filter(c => c.outcome === 'paid').length
        assert.equal(paid, 1, 'two runs at once: one charge')
        assert.equal(d2.stripe.calls.filter(c => c.op === 'charge').length, 1)
        assert.equal(await credits(), 4)
        await runAutoRefill(d2)
        assert.equal(d2.stripe.calls.filter(c => c.op === 'charge').length, 1, 'a later run: nothing more')
        console.log('2. ran out: charged once, +4')

        // 3. Another run-out a day later, declined: lessons keep going, no second refill.
        await adjust(-4, 'auto-refill check: lessons run out again')
        const d3 = deps(fakeStripe({ decline: true }))
        clock.offset = 21 * HOUR
        await runAutoRefill(d3)
        const open = await store.openRefill(TEST_STUDENT_ID)
        assert.equal(open?.status, 'failed')
        assert.equal(open?.attempts, 1)
        assert.ok(open?.next_retry_at)
        await adjust(-1, 'auto-refill check: a lesson while declined')
        await runAutoRefill(d3)
        assert.equal(d3.stripe.calls.filter(c => c.op === 'charge').length, 1, 'no retry before 3 days')
        const { count } = await client.from('auto_refills').select('id', { count: 'exact', head: true }).eq('student_id', TEST_STUDENT_ID).eq('kind', 'refill')
        assert.equal(count, 2, 'no second refill while one is open')
        // The one-open index itself refuses a second open refill.
        const { error: dupError } = await client.from('auto_refills').insert({ student_id: TEST_STUDENT_ID, kind: 'refill', status: 'due', credits: 4, price_cents: 15500, amount_cents: 15500 })
        assert.equal((dupError as any)?.code, '23505')
        assert.equal(await credits(), -1)
        console.log('3. declined: failed with a retry date, lessons went to -1, still one open refill')

        // 4. A new card in Settings pays it straight away.
        const d4 = deps()
        const card = await d4.stripe.getCheckout((await d4.stripe.createCheckout({
            mode: 'setup', kind: 'auto_refill_card', customerId: prof!.stripe_customer_id, userId: TEST_STUDENT_ID, credits: 4, priceCents: 15500,
            pointId: null, endSubscriptionId: null, refillId: open!.id, successUrl: 'http://x/?s={CHECKOUT_SESSION_ID}', cancelUrl: 'http://x',
        })).url.split('s=')[1])
        const r4 = await completeCheckout(d4, card)
        assert.equal(r4.charge, 'paid')
        assert.equal(await credits(), 3)
        assert.equal((await store.plan(TEST_STUDENT_ID))!.card_last4, '5556')
        console.log('4. new card: the waiting refill paid, +4')

        // 5. Turned off.
        const off = await turnOffAutoRefill(deps(), TEST_STUDENT_ID, 'family')
        assert.equal(off.wasOn, true)
        assert.equal((await store.plan(TEST_STUDENT_ID))!.status, 'off')
        console.log('5. turned off')
        console.log(`emails that would have gone: family ${JSON.stringify(family)}; studio ${studio.length}`)
    } finally {
        await client.from('auto_refills').delete().eq('student_id', TEST_STUDENT_ID)
        await client.from('auto_refill_plans').delete().eq('student_id', TEST_STUDENT_ID)
        const now = await credits()
        if (now !== start) await adjust(start - now, 'auto-refill check: back to where it started')
        assert.equal(await credits(), start, 'the test student ends where it started')
        console.log(`cleaned up: test student back to ${start} lessons, no auto-refill rows`)
    }
    console.log('check_auto_refill_db: all good')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
