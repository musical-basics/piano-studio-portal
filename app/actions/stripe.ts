'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveEffectiveUserId } from '@/lib/impersonate'
import { stripe, getOrCreateStripeCustomer } from '@/lib/stripe'
import type Stripe from 'stripe'

export async function createCheckoutSession(pricingPointId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // 1. Fetch the Pricing Point details from DB
    const { data: point, error } = await supabase
        .from('pricing_points')
        .select('*')
        .eq('id', pricingPointId)
        .single()

    if (error || !point) {
        return { error: 'Invalid pricing option selected.' }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single()

    // Get or create a Stripe Customer for this user
    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, profile?.email || user.email!)

    try {
        let sessionParams: Stripe.Checkout.SessionCreateParams;

        if (point.type === 'subscription') {
            if (!point.stripe_price_id) {
                return { error: 'System Error: Subscription Price ID missing.' }
            }

            // Guard against duplicate subscriptions. Two families have accidentally
            // double-subscribed (double-submit at checkout, or subscribing again while
            // an older subscription was still running), which double-charges them every
            // month. If any subscription is still running for this customer, refuse
            // self-serve checkout and have them contact the teacher instead.
            const existingSubs = await stripe.subscriptions.list({
                customer: stripeCustomerId,
                status: 'all',
                limit: 10,
            })
            const hasRunningSubscription = existingSubs.data.some(sub =>
                ['active', 'trialing', 'past_due'].includes(sub.status)
            )
            if (hasRunningSubscription) {
                return { error: 'You already have an active subscription, so this purchase would create a duplicate and charge you twice. If you want to change your plan, please message me and I will sort it out.' }
            }

            sessionParams = {
                mode: 'subscription',
                payment_method_types: ['card'],
                customer: stripeCustomerId,
                line_items: [{ price: point.stripe_price_id, quantity: 1 }],
                subscription_data: {
                    metadata: {
                        userId: user.id,
                        credits: point.credits.toString()
                    }
                },
                metadata: {
                    userId: user.id,
                    credits: point.credits.toString(),
                    type: 'subscription'
                },
                success_url: `${appUrl}/student?success=true`,
                cancel_url: `${appUrl}/student?canceled=true`,
            }
        } else {
            // One-time payment
            sessionParams = {
                mode: 'payment',
                payment_method_types: ['card'],
                customer: stripeCustomerId,
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: point.label,
                            description: point.description || `Includes ${point.credits} lesson credits`,
                        },
                        unit_amount: point.price, // Already in cents from DB
                    },
                    quantity: 1, // We treat it as 1 item
                }],
                metadata: {
                    userId: user.id,
                    credits: point.credits.toString(),
                    type: 'one-time'
                },
                success_url: `${appUrl}/student?success=true`,
                cancel_url: `${appUrl}/student?canceled=true`,
                payment_intent_data: {
                    capture_method: 'manual',
                    setup_future_usage: 'off_session',
                    // On the PI itself so the auto-capture cron can tell it's ours.
                    metadata: { userId: user.id, type: 'one-time' },
                },
            }
        }

        const session = await stripe.checkout.sessions.create(sessionParams)
        return { url: session.url }

    } catch (err: any) {
        console.error('Stripe error:', err)
        return { error: err.message }
    }
}

/**
 * Create a checkout session specifically for paying off the Outstanding Balance
 */
export async function createBalancePaymentSession() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    // 1. Fetch current balance
    const { data: profile } = await supabase
        .from('profiles')
        .select('balance_due, email')
        .eq('id', user.id)
        .single()

    if (!profile || Number(profile.balance_due) <= 0) {
        return { error: 'No outstanding balance to pay.' }
    }

    // Get or create a Stripe Customer for this user
    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, profile.email || user.email!)

    const amountInCents = Math.round(Number(profile.balance_due) * 100)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer: stripeCustomerId,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Outstanding Balance Payment',
                        description: 'Payment for miscellaneous charges (Sheet music, late fees, etc.)',
                    },
                    unit_amount: amountInCents,
                },
                quantity: 1,
            }],
            metadata: {
                userId: user.id,
                type: 'balance_payment', // Distinct type for webhook
                amountPaid: amountInCents.toString()
            },
            success_url: `${appUrl}/student?success=true`,
            cancel_url: `${appUrl}/student?canceled=true`,
            payment_intent_data: {
                capture_method: 'manual',
                setup_future_usage: 'off_session',
                metadata: { userId: user.id, type: 'balance_payment' },
            },
        })

        return { url: session.url }
    } catch (err: any) {
        console.error('Stripe error:', err)
        return { error: err.message }
    }
}

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

/**
 * Read-only summary of the student's running subscription.
 *
 * The dashboard needs this because credits alone are a bad renewal signal: a
 * student on a monthly installment plan routinely dips to zero (or below) in the
 * days before the next charge lands. Prompting them to "Renew Package" there sends
 * them into createCheckoutSession, which correctly refuses to sell a second
 * subscription, so the parent hits an error with no way forward.
 *
 * Deliberately never creates a Stripe customer: someone who has never checked out
 * simply has no subscription. Any failure degrades to `active: false`, which
 * restores the old low-credits prompt rather than suppressing a genuine one.
 */
export async function getSubscriptionSummary(): Promise<SubscriptionSummary> {
    const inactive: SubscriptionSummary = {
        active: false, endingAt: null, nextPaymentAt: null, creditsPerCycle: null, amountCents: null,
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return inactive

    const effectiveUserId = await resolveEffectiveUserId(supabase, user.id)

    const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', effectiveUserId)
        .single()

    if (!profile?.stripe_customer_id) return inactive

    try {
        const subs = await stripe.subscriptions.list({
            customer: profile.stripe_customer_id,
            status: 'all',
            limit: 10,
        })

        // Match the checkout guard's definition of "running" exactly, so the banner
        // and the guard can never disagree about whether a purchase is possible.
        const running = subs.data.find(sub => ['active', 'trialing', 'past_due'].includes(sub.status))
        if (!running) return inactive

        // current_period_end lives on the subscription item in recent API versions,
        // and on the subscription itself in older ones.
        const item = running.items.data[0] as any
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
    } catch (err: any) {
        console.error('[getSubscriptionSummary] Stripe lookup failed:', err?.message)
        return inactive
    }
}
