/**
 * Self-check for the plan payment watch (#984, lib/plan-payment-alerts.ts),
 * with fake Stripe events and a fake database: nothing touches Stripe,
 * Supabase or Resend.
 *
 *   npx tsx scripts/check_plan_payment_alerts.ts
 */
import assert from 'node:assert/strict'
import {
    decidePlanAlert, planAlertEmail, planEventFromStripe, processPlanEvent, replayPlanEvents,
    type PlanEvent,
} from '../lib/plan-payment-alerts'
import type { DbClient } from '../lib/supabase/admin'

const DAY = 86400
const T0 = Date.parse('2026-10-27T03:00:00Z') / 1000
const SUB = 'sub_test1'

function invoiceEvent(id: string, type: string, days: number, extra: Record<string, unknown> = {}) {
    return {
        id, type, created: T0 + Math.round(days * DAY),
        data: {
            object: {
                object: 'invoice', id: 'in_test1', customer: 'cus_test1', customer_name: 'Stripe Name',
                billing_reason: 'subscription_cycle', currency: 'usd', amount_due: 16000, amount_remaining: 16000, amount_paid: 0,
                attempt_count: 1, next_payment_attempt: T0 + (days + 3) * DAY,
                parent: { subscription_details: { subscription: SUB, metadata: { credits: '4', userId: '00000000-0000-0000-0000-000000000001' } } },
                lines: { data: [{ description: '1 × Regular Piano Lesson Subscription (30 min) (at $160.00 / month)' }] },
                ...extra,
            },
        },
    } as any
}
const failed = (id: string, days: number, extra = {}) => planEventFromStripe(invoiceEvent(id, 'invoice.payment_failed', days, extra))!
const paid = (id: string, days: number) => planEventFromStripe(invoiceEvent(id, 'invoice.paid', days, { amount_paid: 16000, amount_remaining: 0 }))!
const ended = (id: string, days: number, reason: string, sub = SUB) => planEventFromStripe({
    id, type: 'customer.subscription.deleted', created: T0 + days * DAY,
    data: { object: { object: 'subscription', id: sub, customer: 'cus_test1', metadata: { credits: '4', userId: '00000000-0000-0000-0000-000000000001' }, cancellation_details: { reason }, latest_invoice: 'in_test1' } },
} as any)!

