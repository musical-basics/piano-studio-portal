import type Stripe from 'stripe'
import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { STUDIO_TZ, studioTzAbbr } from '@/lib/studio-timezone'

/**
 * Plan payment alerts (Lionel's #984, #1000): email the studio inbox the same
 * day a family's plan payment is first declined, and again if Stripe gives up
 * and ends the plan. In Nov 2026 a family's plan was ended by Stripe after 9
 * declined payments over two weeks and nobody noticed. (#984 alerted at the
 * 2nd failure in a row; #1000 moved it to the first decline.)
 *
 * Rules, per Stripe subscription:
 *   - A failure run is the failed payments since the last paid invoice. On its
 *     first failure the studio gets one email (family, plan, amount, Stripe's
 *     decline reason, the next retry). Later failures in the same run say
 *     nothing more; a paid invoice ends the run, and a new run can alert again.
 *   - When the plan is deleted and it ended unpaid (Stripe's reason is
 *     payment_failed, or there were failures since the last payment), one more
 *     email. A plan cancelled on purpose with nothing owing says nothing.
 *   - The first invoice of a plan (billing_reason subscription_create, paid at
 *     checkout) is not counted: a card declined at checkout is not a plan
 *     payment going wrong.
 *
 * Where events come from: the Stripe webhook endpoint, as configured in Nov
 * 2026, only receives checkout.session.completed, invoice.payment_succeeded and
 * payment_intent.amount_capturable_updated, so payment failures never reach it.
 * The plan-payment-check cron reads the same events from Stripe's Events API
 * every hour instead (read-only, no Stripe change needed). The webhook also
 * hands them over, so if the endpoint is ever subscribed to invoice.payment_failed
 * and customer.subscription.deleted the email comes within seconds. Every event
 * is recorded once by its Stripe id (plan_payment_events) and every email is
 * claimed once (plan_payment_alerts), so the two paths never double up.
 */

export type PlanEventKind = 'failed' | 'paid' | 'ended'

/** One Stripe event, reduced to what the rules need. Stored as-is in plan_payment_events.event. */
export type PlanEvent = {
    /** The Stripe event id (or a made-up one in tests and reconstructions). */
    id: string
    kind: PlanEventKind
    /** When it happened, ms. */
    at: number
    subscriptionId: string
    customerId: string | null
    invoiceId: string | null
    /** profiles.id from the plan's metadata (userId), when there. */
    userId: string | null
    /** Cents still owing on a failed invoice (amount due on a paid one). */
    amountCents: number | null
    currency: string | null
    /** Stripe's attempt count on the invoice. */
    attemptCount: number | null
    /** Stripe's next automatic retry, ms; null when it will not retry. */
    nextAttemptAt: number | null
    /** "1 x Regular Piano Lesson Subscription (30 min) (at $160.00 / month)" */
    planLabel: string | null
    /** Lessons per payment (plan metadata credits). */
    credits: number | null
    /** Stripe's customer name on the invoice, a fallback for the family name. */
    customerName: string | null
    /** A deleted plan: cancellation_details.reason ('payment_failed', 'cancellation_requested', ...). */
    endReason: string | null
    /** A deleted plan's last invoice. */
    latestInvoiceId: string | null
}

/** The Stripe event types this watches. invoice.payment_succeeded is what the webhook gets today. */
export const PLAN_EVENT_TYPES = ['invoice.payment_failed', 'invoice.paid', 'invoice.payment_succeeded', 'customer.subscription.deleted'] as const

function idOf(v: unknown): string | null {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && typeof (v as any).id === 'string') return (v as any).id
    return null
}

/** The subscription an invoice belongs to, across Stripe API versions. */
function invoiceSubscriptionId(inv: any): string | null {
    return idOf(inv?.parent?.subscription_details?.subscription)
        ?? idOf(inv?.subscription)
        ?? idOf(inv?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription)
        ?? idOf(inv?.lines?.data?.[0]?.subscription)
}

