import type Stripe from 'stripe'
import { stripe, getAccountCreditCents, getOrCreateStripeCustomer } from '@/lib/stripe'
import { RUNNING_SUBSCRIPTION_STATUSES, runningSubscription } from '@/lib/subscription-summary'
import type { AutoRefillStripe, ChargeResult, CheckoutInfo, RunningPlan, StartCheckoutParams } from '@/lib/auto-refill'

/**
 * What auto-refill (lib/auto-refill.ts) asks of Stripe: the real calls, and a
 * fake for tests and for running the portal locally without the live key
 * ever being used for a charge (AUTO_REFILL_FAKE_STRIPE=1, never honoured in
 * production).
 *
 * The real refill charge is one off-session PaymentIntent per refill, created
 * with the idempotency key auto-refill-<refill id>; a retry confirms that same
 * PaymentIntent (key auto-refill-<refill id>-try-<n>), so one refill can never
 * be paid twice. Cards only (payment_method_types), so no redirect is needed.
 */

export type LayerWithCustomer = AutoRefillStripe & {
    /** The family's Stripe customer, made on first use (the fake never makes one). */
    ensureCustomer(userId: string, email: string, existing: string | null): Promise<string>
}

const idOf = (v: unknown): string | null =>
    typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as any).id === 'string' ? (v as any).id : null

function fromPaymentIntent(pi: Stripe.PaymentIntent): ChargeResult {
    const err = pi.last_payment_error
    const base = { paymentIntentId: pi.id, message: err?.message ?? null, code: (err as any)?.decline_code || err?.code || null }
    switch (pi.status) {
        case 'succeeded':
        case 'requires_capture':
            return { ...base, status: 'succeeded' }
        case 'processing':
            return { ...base, status: 'processing' }
        case 'requires_action':
            return { ...base, status: 'requires_action' }
        case 'canceled':
            return { ...base, status: 'canceled' }
        default:
            return { ...base, status: 'declined', message: base.message ?? `payment ${pi.status}` }
    }
}

