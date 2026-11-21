/**
 * Self-check for the admin Balances page (#935): how a family's Stripe plan
 * reads, sorting, the words in each cell, the loader (teacher accounts left
 * out, last/next lesson, Stripe asked in parallel with a time limit) and the
 * table itself rendered to HTML (read only: the only buttons sort columns).
 * Fake database and fake Stripe: nothing touches prod.
 *
 *   npx tsx scripts/check_balances.ts
 */
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type Stripe from 'stripe'
import {
    DEFAULT_SORT, creditWords, lessonWords, nextSort, paymentFromSubscriptions, paymentWords, sortBalances,
    type BalanceRow, type PaymentInfo,
} from '../lib/balances'
import { loadBalances, withTimeout, type StripeReader } from '../lib/core/balances'
import { summarizeSubscriptions } from '../lib/subscription-summary'
import { BalancesTable } from '../components/admin/balances-tab'
import type { DbClient } from '../lib/supabase/admin'

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000)

function sub(over: Record<string, any> = {}): Stripe.Subscription {
    const { periodEnd = '2026-12-01T15:00:00Z', unit = 20000, quantity = 1, ...rest } = over
    return {
        id: 'sub_1', status: 'active', cancel_at_period_end: false, cancel_at: null, metadata: { credits: '4' },
        ended_at: null, canceled_at: null, created: unix('2026-06-01T00:00:00Z'),
        items: { data: [{ current_period_end: unix(periodEnd), quantity, price: { unit_amount: unit } }] },
        ...rest,
    } as unknown as Stripe.Subscription
}

function row(over: Partial<BalanceRow> = {}): BalanceRow {
    return { studentId: over.name ?? 'x', name: 'X', credits: 3, lastLesson: null, nextLesson: null, payment: { kind: 'none' }, ...over }
}