/** A Stripe event as a PlanEvent, or null when it is not about a plan payment. Pure. */
export function planEventFromStripe(event: Pick<Stripe.Event, 'id' | 'type' | 'created' | 'data'>): PlanEvent | null {
    const o: any = event.data?.object
    if (!o) return null
    const at = event.created * 1000

    if (event.type === 'customer.subscription.deleted') {
        if (o.object !== 'subscription' || typeof o.id !== 'string') return null
        const credits = Number(o.metadata?.credits)
        return {
            id: event.id, kind: 'ended', at,
            subscriptionId: o.id,
            customerId: idOf(o.customer),
            invoiceId: null,
            userId: typeof o.metadata?.userId === 'string' ? o.metadata.userId : null,
            amountCents: null,
            currency: o.currency ?? o.items?.data?.[0]?.price?.currency ?? null,
            attemptCount: null,
            nextAttemptAt: null,
            planLabel: o.items?.data?.[0]?.price?.nickname ?? null,
            credits: Number.isFinite(credits) && credits > 0 ? credits : null,
            customerName: null,
            endReason: o.cancellation_details?.reason ?? null,
            latestInvoiceId: idOf(o.latest_invoice),
        }
    }

    const kind: PlanEventKind | null = event.type === 'invoice.payment_failed' ? 'failed'
        : event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded' ? 'paid'
            : null
    if (!kind || o.object !== 'invoice') return null
    if (o.billing_reason === 'subscription_create') return null
    const subscriptionId = invoiceSubscriptionId(o)
    if (!subscriptionId) return null
    const meta = o.parent?.subscription_details?.metadata ?? o.lines?.data?.[0]?.metadata ?? {}
    const credits = Number(meta?.credits)
    return {
        id: event.id, kind, at,
        subscriptionId,
        customerId: idOf(o.customer),
        invoiceId: typeof o.id === 'string' ? o.id : null,
        userId: typeof meta?.userId === 'string' ? meta.userId : null,
        amountCents: kind === 'failed' ? (o.amount_remaining ?? o.amount_due ?? null) : (o.amount_paid ?? o.amount_due ?? null),
        currency: o.currency ?? null,
        attemptCount: typeof o.attempt_count === 'number' ? o.attempt_count : null,
        nextAttemptAt: typeof o.next_payment_attempt === 'number' ? o.next_payment_attempt * 1000 : null,
        planLabel: o.lines?.data?.[0]?.description ?? null,
        credits: Number.isFinite(credits) && credits > 0 ? credits : null,
        customerName: o.customer_name ?? null,
        endReason: null,
        latestInvoiceId: null,
    }
}

const KIND_ORDER: Record<PlanEventKind, number> = { failed: 0, paid: 1, ended: 2 }

/**
 * Oldest first. Stripe stamps the last failed retry and the plan's end in the
 * same second, so within one second a failure comes before the end.
 */
export function byTime(a: PlanEvent, b: PlanEvent): number {
    return a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id)
}

export type PlanAlert = {
    kind: 'declined' | 'ended_unpaid'
    subscriptionId: string
    /** Once per key per plan: 'failed:<first failure of the run>' or 'ended'. */
    key: string
    /** The run's failures so far, oldest first. */
    failures: PlanEvent[]
    /** The event that raised it. */
    event: PlanEvent
}

/**
 * What one new event means, given the plan's earlier events (any order). Pure.
 * A failure older than the last payment is stale (events can arrive out of
 * order) and raises nothing.
 */
export function decidePlanAlert(history: PlanEvent[], event: PlanEvent): PlanAlert | null {
    if (event.kind === 'paid') return null
    const earlier = history.filter(e => e.subscriptionId === event.subscriptionId && e.id !== event.id)
    const lastPaidAt = Math.max(-Infinity, ...earlier.filter(e => e.kind === 'paid' && e.at <= event.at).map(e => e.at))

    if (event.kind === 'failed') {
        if (earlier.some(e => e.kind === 'paid' && e.at > event.at)) return null
        const run = [...earlier.filter(e => e.kind === 'failed' && e.at > lastPaidAt && e.at <= event.at), event]
            .sort(byTime)
        return { kind: 'declined', subscriptionId: event.subscriptionId, key: `failed:${run[0].id}`, failures: run, event }
    }

    // Ended.
    const run = earlier.filter(e => e.kind === 'failed' && e.at > lastPaidAt).sort(byTime)
    if (event.endReason !== 'payment_failed' && run.length === 0) return null
    return { kind: 'ended_unpaid', subscriptionId: event.subscriptionId, key: 'ended', failures: run, event }
}