export function realStripe(): LayerWithCustomer {
    async function accountCoupon(customerId: string, userId: string, priceCents: number): Promise<{ discounts: Stripe.Checkout.SessionCreateParams.Discount[]; cents: number }> {
        // As createCheckoutSession does for packages: Checkout in payment mode
        // has no invoice, so the family's dollar credit is a one-off coupon here
        // and is taken off their Stripe balance once the checkout completes.
        try {
            const credit = await getAccountCreditCents(customerId)
            const cents = Math.min(credit, Math.max(0, priceCents - 50))
            if (cents <= 0) return { discounts: [], cents: 0 }
            const coupon = await stripe.coupons.create({
                amount_off: cents, currency: 'usd', duration: 'once', max_redemptions: 1, name: 'Account credit', metadata: { userId },
            })
            return { discounts: [{ coupon: coupon.id }], cents }
        } catch (e) {
            console.error('[auto-refill] account credit lookup failed, full price:', e instanceof Error ? e.message : e)
            return { discounts: [], cents: 0 }
        }
    }

    return {
        fake: false,

        async ensureCustomer(userId, email, existing) {
            return existing || getOrCreateStripeCustomer(userId, email)
        },

        async priceIsFixedLength(priceId) {
            const price = await stripe.prices.retrieve(priceId)
            return Number(price.metadata?.billing_cycles) > 0
        },

        async runningPlan(customerId): Promise<RunningPlan | null> {
            const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })
            const running = runningSubscription(subs.data)
            if (!running) return null
            const item = running.items?.data?.[0] as any
            const periodEndUnix: number | undefined = item?.current_period_end ?? (running as any).current_period_end
            return {
                id: running.id,
                status: running.status,
                fixedLength: Number(item?.price?.metadata?.billing_cycles) > 0,
                ending: Boolean(running.cancel_at_period_end || running.cancel_at),
                periodEnd: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
            }
        },

        async endPlanAtPeriodEnd(subscriptionId, customerId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            if (idOf(sub.customer) !== customerId) return false
            if (!RUNNING_SUBSCRIPTION_STATUSES.includes(sub.status)) return false
            if (Number((sub.items.data[0]?.price as any)?.metadata?.billing_cycles) > 0) return false
            if (sub.cancel_at_period_end || sub.cancel_at) return true
            await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true, metadata: { autoRefill: 'ended' } })
            return true
        },

        async resumePlan(subscriptionId, customerId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            if (idOf(sub.customer) !== customerId) return false
            if (!['active', 'trialing'].includes(sub.status) || !sub.cancel_at_period_end) return false
            // Only a plan auto-refill itself set to end.
            if (sub.metadata?.autoRefill !== 'ended') return false
            await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false, metadata: { autoRefill: '' } })
            return true
        },

        async createCheckout(p: StartCheckoutParams) {
            const metadata: Record<string, string> = {
                userId: p.userId,
                type: p.kind,
                credits: String(p.credits),
                priceCents: String(p.priceCents),
                ...(p.pointId ? { pointId: p.pointId } : {}),
                ...(p.endSubscriptionId ? { endSubscriptionId: p.endSubscriptionId } : {}),
                ...(p.refillId ? { refillId: p.refillId } : {}),
            }
            let session: Stripe.Checkout.Session
            if (p.mode === 'setup') {
                session = await stripe.checkout.sessions.create({
                    mode: 'setup',
                    payment_method_types: ['card'],
                    customer: p.customerId,
                    metadata,
                    setup_intent_data: { metadata: { userId: p.userId, type: p.kind } },
                    success_url: p.successUrl,
                    cancel_url: p.cancelUrl,
                })
            } else {
                const credit = await accountCoupon(p.customerId, p.userId, p.priceCents)
                session = await stripe.checkout.sessions.create({
                    mode: 'payment',
                    payment_method_types: ['card'],
                    customer: p.customerId,
                    line_items: [{
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: `Auto-refill: ${p.credits} lessons`,
                                description: 'Your first lessons on auto-refill. After these, your card is charged only when your lessons run out.',
                            },
                            unit_amount: p.priceCents,
                        },
                        quantity: 1,
                    }],
                    ...(credit.discounts.length ? { discounts: credit.discounts } : {}),
                    metadata: { ...metadata, ...(credit.cents > 0 ? { accountCreditCents: String(credit.cents) } : {}) },
                    // Held like other card payments (the capture-payments cron
                    // collects it after 3 days), and saved for the refills.
                    payment_intent_data: {
                        capture_method: 'manual',
                        setup_future_usage: 'off_session',
                        metadata: { userId: p.userId, type: p.kind },
                    },
                    success_url: p.successUrl,
                    cancel_url: p.cancelUrl,
                })
            }
            if (!session.url) throw new Error('Stripe gave no checkout link')
            return { id: session.id, url: session.url }
        },

        async getCheckout(sessionId): Promise<CheckoutInfo> {
            const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent', 'payment_intent'] })
            const si = s.setup_intent && typeof s.setup_intent === 'object' ? s.setup_intent : null
            const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null
            return {
                id: s.id,
                status: (s.status ?? 'open') as CheckoutInfo['status'],
                mode: s.mode as CheckoutInfo['mode'],
                customerId: idOf(s.customer),
                metadata: (s.metadata ?? {}) as Record<string, string>,
                paymentMethodId: idOf(si?.payment_method) ?? idOf(pi?.payment_method),
                paymentIntentId: idOf(s.payment_intent),
                amountTotal: s.amount_total ?? null,
            }
        },

        async cardOf(paymentMethodId) {
            const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
            return { brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null }
        },

        accountCreditCents: getAccountCreditCents,

        async useAccountCredit(customerId, studentId, key, cents) {
            const existing = await stripe.customers.listBalanceTransactions(customerId, { limit: 50 })
            if (existing.data.some(t => t.metadata?.autoRefillKey === key || t.metadata?.checkoutSessionId === key)) return 0
            const used = Math.min(Math.round(cents), await getAccountCreditCents(customerId))
            if (used <= 0) return 0
            await stripe.customers.createBalanceTransaction(customerId, {
                amount: used, // positive: the credit shrinks
                currency: 'usd',
                description: 'Account credit used on auto-refill lessons',
                metadata: { studentId, autoRefillKey: key },
            })
            return used
        },

        async charge(p) {
            try {
                if (p.paymentIntentId) {
                    const current = await stripe.paymentIntents.retrieve(p.paymentIntentId)
                    if (['succeeded', 'processing', 'canceled', 'requires_capture'].includes(current.status)) return fromPaymentIntent(current)
                    if (current.amount !== p.amountCents) await stripe.paymentIntents.update(current.id, { amount: p.amountCents })
                    const pi = await stripe.paymentIntents.confirm(
                        current.id,
                        { payment_method: p.paymentMethodId, off_session: true },
                        { idempotencyKey: `auto-refill-${p.refillId}-try-${p.attempt}` },
                    )
                    return fromPaymentIntent(pi)
                }
                const pi = await stripe.paymentIntents.create({
                    amount: p.amountCents,
                    currency: 'usd',
                    customer: p.customerId,
                    payment_method: p.paymentMethodId,
                    payment_method_types: ['card'],
                    off_session: true,
                    confirm: true,
                    description: `Auto-refill: ${p.credits} lessons`,
                    metadata: { type: 'auto_refill', userId: p.studentId, refillId: p.refillId, credits: String(p.credits) },
                }, { idempotencyKey: `auto-refill-${p.refillId}` })
                return fromPaymentIntent(pi)
            } catch (e) {
                const err = e as any
                const pi = err?.raw?.payment_intent ?? err?.payment_intent
                if (err?.type === 'StripeCardError' || (pi && typeof pi === 'object')) {
                    return {
                        status: err?.code === 'authentication_required' ? 'requires_action' : 'declined',
                        paymentIntentId: idOf(pi) ?? p.paymentIntentId,
                        message: err?.message ?? null,
                        code: err?.decline_code || err?.code || null,
                    }
                }
                if (err?.type === 'StripeInvalidRequestError' && !p.paymentIntentId && err?.code !== 'idempotency_key_in_use') {
                    // Stripe refused the request outright (the card was removed, ...): nothing was charged.
                    return { status: 'declined', paymentIntentId: null, message: err?.message ?? 'Stripe refused the charge', code: err?.code ?? null }
                }
                throw e
            }
        },

        async getCharge(paymentIntentId) {
            return fromPaymentIntent(await stripe.paymentIntents.retrieve(paymentIntentId))
        },

        async findChargeForRefill(refillId) {
            const found = await stripe.paymentIntents.search({ query: `metadata['refillId']:'${refillId.replace(/[^0-9a-f-]/gi, '')}'`, limit: 1 })
            return found.data[0]?.id ?? null
        },

        async cancelCharge(paymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
            if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(pi.status)) {
                await stripe.paymentIntents.cancel(paymentIntentId)
            }
        },
    }
}

