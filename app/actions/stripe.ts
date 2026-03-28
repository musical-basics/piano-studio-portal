'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-11-17.clover' as any,
})

/**
 * Get or create a Stripe Customer for a user.
 * Saves stripe_customer_id to profiles table for future use.
 */
async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
    const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    )

    // Check if we already have a Stripe Customer ID saved
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id, name')
        .eq('id', userId)
        .single()

    if (profile?.stripe_customer_id) {
        return profile.stripe_customer_id
    }

    // Create a new Stripe Customer
    const customer = await stripe.customers.create({
        email,
        name: profile?.name || undefined,
        metadata: { userId }
    })

    // Save the Customer ID to the profile
    await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customer.id })
        .eq('id', userId)

    console.log(`Created Stripe Customer ${customer.id} for user ${userId}`)
    return customer.id
}

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
            },
        })

        return { url: session.url }
    } catch (err: any) {
        console.error('Stripe error:', err)
        return { error: err.message }
    }
}
