import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Create admin client for database updates (bypasses RLS)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

export async function POST(request: Request) {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
        return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    let event: Stripe.Event

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        )
    } catch (err) {
        console.error('Webhook signature verification failed:', err)
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session

        const userId = session.metadata?.userId
        const creditAmount = parseInt(session.metadata?.creditAmount || '0', 10)

        if (!userId || creditAmount <= 0) {
            console.error('Missing metadata:', { userId, creditAmount })
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
        }

        console.log(`Processing credit purchase: ${creditAmount} credits for user ${userId}`)

        try {
            // Get current credits
            const { data: profile, error: fetchError } = await supabaseAdmin
                .from('profiles')
                .select('credits, credits_total')
                .eq('id', userId)
                .single()

            if (fetchError) {
                console.error('Error fetching profile:', fetchError)
                return NextResponse.json({ error: 'User not found' }, { status: 404 })
            }

            const currentCredits = profile?.credits || 0
            const currentTotal = profile?.credits_total || 0

            // Update credits
            const { error: updateError } = await supabaseAdmin
                .from('profiles')
                .update({
                    credits: currentCredits + creditAmount,
                    credits_total: currentTotal + creditAmount,
                })
                .eq('id', userId)

            if (updateError) {
                console.error('Error updating credits:', updateError)
                return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 })
            }

            console.log(`Successfully added ${creditAmount} credits to user ${userId}`)
        } catch (error) {
            console.error('Webhook processing error:', error)
            return NextResponse.json({ error: 'Processing error' }, { status: 500 })
        }
    }

    return NextResponse.json({ received: true })
}
