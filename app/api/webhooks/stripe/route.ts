import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Use admin client for webhook (no user session available)
const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: Request) {
    const body = await req.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')

    let event: Stripe.Event

    try {
        event = stripe.webhooks.constructEvent(body, signature!, webhookSecret)
    } catch (err) {
        console.error('Webhook signature verification failed:', err)
        return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
    }

    // 1. Handle One-Time Purchases & First Subscription Payment
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const type = session.metadata?.type

        if (userId) {
            // CASE A: Balance Payment
            if (type === 'balance_payment') {
                const amountPaidCents = Number(session.metadata?.amountPaid || 0)
                const amountPaid = amountPaidCents / 100

                // Fetch current balance to subtract carefully
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('balance_due')
                    .eq('id', userId)
                    .single()

                // Reset balance (or subtract if partial payments were allowed, but here we assume full)
                const currentBalance = Number(profile?.balance_due || 0)
                const newBalance = Math.max(0, currentBalance - amountPaid)

                await supabaseAdmin
                    .from('profiles')
                    .update({ balance_due: newBalance })
                    .eq('id', userId)

                console.log(`✅ Balance payment processed for user ${userId}: Paid $${amountPaid}`)
            }
            // CASE B: Standard Credit Purchase
            else {
                const creditsToAdd = Number(session.metadata?.credits || 0)
                if (creditsToAdd > 0) {
                    const { data: profile } = await supabaseAdmin
                        .from('profiles')
                        .select('credits')
                        .eq('id', userId)
                        .single()

                    const newBalance = (profile?.credits || 0) + creditsToAdd

                    await supabaseAdmin
                        .from('profiles')
                        .update({ credits: newBalance })
                        .eq('id', userId)

                    console.log(`✅ Added ${creditsToAdd} credits to user ${userId} (Checkout)`)
                }
            }
        }
    }

    // 2. Handle Recurring Subscription Payments (Months 2, 3, 4...)
    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as Stripe.Invoice

        // We only care about subscription renewals, not the first payment
        // 'subscription_create' is handled by checkout.session.completed above
        if (invoice.billing_reason === 'subscription_cycle') {

            // Fetch the subscription to get the metadata we saved
            const subscriptionId = (invoice as any).subscription as string
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)

            const userId = subscription.metadata?.userId
            const creditsToAdd = Number(subscription.metadata?.credits || 0) // Should be 4

            if (userId && creditsToAdd > 0) {
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('credits')
                    .eq('id', userId)
                    .single()

                const newBalance = (profile?.credits || 0) + creditsToAdd

                await supabaseAdmin
                    .from('profiles')
                    .update({ credits: newBalance })
                    .eq('id', userId)

                console.log(`✅ Renewed subscription: Added ${creditsToAdd} credits to user ${userId}`)
            }
        }
    }

    return NextResponse.json({ received: true })
}
