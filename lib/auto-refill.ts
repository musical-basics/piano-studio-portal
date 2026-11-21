/**
 * Auto-refill plan (Lionel's #1477): instead of paying every month, the
 * family's saved card is charged for 4 lessons each time their lessons run
 * out. Offered next to the monthly plan on a half split (protocol 1.20,
 * rollout 'auto_refill'); if families like it, it replaces the monthly plan.
 *
 * His decisions:
 *   #1276  each refill is the family's monthly plan: its lessons (4) at its
 *          price ($165 for 30 minutes, $225 for 45), read from their pricing
 *          plan's monthly point when they turn it on, never typed in here.
 *   #1277  a declined card: email the family a link to fix the card and pay,
 *          tell the studio inbox, retry in 3 days; lessons keep going (the
 *          balance may go below 0, as it already can).
 *   #1278  every family on a regular plan sees it when they buy; a quarterly
 *          family only once its quarter has ended.
 *   #1279  the wording (autoRefillWording below).
 *
 * How a refill happens (the cron /api/cron/auto-refill, every 15 minutes):
 *   1. find: a family with auto-refill on, lessons at 0 or below, no open
 *      refill, and a lesson taken (a credit_transactions decrease to 0 or
 *      below) since the plan was last armed. That makes one 'due' refill; the
 *      partial unique index allows only one open refill per family.
 *   2. charge, once the lesson is 12 minutes old (past the 10-minute Undo):
 *      claim the row (due/failed to charging, guarded by updated_at so two runs
 *      can't both claim it), check the lessons are still at 0 or below, then
 *      one off-session PaymentIntent for this refill (idempotency key per
 *      refill, then per attempt; a retry confirms the same PaymentIntent, and
 *      a PaymentIntent can only succeed once).
 *   3. paid: credit_auto_refill adds the lessons once (labelled 'auto-refill')
 *      and re-arms the plan. Declined: retry 3 days later, at most 3 tries;
 *      the family can update the card any time in Settings, which charges the
 *      open refill right away.
 * Every lesson-taking path is covered because the check reads the credit
 * ledger, not the code that took the credit.
 *
 * Safety: no refill is charged while the rollout stage is 'off' (the Tests
 * card's switch pauses charging); a family is never charged twice within 20
 * hours; at most 5 charges per run.
 */

import { STUDIO_TZ } from '@/lib/studio-timezone'

// No server-only imports here: the purchase window and Settings use the
// wording and the offer types.

export const AUTO_REFILL_SOURCE = 'auto-refill'
export const RETRY_AFTER_DAYS = 3
/** The first try plus two retries, 3 days apart. */
export const MAX_ATTEMPTS = 3
/** A lesson log can be undone for 10 minutes (lib/undo-window.ts); wait past it. */
export const DUE_GRACE_MINUTES = 12
/** A charge still marked in flight after this is looked up in Stripe. */
export const STALE_CHARGING_MINUTES = 10
/** Never two paid refills for one family closer than this. */
export const MIN_HOURS_BETWEEN_REFILLS = 20
export const MAX_CHARGES_PER_RUN = 5

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// --------------------------------------------------------------- rows ---

export type PlanStatus = 'on' | 'off'

export type PlanRow = {
    student_id: string
    status: PlanStatus
    stripe_customer_id: string | null
    payment_method_id: string | null
    card_brand: string | null
    card_last4: string | null
    credits: number
    price_cents: number
    pricing_point_id: string | null
    started_at: string
    armed_at: string
    start_session_id: string | null
    card_session_id: string | null
    ended_subscription_id: string | null
    last_refill_at: string | null
    stopped_at: string | null
    stopped_by: 'family' | 'admin' | null
    updated_at: string
}

export type RefillStatus = 'due' | 'charging' | 'failed' | 'paid' | 'skipped' | 'cancelled'
export const OPEN_STATUSES: RefillStatus[] = ['due', 'charging', 'failed']

export type RefillRow = {
    id: string
    student_id: string
    kind: 'start' | 'refill'
    status: RefillStatus
    credits: number
    price_cents: number
    amount_cents: number
    account_credit_cents: number
    triggered_at: string | null
    stripe_payment_intent_id: string | null
    checkout_session_id: string | null
    attempts: number
    next_retry_at: string | null
    last_error: string | null
    charging_at: string | null
    paid_at: string | null
    credited_at: string | null
    credits_before: number | null
    credits_after: number | null
    note: string | null
    created_at: string
    updated_at: string
}

export type Family = {
    id: string
    name: string | null
    parentName: string | null
    /** Where family emails go (notification email or login email). */
    email: string | null
    credits: number
    status: string | null
    role: string | null
    stripeCustomerId: string | null
}

// ------------------------------------------------------------ wording ---

/** "$165", "$211.67". */
export function priceWords(cents: number): string {
    return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}

/**
 * Lionel's approved wording (#1279), with the family's own lessons and price:
 * "Auto-refill: 4 lessons for $165. Your card is charged only when your
 * lessons run out, never on a schedule. Turn it off anytime in Settings."
 */
export function autoRefillWording(credits: number, priceCents: number): { title: string; body: string; full: string } {
    const title = `Auto-refill: ${credits} lessons for ${priceWords(priceCents)}`
    const body = 'Your card is charged only when your lessons run out, never on a schedule. Turn it off anytime in Settings.'
    return { title, body, full: `${title}. ${body}` }
}

// -------------------------------------------------------------- offer ---