async function main() {
    // 1. Reading Stripe events.
    const f1 = failed('evt_f1', 0)
    assert.equal(f1.kind, 'failed')
    assert.equal(f1.subscriptionId, SUB)
    assert.equal(f1.amountCents, 16000)
    assert.equal(f1.credits, 4)
    assert.equal(f1.nextAttemptAt, (T0 + 3 * DAY) * 1000)
    assert.equal(planEventFromStripe(invoiceEvent('evt_x', 'invoice.payment_succeeded', 1))!.kind, 'paid')
    assert.equal(planEventFromStripe(invoiceEvent('evt_x', 'invoice.payment_failed', 1, { billing_reason: 'subscription_create' })), null, 'checkout invoice not counted')
    assert.equal(planEventFromStripe(invoiceEvent('evt_x', 'invoice.payment_failed', 1, { parent: null, lines: { data: [] } })), null, 'not a plan invoice')
    assert.equal(planEventFromStripe(invoiceEvent('evt_x', 'invoice.updated', 1)), null)
    // Older API shape: invoice.subscription.
    assert.equal(planEventFromStripe(invoiceEvent('evt_x', 'invoice.payment_failed', 1, { parent: null, subscription: 'sub_old' }))!.subscriptionId, 'sub_old')
    assert.equal(ended('evt_e', 1, 'payment_failed').endReason, 'payment_failed')

    // 2. The November 2026 case: 9 declines over two weeks, then Stripe ends the
    //    plan. Exactly two emails: at the 2nd failure, and when it ends.
    const nine = Array.from({ length: 9 }, (_, i) => failed(`evt_f${i + 1}`, i * 1.6, { attempt_count: i + 1 }))
    const incident = replayPlanEvents([...nine, ended('evt_end', 14, 'payment_failed')])
    assert.deepEqual(incident.map(a => [a.kind, a.event.id, a.key]), [
        ['failed_twice', 'evt_f2', 'failed:evt_f1'],
        ['ended_unpaid', 'evt_end', 'ended'],
    ])
    assert.equal(incident[1].failures.length, 9)
    // Stripe stamps the last retry and the end in the same second: the end still counts all 9.
    const sameSecond = replayPlanEvents([{ ...ended('evt_a_end', 0, 'payment_failed'), at: nine[8].at }, ...nine])
    assert.equal(sameSecond[1].failures.length, 9)

    // 3. One failure then paid (what Stripe's retries usually fix): nothing.
    assert.deepEqual(replayPlanEvents([failed('a1', 0), paid('a2', 2), failed('a3', 30), paid('a4', 31)]), [])

    // 4. A paid invoice ends the run; a new run can alert again, once.
    const twoRuns = replayPlanEvents([failed('b1', 0), failed('b2', 1), failed('b3', 2), paid('b4', 3), failed('b5', 30), failed('b6', 33)])
    assert.deepEqual(twoRuns.map(a => a.key), ['failed:b1', 'failed:b5'])

    // 5. The same event twice (webhook and hourly check): counted once.
    assert.deepEqual(replayPlanEvents([failed('c1', 0), failed('c1', 0)]), [])

    // 6. Out of order: a failure older than a payment already seen is stale.
    assert.equal(decidePlanAlert([failed('d1', 0), paid('d3', 5)], failed('d2', 1)), null)

    // 7. Plans ended on purpose with nothing owing say nothing; ended with
    //    failures since the last payment, whatever the reason, says so.
    assert.deepEqual(replayPlanEvents([paid('e1', 0), ended('e2', 3, 'cancellation_requested')]), [])
    assert.equal(replayPlanEvents([paid('g1', 0), failed('g2', 1), ended('g3', 2, 'cancellation_requested')])[0].kind, 'ended_unpaid')
    // Another plan's events never count.
    assert.deepEqual(replayPlanEvents([failed('h1', 0), { ...failed('h2', 1), subscriptionId: 'sub_other' }]), [])

    // 8. The email.
    const mail = planAlertEmail(incident[0], { familyName: 'Sam <Test>', decline: 'Your card has insufficient funds. (insufficient_funds)', nextAttemptAt: Date.parse('2026-11-03T23:04:00Z') })
    assert.equal(mail.subject, 'Plan payment failed twice in a row: Sam &lt;Test&gt;')
    assert.ok(mail.lines.includes('Plan: 4 lessons per payment, 1 x Regular Piano Lesson Subscription (30 min) (at $160.00 / month)'))
    assert.ok(mail.lines.includes('Amount: $160.00'))
    assert.ok(mail.lines.includes('Declined: Your card has insufficient funds. (insufficient_funds)'))
    assert.ok(mail.lines.includes('Next retry: Tue, Nov 3, 6:04pm EST'), mail.lines.join('\n'))
    assert.ok(mail.lines.some(l => l.startsWith('Failed payments in a row: 2 (first ')))
    assert.ok(mail.lines.some(l => l.includes('dashboard.stripe.com/invoices/in_test1')))
    const noRetry = planAlertEmail(incident[0], { familyName: null, decline: null, nextAttemptAt: null })
    assert.ok(noRetry.subject.endsWith('Stripe Name'), 'falls back to the Stripe customer name')
    assert.ok(noRetry.lines.includes('Next retry: none scheduled, Stripe will not try again'))
    assert.ok(noRetry.lines.includes('Declined: Stripe gave no reason'))
    const endMail = planAlertEmail(incident[1], { familyName: 'Sam', decline: 'Your card was declined. (generic_decline)' })
    assert.equal(endMail.subject, 'Stripe ended a plan unpaid: Sam')
    assert.ok(endMail.lines.some(l => l.startsWith('Ended: ') && l.includes('Stripe gave up')))
    assert.ok(endMail.lines.includes('Failed payments since the last one that went through: 9 (first Mon, Oct 26, 11:00pm EDT)') ||
        endMail.lines.some(l => l.startsWith('Failed payments since the last one that went through: 9')))
    for (const m of [mail, noRetry, endMail]) {
        assert.ok(!/[\u2013\u2014]/.test([m.subject, ...m.lines, m.footer].join('\n')), 'no long dashes')
    }

    // 9. The store: each event recorded once, each email claimed once, and a
    //    failed send released so the next check tries again.
    const db = fakeDb()
    const sent: string[] = []
    let sendOk = true
    const deps = {
        lookup: async () => ({ familyName: 'Sam', decline: 'declined' }),
        send: async (_c: DbClient, e: { subject: string }) => { if (sendOk) sent.push(e.subject); return sendOk },
    }
    const ev = (e: PlanEvent) => processPlanEvent(db.client, e, deps)
    assert.equal((await ev(nine[0])).alert, undefined)
    sendOk = false
    const r2 = await ev(nine[1])
    assert.equal(r2.alert?.sent, false)
    assert.equal(db.rows('plan_payment_alerts').length, 0, 'claim released')
    assert.equal(db.rows('plan_payment_events').length, 1, 'event released for a retry')
    sendOk = true
    const r2b = await ev(nine[1]) // the next hourly check sees it again
    assert.equal(r2b.alert?.sent, true)
    assert.equal((await ev(nine[1])).recorded, false, 'webhook copy of the same event: nothing')
    const r3 = await ev(nine[2])
    assert.equal(r3.alert?.already, true, 'third failure: same run, no second email')
    const rEnd = await ev(ended('evt_end', 14, 'payment_failed'))
    assert.equal(rEnd.alert?.sent, true)
    assert.equal((await ev(ended('evt_end_dup', 14.1, 'payment_failed'))).alert?.already, true)
    assert.deepEqual(sent, ['Plan payment failed twice in a row: Sam', 'Stripe ended a plan unpaid: Sam'])
    assert.ok(db.rows('plan_payment_alerts').every(r => r.sent_at), 'sent rows stamped')

    console.log('check_plan_payment_alerts: all good')
}

