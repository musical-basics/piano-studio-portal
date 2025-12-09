'use server'

import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

/**
 * Create a Stripe Checkout Session for purchasing credits
 */
export async function createCheckoutSession(quantity: number) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Get user's email for prefilling checkout
    const { data: profile } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('id', user.id)
        .single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: profile?.email || undefined,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Piano Lesson Credit',
                            description: '1 credit = 1 piano lesson',
                        },
                        unit_amount: 5000, // $50.00 in cents
                    },
                    quantity,
                },
            ],
            metadata: {
                userId: user.id,
                creditAmount: quantity.toString(),
            },
            success_url: `${appUrl}/student?success=true`,
            cancel_url: `${appUrl}/student?canceled=true`,
        })

        return { url: session.url }
    } catch (error) {
        console.error('Stripe checkout error:', error)
        return { error: 'Failed to create checkout session' }
    }
}