export type RunningPlan = {
    id: string
    status: string
    /** A capped plan (the quarterly plan: billing_cycles on its Stripe price). */
    fixedLength: boolean
    /** Already set to end (cancel_at_period_end or cancel_at). */
    ending: boolean
    /** When the current period ends (its last day of lessons paid for), ISO. */
    periodEnd: string | null
}

export type OfferInput = {
    inRollout: boolean
    role: string | null
    status: string | null
    credits: number
    /** The family's pricing plan's monthly point. */
    monthly: { id: string; credits: number; price: number } | null
    /** That point's Stripe price is capped (the quarterly plan). */
    monthlyFixedLength: boolean
    /** The family's running Stripe plan, if any. */
    running: RunningPlan | null
    existing: Pick<PlanRow, 'status' | 'credits' | 'price_cents'> | null
}

/**
 * buy:    lessons at 0 or below and no plan running: Checkout takes the first
 *         4 lessons now and saves the card.
 * save:   lessons left, no plan running: Checkout saves the card, nothing is
 *         charged until the lessons run out.
 * switch: on a monthly plan: Checkout saves the card and the monthly plan
 *         stops at the end of the month already paid; refills start when the
 *         lessons run out. Never both at once.
 */
export type OfferMode = 'buy' | 'save' | 'switch'

export type AutoRefillOffer =
    | { show: false; reason: string; on?: boolean }
    | {
        show: true
        mode: OfferMode
        pointId: string
        credits: number
        priceCents: number
        title: string
        body: string
        /** switch: the monthly plan to end, and when it ends. */
        subscriptionId: string | null
        subscriptionEndsAt: string | null
    }

/** Who is offered auto-refill, and how (#1278). Pure. */
export function decideOffer(i: OfferInput): AutoRefillOffer {
    if (i.existing?.status === 'on') return { show: false, reason: 'already on', on: true }
    if (!i.inRollout) return { show: false, reason: 'not in this half' }
    if (i.role !== 'student') return { show: false, reason: 'not a student' }
    if (i.status === 'inactive') return { show: false, reason: 'inactive' }
    const m = i.monthly
    if (!m || m.credits <= 0 || m.price < 50) return { show: false, reason: 'no monthly price on their plan' }
    const wording = autoRefillWording(m.credits, m.price)
    const base = { show: true as const, pointId: m.id, credits: m.credits, priceCents: m.price, title: wording.title, body: wording.body }

    if (i.running) {
        // A quarter still running (even its last month) is not offered: #1278.
        if (i.running.fixedLength || i.monthlyFixedLength) return { show: false, reason: 'quarter still running' }
        if (i.running.status === 'past_due') return { show: false, reason: 'monthly payment past due' }
        return { ...base, mode: 'switch', subscriptionId: i.running.ending ? null : i.running.id, subscriptionEndsAt: i.running.periodEnd }
    }
    return { ...base, mode: i.credits <= 0 ? 'buy' : 'save', subscriptionId: null, subscriptionEndsAt: null }
}

// ------------------------------------------------------- the decisions ---

/**
 * Should a new refill start for this family? Pure.
 * `lastRunOutAt` is the newest lesson log since the plan was armed that left
 * the balance at 0 or below (null when there is none).
 */
export function refillDue(plan: Pick<PlanRow, 'status'>, credits: number, hasOpenRefill: boolean, lastRunOutAt: string | null): boolean {
    return plan.status === 'on' && credits <= 0 && !hasOpenRefill && lastRunOutAt !== null
}

/** Is an open refill ready to charge now? Pure. */
export function readyToCharge(r: Pick<RefillRow, 'status' | 'triggered_at' | 'created_at' | 'next_retry_at'>, now: number): boolean {
    if (r.status === 'due') {
        const at = Date.parse(r.triggered_at ?? r.created_at)
        return Number.isFinite(at) && now - at >= DUE_GRACE_MINUTES * MINUTE
    }
    if (r.status === 'failed') return r.next_retry_at !== null && Date.parse(r.next_retry_at) <= now
    return false
}

/** When to try a declined card again: 3 days on, or never after the last try. Pure. */
export function nextRetryAt(attempts: number, now: number): string | null {
    return attempts < MAX_ATTEMPTS ? new Date(now + RETRY_AFTER_DAYS * DAY).toISOString() : null
}

/** The card charge: the price less any dollar account credit, at least $0.50 (Stripe's minimum). Pure. */
export function chargeAmount(priceCents: number, accountCreditCents: number): { amountCents: number; creditUsedCents: number } {
    const usable = Math.max(0, Math.min(Math.round(accountCreditCents), priceCents - 50))
    return { amountCents: priceCents - usable, creditUsedCents: usable }
}

// ------------------------------------------------------------- the deps ---

export type ChargeResult = {
    status: 'succeeded' | 'declined' | 'requires_action' | 'processing' | 'canceled'
    paymentIntentId: string | null
    /** Stripe's decline message and code, for the studio email. */
    message?: string | null
    code?: string | null
}

export type CheckoutInfo = {
    id: string
    status: 'complete' | 'open' | 'expired'
    mode: 'payment' | 'setup' | 'subscription'
    customerId: string | null
    metadata: Record<string, string>
    paymentMethodId: string | null
    paymentIntentId: string | null
    amountTotal: number | null
}

export type StartCheckoutParams = {
    mode: 'payment' | 'setup'
    kind: 'auto_refill_start' | 'auto_refill_card'
    customerId: string
    userId: string
    credits: number
    priceCents: number
    pointId: string | null
    endSubscriptionId: string | null
    refillId: string | null
    successUrl: string
    cancelUrl: string
}