/** Every alert a sequence of events would raise, each once (the dry run and the tests). Pure. */
export function replayPlanEvents(events: PlanEvent[]): PlanAlert[] {
    const sorted = [...events].sort(byTime)
    const seen = new Set<string>()
    const raised = new Set<string>()
    const bySub = new Map<string, PlanEvent[]>()
    const alerts: PlanAlert[] = []
    for (const e of sorted) {
        if (seen.has(e.id)) continue
        seen.add(e.id)
        const history = bySub.get(e.subscriptionId) ?? []
        const alert = decidePlanAlert(history, e)
        history.push(e)
        bySub.set(e.subscriptionId, history)
        if (alert && !raised.has(`${alert.subscriptionId} ${alert.key}`)) {
            raised.add(`${alert.subscriptionId} ${alert.key}`)
            alerts.push(alert)
        }
    }
    return alerts
}

// ------------------------------------------------------------ the email ---

/** What the email says beyond the events: looked up when an alert is raised. */
export type PlanAlertInfo = {
    familyName: string | null
    /** "Your card has insufficient funds. ... (insufficient_funds)" */
    decline: string | null
    /** Overrides the event's next retry (tests). */
    nextAttemptAt?: number | null
    amountCents?: number | null
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** "$160.00" (USD) or "160.00 EUR". */
export function formatMoney(cents: number | null | undefined, currency: string | null | undefined): string | null {
    if (typeof cents !== 'number') return null
    const cur = (currency || 'usd').toUpperCase()
    const n = (cents / 100).toFixed(2)
    return cur === 'USD' ? `$${n}` : `${n} ${cur}`
}

/** "Mon Nov 3, 6:04pm EST" in studio time. */
export function formatWhen(ms: number): string {
    const d = new Date(ms)
    const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: STUDIO_TZ })
    const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: STUDIO_TZ }).replace(' ', '').toLowerCase()
    return `${day}, ${clock} ${studioTzAbbr(d)}`
}

function planLine(e: PlanEvent, failures: PlanEvent[]): string {
    const label = [e, ...failures].map(x => x.planLabel).find(Boolean)
    const credits = [e, ...failures].map(x => x.credits).find(c => typeof c === 'number')
    const parts = [credits ? `${credits} lessons per payment` : null, label ? label.replace(/×/g, 'x') : null].filter(Boolean)
    return parts.length ? parts.join(', ') : 'unknown plan'
}

