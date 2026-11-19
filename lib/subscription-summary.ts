import type Stripe from 'stripe'

/**
 * How a family's Stripe subscriptions read, in one place: the student
 * dashboard's renewal banner (getSubscriptionSummary, app/actions/stripe.ts)
 * and the admin Balances page (#935) both use it, so they can never disagree.
 * Pure: give it what stripe.subscriptions.list({ status: 'all' }) returned.
 */

/** Stripe statuses that still count as a running plan (the checkout guard's test). */
export const RUNNING_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due']

export type SubscriptionSummary = {
    /** True while Stripe still considers a subscription running (same test the checkout guard uses). */
    active: boolean
    /** Set when the plan has been capped (e.g. the 3-installment quarterly plan) and will not bill again. */
    endingAt: string | null
    /** Next automatic charge, ISO. Null when the subscription is winding down. */
    nextPaymentAt: string | null
    creditsPerCycle: number | null
    amountCents: number | null
}

export const NO_SUBSCRIPTION: SubscriptionSummary = {
    active: false, endingAt: null, nextPaymentAt: null, creditsPerCycle: null, amountCents: null,
}

export function runningSubscription(subs: Stripe.Subscription[]): Stripe.Subscription | null {
    return subs.find(sub => RUNNING_SUBSCRIPTION_STATUSES.includes(sub.status)) ?? null
}

export function summarizeSubscriptions(subs: Stripe.Subscription[]): SubscriptionSummary {
    // Match the checkout guard's definition of "running" exactly, so the banner
    // and the guard can never disagree about whether a purchase is possible.
    const running = runningSubscription(subs)
    if (!running) return NO_SUBSCRIPTION

    // current_period_end lives on the subscription item in recent API versions,
    // and on the subscription itself in older ones.
    const item = running.items?.data?.[0] as any
    const periodEndUnix: number | undefined = item?.current_period_end ?? (running as any).current_period_end
    const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null

    // A capped plan (billing_cycles metadata) gets cancel_at_period_end set by the
    // webhook once it has taken its last payment. It is still "active", so the
    // guard still blocks self-serve checkout, but there is no next charge coming.
    const windingDown = running.cancel_at_period_end || Boolean(running.cancel_at)
    const cancelAt = running.cancel_at ? new Date(running.cancel_at * 1000).toISOString() : null

    return {
        active: true,
        endingAt: windingDown ? (cancelAt ?? periodEnd) : null,
        nextPaymentAt: windingDown ? null : periodEnd,
        creditsPerCycle: Number(running.metadata?.credits) || null,
        amountCents: item?.price?.unit_amount ?? null,
    }
}