/** Everything auto-refill asks of Stripe (lib/auto-refill-stripe.ts has the real one and a fake). */
export interface AutoRefillStripe {
    readonly fake: boolean
    priceIsFixedLength(priceId: string): Promise<boolean>
    runningPlan(customerId: string): Promise<RunningPlan | null>
    /** Ends a monthly plan at its period end; false when it is not this customer's open-ended running plan. */
    endPlanAtPeriodEnd(subscriptionId: string, customerId: string): Promise<boolean>
    /** Undoes endPlanAtPeriodEnd while the plan still runs; false when there is nothing to undo. */
    resumePlan(subscriptionId: string, customerId: string): Promise<boolean>
    createCheckout(p: StartCheckoutParams): Promise<{ id: string; url: string }>
    getCheckout(sessionId: string): Promise<CheckoutInfo>
    cardOf(paymentMethodId: string): Promise<{ brand: string | null; last4: string | null } | null>
    accountCreditCents(customerId: string): Promise<number>
    /** Takes used dollar credit off the Stripe customer balance, once per key. */
    useAccountCredit(customerId: string, studentId: string, key: string, cents: number): Promise<number>
    /**
     * Charges a refill off-session. With `paymentIntentId` it confirms that
     * PaymentIntent again (a retry); otherwise it creates one (idempotency
     * key per refill). Throws only when the outcome is unknown.
     */
    charge(p: {
        refillId: string
        attempt: number
        customerId: string
        paymentMethodId: string
        amountCents: number
        paymentIntentId: string | null
        studentId: string
        credits: number
    }): Promise<ChargeResult>
    getCharge(paymentIntentId: string): Promise<ChargeResult>
    findChargeForRefill(refillId: string): Promise<string | null>
    cancelCharge(paymentIntentId: string): Promise<void>
}

export interface AutoRefillStore {
    plan(studentId: string): Promise<PlanRow | null>
    plansOn(): Promise<PlanRow[]>
    family(studentId: string): Promise<Family | null>
    openRefill(studentId: string): Promise<RefillRow | null>
    refill(id: string): Promise<RefillRow | null>
    refillByPaymentIntent(paymentIntentId: string): Promise<RefillRow | null>
    /** The newest credit decrease to 0 or below after `sinceIso`, as its changed_at. */
    lastRunOutAfter(studentId: string, sinceIso: string): Promise<string | null>
    /** A paid refill for this student since `sinceIso`. */
    paidSince(studentId: string, sinceIso: string): Promise<boolean>
    /** Inserts a due refill; null when an open one already exists. */
    insertDueRefill(plan: PlanRow, triggeredAt: string): Promise<RefillRow | null>
    /** Inserts the paid first purchase of a Checkout; returns the row (existing on a repeat). */
    insertStartRefill(r: { studentId: string; sessionId: string; paymentIntentId: string | null; credits: number; priceCents: number; amountCents: number; accountCreditCents: number }): Promise<RefillRow>
    openRefills(): Promise<RefillRow[]>
    paidUncredited(): Promise<RefillRow[]>
    /** Moves a refill on only if it is still as read (status and updated_at); null when someone else got there first. */
    transition(r: Pick<RefillRow, 'id' | 'status' | 'updated_at'>, patch: Partial<RefillRow>): Promise<RefillRow | null>
    credit(refillId: string): Promise<{ previous: number; next: number; already: boolean }>
    /** Turns the plan on from a Checkout, once per session id; null when that session was already applied. */
    applyStart(p: {
        studentId: string; sessionId: string; customerId: string; paymentMethodId: string | null
        card: { brand: string | null; last4: string | null } | null; credits: number; priceCents: number
        pointId: string | null; endedSubscriptionId: string | null
    }): Promise<PlanRow | null>
    /** Saves a new card from a Checkout, once per session id; null when already applied. */
    applyCard(p: { studentId: string; sessionId: string; paymentMethodId: string; card: { brand: string | null; last4: string | null } | null }): Promise<PlanRow | null>
    /** Turns it off; null when it was not on. */
    turnOff(studentId: string, by: 'family' | 'admin'): Promise<PlanRow | null>
    rearm(studentId: string): Promise<void>
    /** Is the rollout stage letting refills be charged (not 'off')? */
    chargingAllowed(): Promise<boolean>
}

export type FamilyEmail = { subject: string; html: string }
export type StudioEmail = { subject: string; lines: string[]; footer: string }

export interface AutoRefillNotifier {
    family(to: string, email: FamilyEmail): Promise<boolean>
    studio(email: StudioEmail): Promise<boolean>
    /** The Tests card's usage record (portal_rollout_events). */
    track(studentId: string, action: string): Promise<void>
}

export type AutoRefillDeps = {
    store: AutoRefillStore
    stripe: AutoRefillStripe
    notify: AutoRefillNotifier
    /** Family email builders (lib/family-emails.ts), passed in so this file stays free of them. */
    emails: {
        charged(p: { firstName: string; credits: number; priceCents: number; cardLast4: string | null; creditUsedCents: number; settingsUrl: string }): FamilyEmail
        declined(p: { firstName: string; credits: number; priceCents: number; cardLast4: string | null; nextTry: string | null; settingsUrl: string; final: boolean }): FamilyEmail
    }
    appUrl: string
    now?: () => number
}