/** Just enough of supabase-js for processPlanEvent: insert (unique keys), select/update/delete with eq. */
function fakeDb() {
    const tables: Record<string, Record<string, any>[]> = { plan_payment_events: [], plan_payment_alerts: [] }
    const unique: Record<string, string[][]> = {
        plan_payment_events: [['stripe_event_id']],
        plan_payment_alerts: [['subscription_id', 'alert_key']],
    }
    const client = {
        from(table: string) {
            const rows = tables[table]
            assert.ok(rows, `unexpected table ${table}`)
            const filtered = (filters: [string, unknown][]) => rows.filter(r => filters.every(([k, v]) => r[k] === v))
            const chain = (run: (filters: [string, unknown][]) => any) => {
                const filters: [string, unknown][] = []
                const q: any = {
                    eq(k: string, v: unknown) { filters.push([k, v]); return q },
                    then(resolve: (v: any) => void) { resolve(run(filters)) },
                }
                return q
            }
            return {
                insert: async (row: Record<string, any>) => {
                    for (const keys of unique[table]) {
                        if (rows.some(r => keys.every(k => r[k] === row[k]))) return { error: { code: '23505', message: 'duplicate' } }
                    }
                    rows.push({ ...row })
                    return { error: null }
                },
                select: () => chain(f => ({ data: filtered(f), error: null })),
                update: (patch: Record<string, any>) => chain(f => { filtered(f).forEach(r => Object.assign(r, patch)); return { error: null } }),
                delete: () => chain(f => { for (const r of filtered(f)) rows.splice(rows.indexOf(r), 1); return { error: null } }),
            }
        },
    }
    return { client: client as unknown as DbClient, rows: (t: string) => tables[t] }
}

main().catch(e => { console.error(e); process.exit(1) })
