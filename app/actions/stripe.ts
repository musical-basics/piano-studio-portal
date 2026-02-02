'use server'

import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

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

    try {
        let sessionParams: Stripe.Checkout.SessionCreateParams;

        if (point.type === 'subscription') {
            if (!point.stripe_price_id) {
                return { error: 'System Error: Subscription Price ID missing.' }
            }

            sessionParams = {
                mode: 'subscription',
                payment_method_types: ['card'],
                customer_email: profile?.email || undefined,
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
                customer_email: profile?.email || undefined,
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
            }
        }

        const session = await stripe.checkout.sessions.create(sessionParams)
        return { url: session.url }

    } catch (err: any) {
        console.error('Stripe error:', err)
        return { error: err.message }
    }
}