function nowOf(deps: AutoRefillDeps): number {
    return deps.now ? deps.now() : Date.now()
}

export function settingsUrl(appUrl: string): string {
    return `${appUrl.replace(/\/+$/, '')}/student/settings#auto-refill`
}

function firstName(f: Family): string {
    const n = (f.parentName || f.name || '').trim()
    return n.split(/\s+/)[0] || 'there'
}

function familyLabel(f: Family | null): string {
    if (!f) return 'a family (not found)'
    return f.parentName ? `${f.name} (parent: ${f.parentName})` : (f.name || 'a family')
}

/** "Mon, Nov 24" in studio time. */
export function dayWords(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: STUDIO_TZ })
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
const piLink = (id: string | null) => (id ? `<a href="https://dashboard.stripe.com/payments/${encodeURIComponent(id)}">${id}</a>` : 'none')

function esc(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// ------------------------------------------------------------ finding ---

export type FindResult = { studentId: string; refillId: string; triggeredAt: string }

/** Step 1: a due refill for every family whose lessons just ran out. */
export async function findRunOuts(deps: AutoRefillDeps): Promise<FindResult[]> {
    const out: FindResult[] = []
    for (const plan of await deps.store.plansOn()) {
        const family = await deps.store.family(plan.student_id)
        if (!family || family.credits > 0) continue
        if (await deps.store.openRefill(plan.student_id)) continue
        const ranOut = await deps.store.lastRunOutAfter(plan.student_id, plan.armed_at)
        if (!refillDue(plan, family.credits, false, ranOut)) continue
        const row = await deps.store.insertDueRefill(plan, ranOut!)
        if (row) out.push({ studentId: plan.student_id, refillId: row.id, triggeredAt: ranOut! })
    }
    return out
}

// ----------------------------------------------------------- charging ---

export type ChargeOutcome =
    | 'paid' | 'declined' | 'processing' | 'unknown'
    | 'skipped' | 'cancelled' | 'held' | 'busy' | 'not_ready' | 'paused'

/**
 * Step 2: charge one open refill. `force` charges a declined refill now (the
 * family just updated their card) instead of waiting for its retry date.
 */
export async function chargeRefill(
    deps: AutoRefillDeps,
    refill: RefillRow,
    { force = false }: { force?: boolean } = {},
): Promise<{ outcome: ChargeOutcome; refill: RefillRow | null; detail?: string }> {
    const now = nowOf(deps)
    if (refill.status !== 'due' && refill.status !== 'failed') return { outcome: 'busy', refill }
    if (!force && !readyToCharge(refill, now)) return { outcome: 'not_ready', refill }
    if (!(await deps.store.chargingAllowed())) return { outcome: 'paused', refill, detail: 'rollout stage is off' }

    const claimed = await deps.store.transition(refill, {
        status: 'charging',
        charging_at: new Date(now).toISOString(),
        attempts: refill.attempts + 1,
        updated_at: new Date(now).toISOString(),
    })
    if (!claimed) return { outcome: 'busy', refill }
    const back = () => deps.store.transition(claimed, {
        status: refill.status, attempts: refill.attempts, charging_at: refill.charging_at, updated_at: new Date(nowOf(deps)).toISOString(),
    })

    const plan = await deps.store.plan(claimed.student_id)
    const family = await deps.store.family(claimed.student_id)
    if (!plan || plan.status !== 'on') {
        const r = await closeRefill(deps, claimed, 'cancelled', 'auto-refill was turned off')
        return { outcome: 'cancelled', refill: r }
    }
    if (!family || family.credits > 0 || family.status === 'inactive') {
        const why = !family ? 'family not found' : family.status === 'inactive' ? 'family is inactive' : `lessons back to ${family.credits} before charging`
        const r = await closeRefill(deps, claimed, 'skipped', why)
        await deps.store.rearm(claimed.student_id)
        return { outcome: 'skipped', refill: r, detail: why }
    }
    if (await deps.store.paidSince(claimed.student_id, new Date(now - MIN_HOURS_BETWEEN_REFILLS * HOUR).toISOString())) {
        await back()
        return { outcome: 'held', refill, detail: `a refill was paid in the last ${MIN_HOURS_BETWEEN_REFILLS} hours` }
    }
    const customerId = plan.stripe_customer_id || family.stripeCustomerId
    if (!plan.payment_method_id || !customerId) {
        return failed(deps, claimed, plan, family, { status: 'declined', paymentIntentId: claimed.stripe_payment_intent_id, message: 'no saved card', code: 'no_card' })
    }

    let creditCents = 0
    try {
        creditCents = await deps.stripe.accountCreditCents(customerId)
    } catch (e) {
        console.error('[auto-refill] account credit lookup failed, charging the full price:', e instanceof Error ? e.message : e)
    }
    const { amountCents, creditUsedCents } = chargeAmount(claimed.price_cents, creditCents)
    const priced = await deps.store.transition(claimed, {
        amount_cents: amountCents, account_credit_cents: creditUsedCents, updated_at: new Date(nowOf(deps)).toISOString(),
    }) ?? claimed

    let result: ChargeResult
    try {
        result = await deps.stripe.charge({
            refillId: priced.id,
            attempt: priced.attempts,
            customerId,
            paymentMethodId: plan.payment_method_id,
            amountCents,
            paymentIntentId: priced.stripe_payment_intent_id,
            studentId: priced.student_id,
            credits: priced.credits,
        })
    } catch (e) {
        // Unknown: Stripe may or may not have taken it. Stay 'charging'; the
        // stale check looks it up in Stripe in 10 minutes.
        const msg = e instanceof Error ? e.message : String(e)
        await deps.store.transition(priced, { last_error: `unknown: ${msg}`.slice(0, 500), updated_at: new Date(nowOf(deps)).toISOString() })
        return { outcome: 'unknown', refill: priced, detail: msg }
    }
    return settleCharge(deps, priced, plan, family, result)
}

/** What a charge came back as. Shared with the stale check and the webhook. */
async function settleCharge(
    deps: AutoRefillDeps,
    refill: RefillRow,
    plan: PlanRow,
    family: Family,
    result: ChargeResult,
): Promise<{ outcome: ChargeOutcome; refill: RefillRow | null; detail?: string }> {
    if (result.status === 'succeeded') return paid(deps, refill, plan, family, result.paymentIntentId)
    if (result.status === 'processing') {
        const r = await deps.store.transition(refill, { stripe_payment_intent_id: result.paymentIntentId ?? refill.stripe_payment_intent_id, updated_at: new Date(nowOf(deps)).toISOString() })
        return { outcome: 'processing', refill: r }
    }
    if (result.status === 'canceled') {
        const r = await closeRefill(deps, refill, 'cancelled', 'the payment was cancelled in Stripe')
        await deps.notify.studio({
            subject: `Auto-refill payment cancelled in Stripe: ${familyLabel(family)}`,
            lines: [`Family: ${familyLabel(family)}`, `Payment: ${piLink(result.paymentIntentId)}`, 'The refill was closed without lessons. Auto-refill stays on and starts again at the next lesson that runs them out.'],
            footer: 'From the auto-refill check.',
        })
        return { outcome: 'cancelled', refill: r }
    }
    return failed(deps, refill, plan, family, result)
}

async function closeRefill(deps: AutoRefillDeps, r: RefillRow, status: 'skipped' | 'cancelled', note: string): Promise<RefillRow | null> {
    if (r.stripe_payment_intent_id) {
        try {
            await deps.stripe.cancelCharge(r.stripe_payment_intent_id)
        } catch (e) {
            console.error('[auto-refill] could not cancel the open payment:', e instanceof Error ? e.message : e)
        }
    }
    return deps.store.transition(r, { status, note, next_retry_at: null, updated_at: new Date(nowOf(deps)).toISOString() })
}

async function paid(
    deps: AutoRefillDeps,
    refill: RefillRow,
    plan: PlanRow,
    family: Family,
    paymentIntentId: string | null,
): Promise<{ outcome: ChargeOutcome; refill: RefillRow | null }> {
    const now = new Date(nowOf(deps)).toISOString()
    const done = await deps.store.transition(refill, {
        status: 'paid', paid_at: now, next_retry_at: null, last_error: null,
        stripe_payment_intent_id: paymentIntentId ?? refill.stripe_payment_intent_id, updated_at: now,
    })
    if (!done) {
        // Someone else recorded it (the webhook): make sure the lessons are in, say nothing twice.
        await deps.store.credit(refill.id).catch(() => null)
        return { outcome: 'paid', refill: await deps.store.refill(refill.id) }
    }
    const credited = await deps.store.credit(done.id)
    if (done.account_credit_cents > 0 && plan.stripe_customer_id) {
        try {
            await deps.stripe.useAccountCredit(plan.stripe_customer_id, done.student_id, `refill:${done.id}`, done.account_credit_cents)
        } catch (e) {
            await deps.notify.studio({
                subject: `Auto-refill: account credit not taken off: ${familyLabel(family)}`,
                lines: [
                    `Family: ${familyLabel(family)}`,
                    `The refill was charged ${money(done.amount_cents)} after using ${money(done.account_credit_cents)} of their account credit, but the credit could not be taken off their Stripe balance.`,
                    `Take ${money(done.account_credit_cents)} off their account credit by hand so it is not used twice.`,
                    `Error: ${esc(e instanceof Error ? e.message : String(e))}`,
                ],
                footer: 'From the auto-refill check.',
            })
        }
    }
    await deps.notify.track(done.student_id, done.attempts > 1 ? 'refill_charged_retry' : 'refill_charged')
    if (family.email) {
        await deps.notify.family(family.email, deps.emails.charged({
            firstName: firstName(family), credits: done.credits, priceCents: done.price_cents, cardLast4: plan.card_last4,
            creditUsedCents: done.account_credit_cents, settingsUrl: settingsUrl(deps.appUrl),
        }))
    }
    await deps.notify.studio({
        subject: `Auto-refill charged: ${familyLabel(family)}`,
        lines: [
            `Family: ${familyLabel(family)}`,
            `${done.credits} lessons for ${money(done.price_cents)}${done.account_credit_cents ? ` (${money(done.account_credit_cents)} from account credit, ${money(done.amount_cents)} on the card)` : ''}, card ending ${plan.card_last4 ?? 'unknown'}`,
            `Lessons: ${credited.previous} to ${credited.next}`,
            ...(done.attempts > 1 ? [`Went through on try ${done.attempts}.`] : []),
            `Payment: ${piLink(done.stripe_payment_intent_id)}`,
        ],
        footer: 'Auto-refill (#1477). The family got a short email that the lessons were added. Turn it off for a family in their side panel in admin.',
    })
    return { outcome: 'paid', refill: await deps.store.refill(done.id) }
}

async function failed(
    deps: AutoRefillDeps,
    refill: RefillRow,
    plan: PlanRow,
    family: Family,
    result: ChargeResult,
): Promise<{ outcome: ChargeOutcome; refill: RefillRow | null; detail?: string }> {
    const now = nowOf(deps)
    const attempts = Math.max(1, refill.attempts)
    const retry = nextRetryAt(attempts, now)
    const reason = [result.message, result.code ? `(${result.code})` : null].filter(Boolean).join(' ') || 'declined'
    const done = await deps.store.transition(refill, {
        status: 'failed',
        stripe_payment_intent_id: result.paymentIntentId ?? refill.stripe_payment_intent_id,
        last_error: (result.status === 'requires_action' ? `the bank asked the family to confirm: ${reason}` : reason).slice(0, 500),
        next_retry_at: retry,
        updated_at: new Date(now).toISOString(),
    })
    if (!done) return { outcome: 'busy', refill }
    await deps.notify.track(done.student_id, 'refill_declined')

    const first = attempts === 1
    const last = retry === null
    if ((first || last) && family.email) {
        await deps.notify.family(family.email, deps.emails.declined({
            firstName: firstName(family), credits: done.credits, priceCents: done.price_cents, cardLast4: plan.card_last4,
            nextTry: retry ? dayWords(retry) : null, settingsUrl: settingsUrl(deps.appUrl), final: last && !first,
        }))
    }
    await deps.notify.studio({
        subject: last
            ? `Auto-refill declined, stopped trying: ${familyLabel(family)}`
            : `Auto-refill declined${first ? '' : ` again (try ${attempts})`}: ${familyLabel(family)}`,
        lines: [
            `Family: ${familyLabel(family)}`,
            `${done.credits} lessons for ${money(done.price_cents)}, card ending ${plan.card_last4 ?? 'unknown'}`,
            `Declined: ${esc(done.last_error ?? reason)}`,
            `Try ${attempts} of ${MAX_ATTEMPTS}. ${retry ? `Next try: ${dayWords(retry)}.` : 'No more automatic tries.'}`,
            `Lessons left now: ${family.credits} (their lessons keep going)`,
            first || last ? 'The family was emailed a link to update their card and pay (Settings in the portal).' : 'The family was not emailed again this time.',
            `Payment: ${piLink(done.stripe_payment_intent_id)}`,
        ],
        footer: 'Auto-refill (#1277): the family updating their card in Settings charges this refill straight away. Turn auto-refill off for a family in their side panel in admin.',
    })
    return { outcome: 'declined', refill: done, detail: reason }
}

// ----------------------------------------------------------- recovery ---

/** A charge left 'charging' (the run died mid-way, or Stripe said processing): look it up. */
export async function recoverCharging(deps: AutoRefillDeps, refill: RefillRow): Promise<ChargeOutcome> {
    const plan = await deps.store.plan(refill.student_id)
    const family = await deps.store.family(refill.student_id)
    const pi = refill.stripe_payment_intent_id ?? await deps.stripe.findChargeForRefill(refill.id)
    if (!pi) {
        // Stripe never saw it: put it back; the next run tries again with the same idempotency key.
        await deps.store.transition(refill, {
            status: refill.attempts <= 1 ? 'due' : 'failed',
            attempts: Math.max(0, refill.attempts - 1),
            next_retry_at: refill.attempts <= 1 ? null : new Date(nowOf(deps)).toISOString(),
            updated_at: new Date(nowOf(deps)).toISOString(),
        })
        return 'unknown'
    }
    const result = await deps.stripe.getCharge(pi)
    if (result.status === 'processing') return 'processing'
    if (!plan || !family) {
        if (result.status === 'succeeded') {
            const r = await deps.store.transition(refill, { status: 'paid', paid_at: new Date(nowOf(deps)).toISOString(), stripe_payment_intent_id: pi, updated_at: new Date(nowOf(deps)).toISOString() })
            if (r) await deps.store.credit(r.id)
            return 'paid'
        }
        return 'busy'
    }
    return (await settleCharge(deps, refill, plan, family, { ...result, paymentIntentId: pi })).outcome
}

/** The webhook's payment_intent.succeeded for a refill (if that event is ever turned on): record it if the run did not. */
export async function reconcilePaymentIntent(deps: AutoRefillDeps, paymentIntentId: string, refillId: string | null): Promise<ChargeOutcome | 'not_ours'> {
    const refill = (refillId ? await deps.store.refill(refillId) : null) ?? await deps.store.refillByPaymentIntent(paymentIntentId)
    if (!refill) return 'not_ours'
    if (refill.status === 'paid') {
        await deps.store.credit(refill.id)
        return 'paid'
    }
    if (refill.status === 'skipped' || refill.status === 'cancelled') {
        await deps.notify.studio({
            subject: 'Auto-refill: a payment went through for a closed refill',
            lines: [`Payment: ${piLink(paymentIntentId)}`, `Refill status: ${refill.status} (${esc(refill.note ?? '')})`, 'No lessons were added. Refund it in Stripe, or add the lessons with Adjust lessons.'],
            footer: 'From the Stripe webhook.',
        })
        return 'busy'
    }
    const plan = await deps.store.plan(refill.student_id)
    const family = await deps.store.family(refill.student_id)
    if (!plan || !family) return 'busy'
    return (await paid(deps, refill, plan, family, paymentIntentId)).outcome
}

// --------------------------------------------------------------- run ---

export type RunReport = {
    paused: boolean
    found: FindResult[]
    charged: { refillId: string; studentId: string; outcome: ChargeOutcome; detail?: string }[]
    recovered: { refillId: string; outcome: ChargeOutcome }[]
    credited: string[]
    waiting: number
}

/** One cron run: recover, find, charge. */
export async function runAutoRefill(deps: AutoRefillDeps): Promise<RunReport> {
    const now = nowOf(deps)
    const report: RunReport = { paused: false, found: [], charged: [], recovered: [], credited: [], waiting: 0 }

    // Paid but the lessons never landed (the run died between the two).
    for (const r of await deps.store.paidUncredited()) {
        try {
            await deps.store.credit(r.id)
            report.credited.push(r.id)
        } catch (e) {
            console.error('[auto-refill] late credit failed:', e instanceof Error ? e.message : e)
        }
    }

    const open = await deps.store.openRefills()
    for (const r of open.filter(r => r.status === 'charging' && r.charging_at && now - Date.parse(r.charging_at) >= STALE_CHARGING_MINUTES * MINUTE)) {
        try {
            report.recovered.push({ refillId: r.id, outcome: await recoverCharging(deps, r) })
        } catch (e) {
            console.error('[auto-refill] recovery failed:', e instanceof Error ? e.message : e)
        }
    }

    report.found = await findRunOuts(deps)

    report.paused = !(await deps.store.chargingAllowed())
    const openNow = await deps.store.openRefills()
    report.waiting = openNow.length
    if (report.paused) return report
    const ready = openNow.filter(r => readyToCharge(r, now))

    for (const r of ready.slice(0, MAX_CHARGES_PER_RUN)) {
        try {
            const res = await chargeRefill(deps, r)
            report.charged.push({ refillId: r.id, studentId: r.student_id, outcome: res.outcome, detail: res.detail })
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            console.error('[auto-refill] charge failed:', msg)
            report.charged.push({ refillId: r.id, studentId: r.student_id, outcome: 'unknown', detail: msg })
        }
    }
    report.waiting = (await deps.store.openRefills()).length
    return report
}

/** What a run would do, changing nothing (?dry=1). */
export async function previewAutoRefill(deps: Pick<AutoRefillDeps, 'store' | 'now'>): Promise<{
    paused: boolean
    wouldStart: { studentId: string; credits: number; triggeredAt: string }[]
    wouldCharge: { refillId: string; studentId: string; status: RefillStatus; attempts: number; amountCents: number }[]
    open: { refillId: string; studentId: string; status: RefillStatus; nextRetryAt: string | null }[]
}> {
    const now = deps.now ? deps.now() : Date.now()
    const wouldStart = []
    for (const plan of await deps.store.plansOn()) {
        const family = await deps.store.family(plan.student_id)
        if (!family || family.credits > 0 || await deps.store.openRefill(plan.student_id)) continue
        const ranOut = await deps.store.lastRunOutAfter(plan.student_id, plan.armed_at)
        if (refillDue(plan, family.credits, false, ranOut)) wouldStart.push({ studentId: plan.student_id, credits: family.credits, triggeredAt: ranOut! })
    }
    const open = await deps.store.openRefills()
    return {
        paused: !(await deps.store.chargingAllowed()),
        wouldStart,
        wouldCharge: open.filter(r => readyToCharge(r, now)).map(r => ({ refillId: r.id, studentId: r.student_id, status: r.status, attempts: r.attempts, amountCents: r.price_cents })),
        open: open.map(r => ({ refillId: r.id, studentId: r.student_id, status: r.status, nextRetryAt: r.next_retry_at })),
    }
}

// ----------------------------------------------------------- checkout ---

export type CheckoutOutcome = { ok: boolean; action: 'started' | 'card' | 'already' | 'ignored'; message: string; charge?: ChargeOutcome }

/**
 * A finished auto-refill Checkout, from the webhook or the page the family
 * comes back to (whichever is first; the other finds it done). Turns the plan
 * on (with the first 4 lessons when it took a payment), or saves a new card
 * and charges a declined refill with it.
 */
export async function completeCheckout(deps: AutoRefillDeps, s: CheckoutInfo): Promise<CheckoutOutcome> {
    const kind = s.metadata?.type
    if (kind !== 'auto_refill_start' && kind !== 'auto_refill_card') return { ok: false, action: 'ignored', message: 'not an auto-refill checkout' }
    if (s.status !== 'complete') return { ok: false, action: 'ignored', message: 'checkout not finished' }
    const studentId = s.metadata.userId
    const family = studentId ? await deps.store.family(studentId) : null
    if (!family) return { ok: false, action: 'ignored', message: 'family not found' }
    if (family.stripeCustomerId && s.customerId && family.stripeCustomerId !== s.customerId) {
        return { ok: false, action: 'ignored', message: 'checkout belongs to another customer' }
    }
    const customerId = s.customerId || family.stripeCustomerId
    if (!customerId) return { ok: false, action: 'ignored', message: 'no Stripe customer' }
    const card = s.paymentMethodId ? await deps.stripe.cardOf(s.paymentMethodId).catch(() => null) : null

    if (kind === 'auto_refill_card') {
        if (!s.paymentMethodId) return { ok: false, action: 'ignored', message: 'no card on the checkout' }
        const applied = await deps.store.applyCard({ studentId, sessionId: s.id, paymentMethodId: s.paymentMethodId, card })
        if (!applied) return { ok: true, action: 'already', message: 'card already saved' }
        const open = await deps.store.openRefill(studentId)
        let charge: ChargeOutcome | undefined
        if (open && open.status === 'failed' && applied.status === 'on') {
            charge = (await chargeRefill(deps, open, { force: true })).outcome
        }
        return { ok: true, action: 'card', message: charge ? `card saved, refill ${charge}` : 'card saved', charge }
    }

    const credits = Number(s.metadata.credits)
    const priceCents = Number(s.metadata.priceCents)
    if (!(credits > 0) || !(priceCents >= 50)) return { ok: false, action: 'ignored', message: 'checkout has no lessons or price' }
    const endSub = s.metadata.endSubscriptionId || null

    const applied = await deps.store.applyStart({
        studentId, sessionId: s.id, customerId, paymentMethodId: s.paymentMethodId, card,
        credits, priceCents, pointId: s.metadata.pointId || null, endedSubscriptionId: endSub,
    })

    // The first 4 lessons (payment mode). Idempotent by session id, and
    // credit_auto_refill adds them once however often this runs.
    if (s.mode === 'payment') {
        const start = await deps.store.insertStartRefill({
            studentId, sessionId: s.id, paymentIntentId: s.paymentIntentId, credits, priceCents,
            amountCents: s.amountTotal ?? priceCents, accountCreditCents: Number(s.metadata.accountCreditCents) || 0,
        })
        await deps.store.credit(start.id)
        const used = Number(s.metadata.accountCreditCents) || 0
        if (used > 0) {
            try {
                await deps.stripe.useAccountCredit(customerId, studentId, s.id, used)
            } catch (e) {
                await deps.notify.studio({
                    subject: `Auto-refill: account credit not taken off: ${familyLabel(family)}`,
                    lines: [`Checkout ${esc(s.id)} took ${money(used)} of account credit off the first 4 lessons, but it could not be taken off their Stripe balance. Take it off by hand so it is not used twice.`, `Error: ${esc(e instanceof Error ? e.message : String(e))}`],
                    footer: 'From the auto-refill checkout.',
                })
            }
        }
    }

    let ended = false
    if (endSub) {
        try {
            ended = await deps.stripe.endPlanAtPeriodEnd(endSub, customerId)
        } catch (e) {
            console.error('[auto-refill] could not end the monthly plan:', e instanceof Error ? e.message : e)
        }
    }

    if (!applied) return { ok: true, action: 'already', message: 'already on' }
    await deps.notify.track(studentId, 'chosen')
    await deps.notify.studio({
        subject: `Auto-refill turned on: ${familyLabel(family)}`,
        lines: [
            `Family: ${familyLabel(family)}`,
            `${credits} lessons for ${money(priceCents)} each time their lessons run out, card ending ${card?.last4 ?? 'unknown'}`,
            s.mode === 'payment'
                ? `Their first ${credits} lessons were bought now (held for 3 days like other card payments, then collected).`
                : endSub
                    ? (ended ? 'Their monthly plan was set to stop at the end of the month already paid; no more monthly charges.' : 'Their monthly plan could NOT be set to stop: check it in Stripe so they are not charged both ways.')
                    : `Nothing was charged now: they have ${family.credits} lessons left; the first refill comes when those run out.`,
        ],
        footer: 'Auto-refill (#1477), on the half split (Tests card on the jobs page).',
    })
    return { ok: true, action: 'started', message: 'auto-refill on' }
}

// ------------------------------------------------------------ turn off ---

/** Turns auto-refill off (family in Settings, or Lionel in admin). Cancels a refill not yet charged. */
export async function turnOffAutoRefill(deps: AutoRefillDeps, studentId: string, by: 'family' | 'admin'): Promise<{ ok: boolean; wasOn: boolean; resumedMonthly: boolean; cancelledRefill: boolean }> {
    const plan = await deps.store.turnOff(studentId, by)
    if (!plan) return { ok: true, wasOn: false, resumedMonthly: false, cancelledRefill: false }
    let cancelledRefill = false
    const open = await deps.store.openRefill(studentId)
    if (open && (open.status === 'due' || open.status === 'failed')) {
        cancelledRefill = Boolean(await closeRefill(deps, open, 'cancelled', `auto-refill turned off by ${by === 'admin' ? 'the studio' : 'the family'}`))
    }
    // They switched from a monthly plan that is still winding down: it carries on, so they are not left with neither.
    let resumedMonthly = false
    if (plan.ended_subscription_id && plan.stripe_customer_id) {
        try {
            resumedMonthly = await deps.stripe.resumePlan(plan.ended_subscription_id, plan.stripe_customer_id)
        } catch (e) {
            console.error('[auto-refill] could not resume the monthly plan:', e instanceof Error ? e.message : e)
        }
    }
    if (by === 'family') await deps.notify.track(studentId, 'turned_off')
    const family = await deps.store.family(studentId)
    await deps.notify.studio({
        subject: `Auto-refill turned off${by === 'admin' ? ' (by you)' : ''}: ${familyLabel(family)}`,
        lines: [
            `Family: ${familyLabel(family)}`,
            `Lessons left: ${family?.credits ?? 'unknown'}`,
            ...(cancelledRefill ? [`An unpaid refill (${open?.status === 'failed' ? 'declined' : 'not charged yet'}) was cancelled; any lessons owed stay owed.`] : []),
            ...(resumedMonthly ? ['Their monthly plan was still winding down, so it now carries on as before.'] : []),
        ],
        footer: 'Auto-refill (#1477).',
    })
    return { ok: true, wasOn: true, resumedMonthly, cancelledRefill }
}
