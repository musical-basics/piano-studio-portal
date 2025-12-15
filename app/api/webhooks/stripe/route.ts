import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import React from 'react'

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

// Simple in-memory cache to prevent duplicate processing
// In production, use Redis or database for this
const processedEvents = new Set<string>()

export async function GET() {
    return NextResponse.json({ status: 'healthy', message: 'Stripe webhook endpoint is active' })
}

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

    // Idempotency check - prevent duplicate processing
    if (processedEvents.has(event.id)) {
        console.log(`Event ${event.id} already processed, skipping`)
        return NextResponse.json({ received: true, duplicate: true })
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session

        // Also check by session ID for extra safety
        if (processedEvents.has(session.id)) {
            console.log(`Session ${session.id} already processed, skipping`)
            return NextResponse.json({ received: true, duplicate: true })
        }

        const userId = session.metadata?.userId
        const creditAmount = parseInt(session.metadata?.creditAmount || '0', 10)

        if (!userId || creditAmount <= 0) {
            console.error('Missing metadata:', { userId, creditAmount })
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
        }

        console.log(`Processing credit purchase: ${creditAmount} credits for user ${userId} (session: ${session.id})`)

        try {
            // Get current credits
            const { data: profile, error: fetchError } = await supabaseAdmin
                .from('profiles')
                .select('credits, credits_total, email')
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

            // Mark as processed AFTER successful update
            processedEvents.add(event.id)
            processedEvents.add(session.id)

            console.log(`Successfully added ${creditAmount} credits to user ${userId}`)

            // Log to Auth Audit Logs (Payment Success)
            try {
                await supabaseAdmin
                    .from('auth_audit_logs')
                    .insert({
                        user_email: profile?.email || 'unknown',
                        event_type: 'payment_success',
                        status: 'success',
                        details: `Purchased ${creditAmount} credits ($${(session.amount_total || 0) / 100})`
                    })
            } catch (logError) {
                console.error('Failed to log payment success:', logError)
            }

            // Send Confirmation Email
            if (process.env.RESEND_API_KEY && profile?.email) {
                try {
                    const { Resend } = await import('resend')
                    const { PaymentConfirmationEmail } = await import('@/components/emails/payment-confirmation-email')
                    const resend = new Resend(process.env.RESEND_API_KEY)

                    const { data: emailData, error: emailError } = await resend.emails.send({
                        from: 'Lionel Yu Piano Studio <support@musicalbasics.com>',
                        to: profile.email,
                        subject: 'Payment Confirmation - Credits Added',
                        react: PaymentConfirmationEmail({
                            amount: (session.amount_total || 0) / 100,
                            credits: creditAmount,
                            date: new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })
                        }) as React.ReactElement
                    })

                    if (emailError) {
                        console.error('Failed to send confirmation email:', emailError)
                    } else {
                        console.log('Confirmation email sent:', emailData?.id)
                    }
                } catch (emailExc) {
                    console.error('Error initiating email sending:', emailExc)
                }
            }

        } catch (error) {
            console.error('Webhook processing error:', error)
            return NextResponse.json({ error: 'Processing error' }, { status: 500 })
        }
    }

    return NextResponse.json({ received: true })
}