/** Subject and lines (HTML-safe) for the studio email. Pure. */
export function planAlertEmail(alert: PlanAlert, info: PlanAlertInfo): { subject: string; lines: string[]; footer: string } {
    const family = info.familyName || [alert.event, ...alert.failures].map(e => e.customerName).find(Boolean) || 'a family (name not found)'
    const last = alert.failures[alert.failures.length - 1] ?? alert.event
    const amount = formatMoney(info.amountCents ?? last.amountCents, last.currency ?? alert.event.currency)
    const invoiceId = last.invoiceId ?? alert.event.latestInvoiceId
    const first = alert.failures[0]
    const lines: string[] = [`Family: ${family}`, `Plan: ${planLine(alert.event, alert.failures)}`]

    if (alert.kind === 'declined') {
        const next = info.nextAttemptAt !== undefined ? info.nextAttemptAt : last.nextAttemptAt
        lines.push(
            `Amount: ${amount ?? 'unknown'}`,
            `Declined: ${info.decline || 'Stripe gave no reason'}`,
            alert.failures.length > 1
                ? `Failed payments in a row: ${alert.failures.length} (first ${formatWhen(first.at)}, latest ${formatWhen(last.at)})`
                : `When: ${formatWhen(last.at)}`,
            `Next retry: ${next ? formatWhen(next) : 'none scheduled, Stripe will not try again'}`,
        )
    } else {
        lines.push(
            `Ended: ${formatWhen(alert.event.at)} (${alert.event.endReason === 'payment_failed' ? 'Stripe gave up after the payments failed' : `reason: ${alert.event.endReason || 'not given'}`})`,
            ...(amount ? [`Unpaid: ${amount}`] : []),
            `Failed payments since the last one that went through: ${alert.failures.length}${first ? ` (first ${formatWhen(first.at)})` : ''}`,
            ...(info.decline ? [`Last decline: ${info.decline}`] : []),
        )
    }
    const links = [
        invoiceId ? `<a href="https://dashboard.stripe.com/invoices/${encodeURIComponent(invoiceId)}">invoice</a>` : null,
        `<a href="https://dashboard.stripe.com/subscriptions/${encodeURIComponent(alert.subscriptionId)}">plan</a>`,
    ].filter(Boolean).join(', ')
    const safe = lines.map(escapeHtml)
    safe.push(`In Stripe: ${links}`)

    const subject = alert.kind === 'declined'
        ? (alert.failures.length > 1 ? `Plan payment declined ${alert.failures.length} times in a row: ${family}` : `Plan payment declined: ${family}`)
        : `Stripe ended a plan unpaid: ${family}`
    const footer = alert.kind === 'declined'
        ? 'Stripe keeps retrying on its own and ends the plan after the last retry. You get one email at the first decline of each run (and one more if Stripe ends the plan). Nothing was changed in Stripe or the portal.'
        : 'The family has no plan now, so no more lessons are added automatically. Nothing was changed in Stripe or the portal.'
    return { subject: escapeHtml(subject), lines: safe, footer }
}

// ------------------------------------------------------------ the store ---

export type PlanAlertDeps = {
    /** Family name, decline reason and fresh retry date for an alert. */
    lookup?: (client: DbClient, alert: PlanAlert) => Promise<PlanAlertInfo>
    /** Sends the studio email; true when it went. */
    send?: (client: DbClient, email: { subject: string; lines: string[]; footer: string }) => Promise<boolean>
}

export type ProcessResult = {
    eventId: string
    /** False when this event was already recorded (seen before by the webhook or an earlier run). */
    recorded: boolean
    alert?: { kind: PlanAlert['kind']; subscriptionId: string; key: string; sent: boolean; already?: boolean }
}

/**
 * Records one event and sends any alert it raises, at most once. Never throws
 * for a duplicate. When the email fails, the event and the claim are released
 * so the next hourly check tries again.
 */