// --------------------------------------------------------------- fake ---

export type FakeOptions = {
    /** Decline every charge, or decide per attempt. */
    decline?: boolean | ((attempt: number) => boolean)
    running?: RunningPlan | null
    fixedLength?: boolean
    accountCreditCents?: number
    /** Make charge() throw (an unknown outcome). */
    throwOnCharge?: boolean
}

export type FakeCall = { op: string; args: Record<string, unknown> }

function encode(v: unknown): string {
    return Buffer.from(JSON.stringify(v)).toString('base64url')
}

function decode(s: string): any {
    return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
}

/**
 * A pretend Stripe: Checkout "completes" by sending the family straight to its
 * success link, charges succeed (or decline), and every call is recorded.
 * Nothing reaches Stripe.
 */
export function fakeStripe(opts: FakeOptions = {}): LayerWithCustomer & { calls: FakeCall[]; charges: Map<string, ChargeResult> } {
    const calls: FakeCall[] = []
    const charges = new Map<string, ChargeResult>()
    const declines = (attempt: number) => typeof opts.decline === 'function' ? opts.decline(attempt) : Boolean(opts.decline)
    return {
        fake: true,
        calls,
        charges,
        async ensureCustomer(userId, _email, existing) {
            calls.push({ op: 'ensureCustomer', args: { userId } })
            return existing || `cus_fake_${userId.slice(0, 8)}`
        },
        async priceIsFixedLength(priceId) {
            calls.push({ op: 'priceIsFixedLength', args: { priceId } })
            return Boolean(opts.fixedLength)
        },
        async runningPlan(customerId) {
            calls.push({ op: 'runningPlan', args: { customerId } })
            return opts.running ?? null
        },
        async endPlanAtPeriodEnd(subscriptionId, customerId) {
            calls.push({ op: 'endPlanAtPeriodEnd', args: { subscriptionId, customerId } })
            return true
        },
        async resumePlan(subscriptionId, customerId) {
            calls.push({ op: 'resumePlan', args: { subscriptionId, customerId } })
            return true
        },
        async createCheckout(p) {
            calls.push({ op: 'createCheckout', args: { ...p } })
            const id = `cs_fake_${encode({ m: p.mode, k: p.kind, u: p.userId, c: p.credits, p: p.priceCents, pt: p.pointId, e: p.endSubscriptionId, r: p.refillId, cu: p.customerId, n: Math.random().toString(36).slice(2, 8) })}`
            return { id, url: p.successUrl.replace('{CHECKOUT_SESSION_ID}', id) }
        },
        async getCheckout(sessionId) {
            calls.push({ op: 'getCheckout', args: { sessionId } })
            if (!sessionId.startsWith('cs_fake_')) throw new Error('not a fake checkout')
            const d = decode(sessionId.slice('cs_fake_'.length))
            return {
                id: sessionId,
                status: 'complete',
                mode: d.m,
                customerId: d.cu,
                metadata: {
                    userId: d.u, type: d.k, credits: String(d.c), priceCents: String(d.p),
                    ...(d.pt ? { pointId: d.pt } : {}), ...(d.e ? { endSubscriptionId: d.e } : {}), ...(d.r ? { refillId: d.r } : {}),
                },
                paymentMethodId: d.k === 'auto_refill_card' ? 'pm_fake_new_card' : 'pm_fake_card',
                paymentIntentId: d.m === 'payment' ? `pi_fake_start_${d.n}` : null,
                amountTotal: d.m === 'payment' ? d.p : null,
            }
        },
        async cardOf(paymentMethodId) {
            calls.push({ op: 'cardOf', args: { paymentMethodId } })
            return { brand: 'visa', last4: paymentMethodId === 'pm_fake_new_card' ? '5556' : '4242' }
        },
        async accountCreditCents(customerId) {
            calls.push({ op: 'accountCreditCents', args: { customerId } })
            return opts.accountCreditCents ?? 0
        },
        async useAccountCredit(customerId, studentId, key, cents) {
            calls.push({ op: 'useAccountCredit', args: { customerId, studentId, key, cents } })
            return cents
        },
        async charge(p) {
            calls.push({ op: 'charge', args: { ...p } })
            if (opts.throwOnCharge) throw new Error('network went away')
            const id = p.paymentIntentId ?? `pi_fake_${p.refillId}`
            const prev = charges.get(id)
            if (prev?.status === 'succeeded') throw new Error('fake Stripe: this PaymentIntent already succeeded')
            const result: ChargeResult = declines(p.attempt)
                ? { status: 'declined', paymentIntentId: id, message: 'Your card was declined.', code: 'card_declined' }
                : { status: 'succeeded', paymentIntentId: id }
            charges.set(id, result)
            return result
        },
        async getCharge(paymentIntentId) {
            calls.push({ op: 'getCharge', args: { paymentIntentId } })
            return charges.get(paymentIntentId) ?? { status: 'declined', paymentIntentId, message: 'unknown fake payment' }
        },
        async findChargeForRefill(refillId) {
            calls.push({ op: 'findChargeForRefill', args: { refillId } })
            return charges.has(`pi_fake_${refillId}`) ? `pi_fake_${refillId}` : null
        },
        async cancelCharge(paymentIntentId) {
            calls.push({ op: 'cancelCharge', args: { paymentIntentId } })
            const c = charges.get(paymentIntentId)
            if (c && c.status !== 'succeeded') charges.set(paymentIntentId, { ...c, status: 'canceled' })
        },
    }
}

/** The layer the portal uses: real, or the fake when AUTO_REFILL_FAKE_STRIPE=1 outside production. */
export function autoRefillStripe(): LayerWithCustomer {
    if (process.env.AUTO_REFILL_FAKE_STRIPE === '1' && process.env.NODE_ENV !== 'production') {
        return fakeStripe({
            decline: process.env.AUTO_REFILL_FAKE_DECLINE === '1',
            running: process.env.AUTO_REFILL_FAKE_MONTHLY === '1'
                ? { id: 'sub_fake_monthly', status: 'active', fixedLength: false, ending: false, periodEnd: new Date(Date.now() + 12 * 86_400_000).toISOString() }
                : null,
        })
    }
    return realStripe()
}
