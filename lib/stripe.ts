/**
 * Shared Stripe client and customer resolution.
 *
 * This lives outside `app/actions/stripe.ts` because that file is a `'use server'`
 * module: every export there has to be an async server action, so it cannot export
 * the Stripe instance or be imported by non-action code (lib/core/billing.ts).
 */

import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

let client: Stripe | null = null

function getStripe(): Stripe {
    if (!client) {
        client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2025-11-17.clover' as any,
        })
    }
    return client
}

/**
 * Constructed on first use, not at import.
 *
 * `lib/core/billing.ts` imports this, and `lib/core/lessons.ts` imports that, so
 * this module is now pulled in by cron routes and one-off scripts that have
 * nothing to do with payments. Building the client at module load would make all
 * of them throw "Neither apiKey nor config.authenticator provided" the moment
 * STRIPE_SECRET_KEY is absent, which is a confusing failure a long way from the
 * cause. Deferring it means only code that actually talks to Stripe needs the key.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
    get: (_target, prop) => {
        const instance = getStripe()
        const value = Reflect.get(instance, prop)
        // Nested resources (stripe.customers.*) carry their own `this`, but a
        // method read straight off the client would lose it through the proxy.
        return typeof value === 'function' ? value.bind(instance) : value
    },
})

/**
 * Get or create a Stripe Customer for a user, saving the id back to the profile.
 */
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
    const supabaseAdmin = createAdminClient()

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id, name')
        .eq('id', userId)
        .single()

    if (profile?.stripe_customer_id) {
        return profile.stripe_customer_id
    }

    const customer = await stripe.customers.create({
        email,
        name: profile?.name || undefined,
        metadata: { userId },
    })

    await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customer.id })
        .eq('id', userId)

    console.log(`Created Stripe Customer ${customer.id} for user ${userId}`)
    return customer.id
}

/**
 * The family's dollar credit with Stripe, in cents (always >= 0).
 *
 * Stripe stores this as `customer.balance`, signed the other way round: negative
 * means Stripe owes the customer (a credit), positive means the customer owes
 * Stripe. Only the credit direction is meaningful here, so a positive Stripe
 * balance (arrears) reports as zero credit rather than as a negative one.
 */
export async function getAccountCreditCents(stripeCustomerId: string): Promise<number> {
    const customer = await stripe.customers.retrieve(stripeCustomerId)
    if ((customer as any).deleted) return 0
    const balance = (customer as Stripe.Customer).balance ?? 0
    return balance < 0 ? Math.abs(balance) : 0
}