export async function processPlanEvent(client: DbClient, event: PlanEvent, deps: PlanAlertDeps = {}): Promise<ProcessResult> {
    const result: ProcessResult = { eventId: event.id, recorded: false }
    const { error: insertError } = await client.from('plan_payment_events').insert({
        stripe_event_id: event.id,
        subscription_id: event.subscriptionId,
        kind: event.kind,
        at: new Date(event.at).toISOString(),
        invoice_id: event.invoiceId,
        event,
    })
    if (insertError) {
        if (insertError.code === '23505') return result
        throw new Error(`plan_payment_events insert failed: ${insertError.message}`)
    }
    result.recorded = true

    const { data: rows, error: historyError } = await client
        .from('plan_payment_events')
        .select('event')
        .eq('subscription_id', event.subscriptionId)
    if (historyError) throw new Error(`plan_payment_events read failed: ${historyError.message}`)
    const history = ((rows || []) as { event: PlanEvent }[]).map(r => r.event).filter(e => e && e.id !== event.id)

    const alert = decidePlanAlert(history, event)
    if (!alert) return result
    result.alert = { kind: alert.kind, subscriptionId: alert.subscriptionId, key: alert.key, sent: false }

    // Claim before sending: whoever inserts the row sends the one email.
    const userId = [alert.event, ...alert.failures].map(e => e.userId).find(Boolean) ?? null
    const { error: claimError } = await client.from('plan_payment_alerts').insert({
        subscription_id: alert.subscriptionId,
        alert_key: alert.key,
        kind: alert.kind,
        student_id: userId,
        event_id: event.id,
    })
    if (claimError) {
        if (claimError.code === '23505') {
            result.alert.already = true
            return result
        }
        throw new Error(`plan_payment_alerts claim failed: ${claimError.message}`)
    }

    let sent = false
    try {
        const info = await (deps.lookup ?? lookupPlanAlertInfo)(client, alert)
        const email = planAlertEmail(alert, info)
        sent = await (deps.send ?? ((c, e) => sendCronAlert(c, e)))(client, email)
    } catch (e) {
        console.error('[PlanPaymentAlerts] could not send:', e)
    }
    if (sent) {
        await client.from('plan_payment_alerts').update({ sent_at: new Date().toISOString() })
            .eq('subscription_id', alert.subscriptionId).eq('alert_key', alert.key)
    } else {
        // Let the next check raise it again.
        await client.from('plan_payment_alerts').delete().eq('subscription_id', alert.subscriptionId).eq('alert_key', alert.key)
        await client.from('plan_payment_events').delete().eq('stripe_event_id', event.id)
    }
    result.alert.sent = sent
    return result
}

/**
 * Family name from the portal and Stripe's decline reason. The next retry comes
 * from the failure event itself (what Stripe planned at that moment).
 */
export async function lookupPlanAlertInfo(client: DbClient, alert: PlanAlert): Promise<PlanAlertInfo> {
    const events = [alert.event, ...alert.failures]
    const userId = events.map(e => e.userId).find(Boolean)
    const customerId = events.map(e => e.customerId).find(Boolean)
    let familyName: string | null = null
    try {
        let q = client.from('profiles').select('name, parent_contact_name')
        q = userId ? q.eq('id', userId) : q.eq('stripe_customer_id', customerId ?? '-')
        const { data } = await q.limit(1)
        const p = (data || [])[0] as { name?: string | null; parent_contact_name?: string | null } | undefined
        if (p?.name) familyName = p.parent_contact_name ? `${p.name} (parent: ${p.parent_contact_name})` : p.name
    } catch (e) {
        console.error('[PlanPaymentAlerts] profile lookup failed:', e)
    }

    const info: PlanAlertInfo = { familyName, decline: null }
    const last = alert.failures[alert.failures.length - 1]
    const invoiceId = last?.invoiceId ?? alert.event.latestInvoiceId
    if (!invoiceId) return info
    try {
        const { stripe } = await import('@/lib/stripe')
        const inv: any = await stripe.invoices.retrieve(invoiceId, { expand: ['payments.data.payment.payment_intent'] } as any)
        const err = (inv.payments?.data || [])
            .map((p: any) => p.payment?.payment_intent?.last_payment_error)
            .find(Boolean)
        if (err) info.decline = `${err.message || 'declined'}${err.decline_code || err.code ? ` (${err.decline_code || err.code})` : ''}`
        if (inv.status === 'paid') info.amountCents = inv.amount_due
        else if (typeof inv.amount_remaining === 'number') info.amountCents = inv.amount_remaining
    } catch (e) {
        console.error('[PlanPaymentAlerts] Stripe invoice lookup failed:', e)
    }
    return info
}

/** The last `days` days of plan events from Stripe's Events API (it keeps 30 days), oldest first. Read-only. */
export async function fetchPlanEvents(days: number): Promise<PlanEvent[]> {
    const { stripe } = await import('@/lib/stripe')
    const since = Math.floor(Date.now() / 1000) - Math.round(days * 86400)
    const out: PlanEvent[] = []
    for await (const ev of stripe.events.list({ types: [...PLAN_EVENT_TYPES], created: { gte: since }, limit: 100 })) {
        const pe = planEventFromStripe(ev)
        if (pe) out.push(pe)
    }
    return out.sort(byTime)
}
