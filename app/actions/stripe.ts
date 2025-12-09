'use server'

import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

/**
 * Create a Stripe Checkout Session for purchasing credits
 * Uses dynamic pricing based on user's assigned lesson duration
 * @param quantity - 1 for single lesson, 4 for 4-pack
 */
export async function createCheckoutSession(quantity: 1 | 4) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Get user's profile including lesson_duration
    const { data: profile } = await supabase
        .from('profiles')
        .select('email, name, lesson_duration')
        .eq('id', user.id)
        .single()

    const lessonDuration = profile?.lesson_duration || 30

    // Get pricing for this duration
    const { data: pricing } = await supabase
        .from('pricing_tiers')
        .select('single_price, pack_price')
        .eq('duration', lessonDuration)
        .single()

    if (!pricing) {
        return { error: 'Pricing not configured for your lesson duration' }
    }

    // Determine the price based on quantity
    const unitAmount = quantity === 1 ? pricing.single_price : pricing.pack_price / 4
    const totalAmount = quantity === 1 ? pricing.single_price : pricing.pack_price

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
                            name: `Piano Lesson Credit (${lessonDuration} min)`,
                            description: quantity === 1
                                ? `1 x ${lessonDuration}-minute lesson`
                                : `4 x ${lessonDuration}-minute lessons (4-Pack)`,
                        },
                        unit_amount: totalAmount,
                    },
                    quantity: 1, // We show total price as one line item
                },
            ],
            metadata: {
                userId: user.id,
                creditAmount: quantity.toString(),
                duration: lessonDuration.toString(),
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

