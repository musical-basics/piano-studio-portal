'use server'

import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

/**
 * Create a Stripe Checkout Session
 * Handles both One-Time Packs and Monthly Subscriptions
 */
export async function createCheckoutSession(
    purchaseType: 'single' | 'pack' | 'subscription',
    lessonDuration?: number
) {
    const supabase = await createClient()

    // 1. Authenticate User
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // 2. Get User's Lesson Duration from DB (Security Best Practice)
    const { data: profile } = await supabase
        .from('profiles')
        .select('email, name, lesson_duration')
        .eq('id', user.id)
        .single()

    const duration = lessonDuration || profile?.lesson_duration || 30
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    try {
        let sessionParams: Stripe.Checkout.SessionCreateParams;

        // ==========================================
        // PATH A: SUBSCRIPTION (Autopay)
        // ==========================================
        if (purchaseType === 'subscription') {
            // Select the correct Price ID based on duration
            let priceId = '';
            if (duration === 30) priceId = process.env.STRIPE_SUB_PRICE_30!;
            else if (duration === 45) priceId = process.env.STRIPE_SUB_PRICE_45!;
            else if (duration === 60) priceId = process.env.STRIPE_SUB_PRICE_60!;

            if (!priceId) {
                return { error: `Subscription configuration missing for ${duration} min lessons` }
            }

            sessionParams = {
                mode: 'subscription',
                payment_method_types: ['card'],
                customer_email: profile?.email || undefined,
                line_items: [
                    {
                        price: priceId, // Must use Price ID for subscriptions
                        quantity: 1,
                    },
                ],
                // Attach metadata to the Subscription so it persists on every recurring invoice
                subscription_data: {
                    metadata: {
                        userId: user.id,
                        credits: '4' // The recurring amount
                    }
                },
                metadata: {
                    userId: user.id,
                    credits: '4', // Subscriptions add 4 credits per cycle
                    type: 'subscription',
                    duration: duration.toString()
                },
                success_url: `${appUrl}/student?success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${appUrl}/student?canceled=true`,
            }
        }

        // ==========================================
        // PATH B: ONE-TIME PURCHASE (Single/Pack)
        // ==========================================
        else {
            // Get pricing from DB for one-time calculations
            const { data: pricing } = await supabase
                .from('pricing_tiers')
                .select('single_price, pack_price')
                .eq('duration', duration)
                .single()

            if (!pricing) {
                return { error: 'Pricing not configured for your lesson duration' }
            }

            const quantity = purchaseType === 'single' ? 1 : 4
            const totalAmount = purchaseType === 'single' ? pricing.single_price : pricing.pack_price
            const description = purchaseType === 'single'
                ? `1 x ${duration}-minute lesson`
                : `4 x ${duration}-minute lessons (4-Pack)`

            sessionParams = {
                mode: 'payment',
                payment_method_types: ['card'],
                customer_email: profile?.email || undefined,
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: `Piano Lesson Credit (${duration} min)`,
                                description: description,
                            },
                            unit_amount: totalAmount,
                        },
                        quantity: 1, // We treat the whole pack as 1 "item" with a custom price
                    },
                ],
                metadata: {
                    userId: user.id,
                    credits: quantity.toString(),
                    type: 'one-time',
                    duration: duration.toString()
                },
                success_url: `${appUrl}/student?success=true`,
                cancel_url: `${appUrl}/student?canceled=true`,
            }
        }

        // 3. Create Session
        const session = await stripe.checkout.sessions.create(sessionParams)
        return { url: session.url }

    } catch (error) {
        console.error('Stripe checkout error:', error)
        return { error: 'Failed to create checkout session' }
    }
}
