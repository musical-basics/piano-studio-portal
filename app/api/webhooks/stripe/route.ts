import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { Resend } from 'resend'

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

    try {
        // 1. Handle One-Time Purchases & First Subscription Payment
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session
            const userId = session.metadata?.userId
            const type = session.metadata?.type
            console.log(`[Webhook] checkout.session.completed | userId=${userId} type=${type}`)

            if (userId) {
                // Fallback: Save stripe_customer_id if not already saved
                const stripeCustomerId = session.customer as string | null
                if (stripeCustomerId) {
                    const { data: existingProfile, error: profileErr } = await supabaseAdmin
                        .from('profiles')
                        .select('stripe_customer_id')
                        .eq('id', userId)
                        .single()

                    if (profileErr) {
                        console.error(`[Webhook] Failed to fetch profile for stripe_customer_id save:`, profileErr)
                    }

                    if (existingProfile && !existingProfile.stripe_customer_id) {
                        const { error: updateErr } = await supabaseAdmin
                            .from('profiles')
                            .update({ stripe_customer_id: stripeCustomerId })
                            .eq('id', userId)
                        if (updateErr) {
                            console.error(`[Webhook] Failed to save stripe_customer_id:`, updateErr)
                        } else {
                            console.log(`[Webhook] Saved Stripe Customer ID ${stripeCustomerId} for user ${userId}`)
                        }
                    }
                }

                // CASE A: Balance Payment
                if (type === 'balance_payment') {
                    const amountPaidCents = Number(session.metadata?.amountPaid || 0)
                    const amountPaid = amountPaidCents / 100

                    const { data: profile, error: fetchErr } = await supabaseAdmin
                        .from('profiles')
                        .select('balance_due')
                        .eq('id', userId)
                        .single()

                    if (fetchErr) {
                        console.error(`[Webhook] Failed to fetch balance for user ${userId}:`, fetchErr)
                        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
                    }

                    const currentBalance = Number(profile?.balance_due || 0)
                    const newBalance = Math.max(0, currentBalance - amountPaid)

                    const { error: updateErr } = await supabaseAdmin
                        .from('profiles')
                        .update({ balance_due: newBalance })
                        .eq('id', userId)

                    if (updateErr) {
                        console.error(`[Webhook] Failed to update balance for user ${userId}:`, updateErr)
                        return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 })
                    }

                    console.log(`[Webhook] ✅ Balance payment processed for user ${userId}: Paid $${amountPaid} | ${currentBalance} → ${newBalance}`)
                }
                // CASE B: Standard Credit Purchase
                else {
                    const creditsToAdd = Number(session.metadata?.credits || 0)
                    console.log(`[Webhook] Credit purchase | userId=${userId} creditsToAdd=${creditsToAdd}`)

                    if (creditsToAdd > 0) {
                        const { data: profile, error: fetchErr } = await supabaseAdmin
                            .from('profiles')
                            .select('credits')
                            .eq('id', userId)
                            .single()

                        if (fetchErr) {
                            console.error(`[Webhook] Failed to fetch credits for user ${userId}:`, fetchErr)
                            return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
                        }

                        const oldCredits = profile?.credits || 0
                        const newBalance = oldCredits + creditsToAdd

                        const { error: updateErr } = await supabaseAdmin
                            .from('profiles')
                            .update({ credits: newBalance })
                            .eq('id', userId)

                        if (updateErr) {
                            console.error(`[Webhook] Failed to update credits for user ${userId}:`, updateErr)
                            return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 })
                        }

                        console.log(`[Webhook] ✅ Added ${creditsToAdd} credits to user ${userId} (Checkout) | ${oldCredits} → ${newBalance}`)
                    }
                }
            } else {
                console.warn(`[Webhook] checkout.session.completed missing userId in metadata`)
            }
        }

        // 2. Handle Recurring Subscription Payments (Months 2, 3, 4...)
        if (event.type === 'invoice.payment_succeeded') {
            const invoice = event.data.object as Stripe.Invoice
            console.log(`[Webhook] invoice.payment_succeeded | billing_reason=${invoice.billing_reason} subscription=${(invoice as any).subscription}`)

            // We only care about subscription renewals, not the first payment
            // 'subscription_create' is handled by checkout.session.completed above
            if (invoice.billing_reason === 'subscription_cycle') {

                // Fetch the subscription to get the metadata we saved
                const subscriptionId = (invoice as any).subscription as string
                console.log(`[Webhook] Fetching subscription ${subscriptionId} from Stripe...`)
                const subscription = await stripe.subscriptions.retrieve(subscriptionId)

                const userId = subscription.metadata?.userId
                const creditsToAdd = Number(subscription.metadata?.credits || 0)
                console.log(`[Webhook] Subscription metadata | userId=${userId} credits=${creditsToAdd}`)

                if (!userId) {
                    console.error(`[Webhook] ❌ subscription ${subscriptionId} missing userId in metadata!`)
                    return NextResponse.json({ error: 'Missing userId in subscription metadata' }, { status: 500 })
                }

                if (creditsToAdd <= 0) {
                    console.error(`[Webhook] ❌ subscription ${subscriptionId} has credits=${creditsToAdd} in metadata!`)
                    return NextResponse.json({ error: 'Missing credits in subscription metadata' }, { status: 500 })
                }

                const { data: profile, error: fetchErr } = await supabaseAdmin
                    .from('profiles')
                    .select('credits')
                    .eq('id', userId)
                    .single()

                if (fetchErr) {
                    console.error(`[Webhook] Failed to fetch credits for user ${userId}:`, fetchErr)
                    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
                }

                const oldCredits = profile?.credits || 0
                const newBalance = oldCredits + creditsToAdd

                const { error: updateErr } = await supabaseAdmin
                    .from('profiles')
                    .update({ credits: newBalance })
                    .eq('id', userId)

                if (updateErr) {
                    console.error(`[Webhook] Failed to update credits for user ${userId}:`, updateErr)
                    return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 })
                }

                console.log(`[Webhook] ✅ Renewed subscription: Added ${creditsToAdd} credits to user ${userId} | ${oldCredits} → ${newBalance}`)
            }
        }

        // 3. Handle Payment Ready for Manual Capture
        if (event.type === 'payment_intent.amount_capturable_updated') {
            const paymentIntent = event.data.object as Stripe.PaymentIntent
            console.log(`[Webhook] Payment ${paymentIntent.id} ready for capture: $${(paymentIntent.amount / 100).toFixed(2)}`)

            // Fire-and-forget notification email
            notifyAdminOfPendingCapture(paymentIntent).catch(err => {
                console.error('[Webhook] Failed to notify admin:', err)
            })
        }

        return NextResponse.json({ received: true })
    } catch (err) {
        console.error(`[Webhook] ❌ Unhandled error processing ${event.type}:`, err)
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
    }
}