async function main() {
    // ------------------------------------------------------ Stripe plans ---
    const auto = paymentFromSubscriptions([sub()])
    assert.deepEqual(auto, { kind: 'autopay', nextPaymentAt: '2026-12-01T15:00:00.000Z', amountCents: 20000, planAmountCents: 20000, pastDue: false, subscriptionId: 'sub_1' })
    assert.equal((paymentFromSubscriptions([sub({ quantity: 2 })]) as any).amountCents, 40000)
    assert.equal((paymentFromSubscriptions([sub({ status: 'past_due' })]) as any).pastDue, true)
    assert.deepEqual(paymentFromSubscriptions([sub({ cancel_at_period_end: true })]), { kind: 'ending', endingAt: '2026-12-01T15:00:00.000Z' })
    assert.deepEqual(paymentFromSubscriptions([sub({ cancel_at: unix('2026-12-15T05:00:00Z') })]), { kind: 'ending', endingAt: '2026-12-15T05:00:00.000Z' })
    assert.deepEqual(paymentFromSubscriptions([
        sub({ id: 'old', status: 'canceled', ended_at: unix('2026-03-01T12:00:00Z') }),
        sub({ id: 'newer', status: 'canceled', ended_at: unix('2026-10-03T12:00:00Z') }),
    ]), { kind: 'ended', endedAt: '2026-10-03T12:00:00.000Z', how: 'canceled' })
    assert.equal((paymentFromSubscriptions([sub({ status: 'unpaid' })]) as any).how, 'unpaid')
    assert.deepEqual(paymentFromSubscriptions([sub({ status: 'incomplete_expired' })]), { kind: 'none' }, 'a checkout that never paid is not a plan')
    assert.deepEqual(paymentFromSubscriptions([]), { kind: 'none' })
    // A running plan wins over an old ended one.
    assert.equal(paymentFromSubscriptions([sub({ id: 'gone', status: 'canceled' }), sub()]).kind, 'autopay')

    // The shared reader still says what the student banner always said.
    assert.deepEqual(summarizeSubscriptions([sub()]), { active: true, endingAt: null, nextPaymentAt: '2026-12-01T15:00:00.000Z', creditsPerCycle: 4, amountCents: 20000 })
    assert.deepEqual(summarizeSubscriptions([sub({ cancel_at_period_end: true })]), { active: true, endingAt: '2026-12-01T15:00:00.000Z', nextPaymentAt: null, creditsPerCycle: 4, amountCents: 20000 })
    assert.equal(summarizeSubscriptions([sub({ status: 'canceled' })]).active, false)
    // Older API versions keep current_period_end on the subscription itself.
    const legacy = sub({ current_period_end: unix('2026-12-05T15:00:00Z') }) as any
    legacy.items.data[0].current_period_end = undefined
    assert.equal(summarizeSubscriptions([legacy]).nextPaymentAt, '2026-12-05T15:00:00.000Z')

    // ------------------------------------------------------------ words ---
    const today = '2026-11-19'
    assert.equal(lessonWords({ date: '2026-11-18', time: '17:30' }, today), 'Wed, Nov 18, 5:30pm EST')
    assert.equal(lessonWords({ date: '2026-11-22', time: '19:00:00' }, today), 'Sun, Nov 22, 7pm EST')
    assert.equal(lessonWords({ date: '2025-12-02', time: '09:15' }, today), 'Tue, Dec 2, 2025, 9:15am EST', 'year only when not this year')
    assert.deepEqual(creditWords(-2), { text: '-2', note: 'owes 2 lessons', tone: 'owes' })
    assert.deepEqual(creditWords(-1), { text: '-1', note: 'owes 1 lesson', tone: 'owes' })
    assert.equal(creditWords(0).tone, 'zero')
    assert.equal(creditWords(1).tone, 'low')
    assert.equal(creditWords(8).note, null)
    // 15:00 UTC on Dec 1 is still Dec 1 in Eastern; 03:00 UTC on Dec 2 is Dec 1 too.
    assert.equal(paymentWords(auto, today).text, 'Tue, Dec 1, $200')
    assert.equal(paymentWords({ ...(auto as any), nextPaymentAt: '2026-12-02T03:00:00Z' }, today).text, 'Tue, Dec 1, $200')
    assert.equal(paymentWords({ ...(auto as any), amountCents: 18500 }, today).text, 'Tue, Dec 1, $185 (plan $200)')
    assert.deepEqual(paymentWords({ ...(auto as any), pastDue: true }, today).marker, 'Past due: last payment failed')
    assert.deepEqual(paymentWords({ kind: 'ended', endedAt: '2026-10-03T12:00:00Z', how: 'canceled' }, today), { text: 'Plan ended Sat, Oct 3', marker: 'No autopay', tone: 'warn' })
    assert.deepEqual(paymentWords({ kind: 'none' }, today), { text: 'No plan', marker: 'No autopay', tone: 'muted' })
    assert.deepEqual(paymentWords({ kind: 'auto_refill', credits: 4, priceCents: 16500, declined: false }, today), { text: 'Auto-refill: 4 for $165 when out', marker: null, tone: 'ok' })
    assert.equal(paymentWords({ kind: 'auto_refill', credits: 4, priceCents: 22500, declined: true }, today).marker, 'Refill declined')
    assert.equal(paymentWords({ kind: 'ending', endingAt: '2026-12-15T05:00:00Z' }, today).marker, 'No more payments')
    assert.equal(paymentWords({ kind: 'unknown', error: 'x' }, today).text, 'Stripe did not answer')

    // ---------------------------------------------------------- sorting ---
    const pay = (iso: string): PaymentInfo => ({ ...(auto as any), nextPaymentAt: iso })
    const rows = [
        row({ studentId: 'a', name: 'Avery', credits: 5, lastLesson: { date: '2026-11-10', time: '17:00' }, nextLesson: { date: '2026-11-24', time: '17:00' }, payment: pay('2026-12-01T15:00:00Z') }),
        row({ studentId: 'b', name: 'blake', credits: -2, lastLesson: { date: '2026-11-18', time: '09:00' }, nextLesson: null, payment: { kind: 'none' } }),
        row({ studentId: 'c', name: 'Casey', credits: 0, lastLesson: null, nextLesson: { date: '2026-11-20', time: '18:00' }, payment: pay('2026-11-25T15:00:00Z') }),
        row({ studentId: 'd', name: 'Drew', credits: 5, lastLesson: { date: '2026-11-18', time: '17:30' }, nextLesson: { date: '2026-11-20', time: '09:00' }, payment: { kind: 'ended', endedAt: null, how: 'canceled' } }),
    ]
    const ids = (r: BalanceRow[]) => r.map(x => x.studentId).join('')
    assert.deepEqual(DEFAULT_SORT, { key: 'credits', dir: 'asc' })
    assert.equal(ids(sortBalances(rows, 'credits', 'asc')), 'bcad', 'fewest lessons left first, ties by name')
    assert.equal(ids(sortBalances(rows, 'credits', 'desc')), 'adcb')
    assert.equal(ids(sortBalances(rows, 'name', 'asc')), 'abcd', 'names sort without case')
    assert.equal(ids(sortBalances(rows, 'last', 'desc')), 'dbac', 'most recent first, no lesson last')
    assert.equal(ids(sortBalances(rows, 'last', 'asc')), 'abdc', 'no lesson still last')
    assert.equal(ids(sortBalances(rows, 'next', 'asc')), 'dcab')
    assert.equal(ids(sortBalances(rows, 'payment', 'asc')), 'cabd', 'soonest payment first, no autopay last')
    assert.equal(ids(sortBalances(rows, 'payment', 'desc')), 'acbd')
    assert.deepEqual(nextSort({ key: 'credits', dir: 'asc' }, 'credits'), { key: 'credits', dir: 'desc' })
    assert.deepEqual(nextSort({ key: 'credits', dir: 'desc' }, 'next'), { key: 'next', dir: 'asc' })
    assert.equal(ids(rows), 'abcd', 'sorting never changes the list it was given')

    // ----------------------------------------------------------- loader ---
    {
        const profiles = [
            { id: 's1', name: 'Avery', credits: 4, stripe_customer_id: 'cus_1', role: 'student', status: 'active' },
            { id: 's2', name: 'Blake', credits: -1, stripe_customer_id: null, role: 'student', status: 'active' },
            { id: 's3', name: 'Casey', credits: 2, stripe_customer_id: 'cus_slow', role: 'student', status: 'active' },
            { id: 's4', name: 'Drew', credits: 0, stripe_customer_id: 'cus_err', role: 'student', status: 'active' },
            { id: 't1', name: 'Teacher', credits: 998, stripe_customer_id: 'cus_t', role: 'student', status: 'active' },
            { id: 'x1', name: 'Gone', credits: 5, stripe_customer_id: null, role: 'student', status: 'inactive' },
            { id: 'p1', name: 'Parent', credits: 0, stripe_customer_id: null, role: 'admin', status: 'active' },
        ]
        const lessons = [
            { student_id: 's1', date: '2026-11-10', time: '17:00:00', status: 'completed' },
            { student_id: 's1', date: '2026-11-17', time: '17:00:00', status: 'completed' },
            { student_id: 's1', date: '2026-11-19', time: '09:00:00', status: 'scheduled' }, // earlier today: past, not "next"
            { student_id: 's1', date: '2026-11-19', time: '18:00:00', status: 'scheduled' },
            { student_id: 's1', date: '2026-11-26', time: '18:00:00', status: 'scheduled' },
            { student_id: 's2', date: '2026-11-18', time: '20:15:00', status: 'completed' },
            { student_id: 's2', date: '2026-11-18', time: '09:00:00', status: 'completed' },
            { student_id: 's3', date: '2026-11-12', time: '10:00:00', status: 'scheduled' }, // past and unlogged
        ]
        const asked: string[] = []
        const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
        const reader: StripeReader = {
            async listSubscriptions(customer) {
                asked.push(customer)
                if (customer === 'cus_slow') { await wait(5000); return [] }
                if (customer === 'cus_err') throw new Error('Stripe is down')
                await wait(200)
                return [sub({ id: 'sub_a' })]
            },
            async nextInvoiceAmount(customer, subscription) {
                assert.equal(subscription, 'sub_a')
                return 18500 // a $15 account credit comes off
            },
        }
        const now = new Date('2026-11-19T14:30:00Z') // 9:30am Eastern
        const started = Date.now()
        const result = await loadBalances(fakeDb({ profiles, lessons }), { reader, now, timeoutMs: 600 })
        const took = Date.now() - started
        assert.ok(took < 1500, `Stripe is asked in parallel and the slow family times out (took ${took}ms)`)
        assert.deepEqual(asked.sort(), ['cus_1', 'cus_err', 'cus_slow'], 'teacher, inactive and non-student accounts are never looked up')
        assert.deepEqual(result.map(r => r.studentId), ['s2', 's4', 's3', 's1'], 'fewest lessons left first')
        const by = new Map(result.map(r => [r.studentId, r]))
        assert.deepEqual(by.get('s1')!.lastLesson, { date: '2026-11-17', time: '17:00' })
        assert.deepEqual(by.get('s1')!.nextLesson, { date: '2026-11-19', time: '18:00' }, 'next is the first one not started yet')
        assert.deepEqual(by.get('s2')!.lastLesson, { date: '2026-11-18', time: '20:15' }, 'latest time on the latest day')
        assert.equal(by.get('s2')!.nextLesson, null)
        assert.equal(by.get('s3')!.nextLesson, null, 'a past unlogged lesson is not the next lesson')
        assert.equal(by.get('s1')!.payment.kind, 'autopay')
        assert.equal((by.get('s1')!.payment as any).amountCents, 18500, 'the real next charge, after account credit')
        assert.equal((by.get('s1')!.payment as any).planAmountCents, 20000)
        assert.deepEqual(by.get('s2')!.payment, { kind: 'none' }, 'no Stripe customer: no lookup, no autopay')
        assert.equal(by.get('s3')!.payment.kind, 'unknown')
        assert.match((by.get('s3')!.payment as any).error, /longer than/)
        assert.deepEqual(by.get('s4')!.payment, { kind: 'unknown', error: 'Stripe is down' })

        // A failed invoice preview falls back to the plan price.
        const noPreview = await loadBalances(fakeDb({ profiles: profiles.slice(0, 1), lessons }), {
            reader: { listSubscriptions: async () => [sub({ id: 'sub_a' })], nextInvoiceAmount: async () => { throw new Error('nope') } },
            now,
        })
        assert.equal((noPreview[0].payment as any).amountCents, 20000)

        // withTimeout passes answers and errors through untouched.
        assert.equal(await withTimeout(Promise.resolve(7), 50, 'x'), 7)
        await assert.rejects(withTimeout(Promise.reject(new Error('own')), 50, 'x'), /own/)
    }

    // ------------------------------------------------------------ table ---
    {
        const html = renderToStaticMarkup(React.createElement(BalancesTable, { rows, today, onOpen: () => {} }))
        const order = ['blake', 'Casey', 'Avery', 'Drew'].map(n => html.indexOf(`>${n}<`))
        assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'rendered fewest lessons left first')
        assert.match(html, /owes 2 lessons/)
        assert.match(html, /No autopay/)
        assert.match(html, /Tue, Dec 1, \$200/)
        assert.match(html, /Nothing booked/)
        assert.match(html, /None yet/)
        assert.match(html, /aria-sort="ascending"/)
        assert.equal((html.match(/<button/g) ?? []).length, 5, 'read only: the only buttons sort the five columns')
        assert.ok(!html.includes(String.fromCharCode(0x2014)), 'no em dashes')
        assert.match(renderToStaticMarkup(React.createElement(BalancesTable, { rows: [] })), /No active families/)
    }

    console.log('balances: all checks passed')
}

/** Just enough of supabase-js: select with eq/in/gte/order/range. */
function fakeDb(tables: Record<string, Record<string, any>[]>): DbClient {
    const from = (table: string) => {
        let rows = [...(tables[table] ?? [])]
        const orders: [string, boolean][] = []
        const q: any = {
            select: () => q,
            eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return q },
            in: (c: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[c])); return q },
            gte: (c: string, v: string) => { rows = rows.filter(r => r[c] >= v); return q },
            order: (c: string, o: { ascending: boolean }) => { orders.push([c, o.ascending]); return q },
            range: (a: number, b: number) => {
                rows.sort((x, y) => {
                    for (const [c, asc] of orders) if (x[c] !== y[c]) return (x[c] < y[c] ? -1 : 1) * (asc ? 1 : -1)
                    return 0
                })
                rows = rows.slice(a, b + 1)
                return q
            },
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