/**
 * Send admin an email when a payment needs manual capture.
 * Called when payment_intent status is requires_capture.
 */
async function notifyAdminOfPendingCapture(paymentIntent: Stripe.PaymentIntent) {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
        console.log('[Webhook] Resend not configured, skipping capture notification')
        return
    }

    const resend = new Resend(resendKey)
    const amount = (paymentIntent.amount / 100).toFixed(2)
    const userId = paymentIntent.metadata?.userId
    const type = paymentIntent.metadata?.type || 'one-time'

    // Lookup student name
    let studentName = 'Unknown Student'
    if (userId) {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('name, email')
            .eq('id', userId)
            .single()
        if (profile?.name) studentName = profile.name
    }

    // Lookup admin email
    const { data: admin } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('role', 'admin')
        .limit(1)
        .single()

    if (!admin?.email) {
        console.error('[Webhook] No admin email found for capture notification')
        return
    }

    const stripePaymentUrl = `https://dashboard.stripe.com/payments/${paymentIntent.id}`
    const captureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const deadlineStr = captureDeadline.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })

    try {
        await resend.emails.send({
            from: 'Piano Studio <notifications@updates.musicalbasics.com>',
            to: admin.email,
            subject: `💰 Payment Needs Capture: $${amount} from ${studentName}`,
            html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">
                    <h2 style="font-size: 20px; margin: 0 0 16px; color: #1a1a1a;">
                        💰 New Payment Requires Capture
                    </h2>
                    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                        <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Student:</strong> ${studentName}</p>
                        <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Amount:</strong> $${amount}</p>
                        <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Type:</strong> ${type === 'balance_payment' ? 'Balance Payment' : 'Credit Purchase'}</p>
                        <p style="font-size: 15px; color: #555; margin: 0;"><strong>Capture by:</strong> ${deadlineStr}</p>
                    </div>
                    <p style="font-size: 14px; color: #888; margin: 0 0 16px;">
                        ⚠️ This payment will <strong>expire</strong> if not captured within 7 days.
                    </p>
                    <a href="${stripePaymentUrl}" style="display: inline-block; background: #635bff; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                        Review & Capture in Stripe →
                    </a>
                </div>
            `,
        })
        console.log(`[Webhook] Capture notification sent to ${admin.email} for $${amount} from ${studentName}`)
    } catch (err) {
        console.error('[Webhook] Failed to send capture notification:', err)
    }
}
