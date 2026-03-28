import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { Resend } from 'resend'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-11-17.clover' as any,
})
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

    // Extract userId from common paths (might be undefined depending on event type)
    let initialUserId: string | undefined
    if (event.type === 'checkout.session.completed') {
        initialUserId = (event.data.object as any).metadata?.userId
    } else if (event.type === 'invoice.payment_succeeded') {
        initialUserId = (event.data.object as any).subscription_details?.metadata?.userId || 
                        (event.data.object as any).lines?.data?.[0]?.metadata?.userId
        // We'll update this later in the handler when we actually fetch the subscription
    }

    try {
        // Log the incoming event
        const { error: logErr } = await supabaseAdmin
            .from('stripe_webhook_logs')
            .insert({
                stripe_event_id: event.id,
                event_type: event.type,
                user_id: initialUserId || null,
                status: 'pending',
                payload: event as any
            })
        
        if (logErr) {
            console.error(`[Webhook] Failed to log incoming event ${event.id}:`, logErr)
            // Continue processing anyway, don't fail the webhook just because logging failed
        }
    } catch (e) {
        console.error(`[Webhook] Exception logging incoming event ${event.id}:`, e)
    }

    try {
        // 1. Handle One-Time Purchases & First Subscription Payment
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session
            const userId = session.metadata?.userId
            const type = session.metadata?.type
            console.log(`[Webhook] checkout.session.completed | userId=${userId} type=${type}`)

            if (userId) {
                // ... same logic ...
                // Quick update to ensure user_id is set in the log if we didn't have it
                await supabaseAdmin
                    .from('stripe_webhook_logs')
                    .update({ user_id: userId })
                    .eq('stripe_event_id', event.id)

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
                        throw new Error(`Failed to fetch profile: ${fetchErr.message}`)
                    }

                    const currentBalance = Number(profile?.balance_due || 0)
                    const newBalance = Math.max(0, currentBalance - amountPaid)

                    const { error: updateErr } = await supabaseAdmin
                        .from('profiles')
                        .update({ balance_due: newBalance })
                        .eq('id', userId)

                    if (updateErr) {
                        console.error(`[Webhook] Failed to update balance for user ${userId}:`, updateErr)
                        throw new Error(`Failed to update balance: ${updateErr.message}`)
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
                            throw new Error(`Failed to fetch profile: ${fetchErr.message}`)
                        }

                        const oldCredits = profile?.credits || 0
                        const newBalance = oldCredits + creditsToAdd

                        const { error: updateErr } = await supabaseAdmin
                            .from('profiles')
                            .update({ credits: newBalance })
                            .eq('id', userId)

                        if (updateErr) {
                            console.error(`[Webhook] Failed to update credits for user ${userId}:`, updateErr)
                            throw new Error(`Failed to update credits: ${updateErr.message}`)
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

                // Extract subscription ID - handle different Stripe API versions
                const invoiceAny = invoice as any
                let subscriptionId: string | undefined
                
                // Try multiple locations where subscription ID might live
                if (typeof invoiceAny.subscription === 'string') {
                    subscriptionId = invoiceAny.subscription
                } else if (invoiceAny.subscription?.id) {
                    subscriptionId = invoiceAny.subscription.id
                } else if (invoiceAny.parent?.subscription_details?.subscription) {
                    subscriptionId = invoiceAny.parent.subscription_details.subscription
                } else if (invoice.lines?.data?.[0]) {
                    const lineAny = invoice.lines.data[0] as any
                    subscriptionId = lineAny.subscription || lineAny.parent?.subscription_details?.subscription
                }
                
                console.log(`[Webhook] Extracted subscriptionId=${subscriptionId} | invoice.subscription=${JSON.stringify(invoiceAny.subscription)} | invoice.parent=${JSON.stringify(invoiceAny.parent)}`)

                if (!subscriptionId) {
                    console.error(`[Webhook] ❌ Could not find subscription ID in invoice! Keys: ${Object.keys(invoiceAny).join(', ')}`)
                    throw new Error('Could not extract subscription ID from invoice')
                }

                console.log(`[Webhook] Fetching subscription ${subscriptionId} from Stripe...`)
                const subscription = await stripe.subscriptions.retrieve(subscriptionId)

                const userId = subscription.metadata?.userId
                const creditsToAdd = Number(subscription.metadata?.credits || 0)
                console.log(`[Webhook] Subscription metadata | userId=${userId} credits=${creditsToAdd}`)

                if (!userId) {
                    console.error(`[Webhook] ❌ subscription ${subscriptionId} missing userId in metadata!`)
                    throw new Error('Missing userId in subscription metadata')
                }

                if (creditsToAdd <= 0) {
                    console.error(`[Webhook] ❌ subscription ${subscriptionId} has credits=${creditsToAdd} in metadata!`)
                    throw new Error('Missing credits in subscription metadata')
                }

                // Update the log with the correct userId now that we have it
                await supabaseAdmin
                    .from('stripe_webhook_logs')
                    .update({ user_id: userId })
                    .eq('stripe_event_id', event.id)

                const { data: profile, error: fetchErr } = await supabaseAdmin
                    .from('profiles')
                    .select('credits, name, email')
                    .eq('id', userId)
                    .single()

                if (fetchErr) {
                    console.error(`[Webhook] Failed to fetch credits for user ${userId}:`, fetchErr)
                    throw new Error(`Failed to fetch profile: ${fetchErr.message}`)
                }

                const oldCredits = profile?.credits || 0
                const newBalance = oldCredits + creditsToAdd

                const { error: updateErr } = await supabaseAdmin
                    .from('profiles')
                    .update({ credits: newBalance })
                    .eq('id', userId)

                if (updateErr) {
                    console.error(`[Webhook] Failed to update credits for user ${userId}:`, updateErr)
                    throw new Error(`Failed to update credits: ${updateErr.message}`)
                }

                console.log(`[Webhook] ✅ Renewed subscription: Added ${creditsToAdd} credits to user ${userId} | ${oldCredits} → ${newBalance}`)

                // Send renewal confirmation emails (fire-and-forget)
                const amountPaid = (invoice.amount_paid ?? 0) / 100
                notifyRenewalSuccess({
                    studentName: profile?.name || 'Student',
                    studentEmail: profile?.email || null,
                    creditsAdded: creditsToAdd,
                    newTotal: newBalance,
                    amountPaid,
                }).catch(e => {
                    console.error('[Webhook] Failed to send renewal confirmation:', e)
                })
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

        // Mark Webhook log as successful
        await supabaseAdmin
            .from('stripe_webhook_logs')
            .update({ status: 'success' })
            .eq('stripe_event_id', event.id)

        return NextResponse.json({ received: true })
    } catch (err: any) {
        const errMsg = err?.message || String(err)
        const errStack = err?.stack || 'no stack'
        console.error(`[Webhook] ❌ Unhandled error processing ${event.type}:`, errMsg, errStack)

        // Mark Webhook log as error
        await supabaseAdmin
            .from('stripe_webhook_logs')
            .update({ status: 'error', error_message: errMsg })
            .eq('stripe_event_id', event.id)

        // Fire-and-forget email alert to admin
        notifyAdminOfWebhookFailure(event.type, event.id, errMsg).catch(e => {
            console.error('[Webhook] Failed to send failure notification email:', e)
        })

        return NextResponse.json({ 
            error: 'Webhook handler failed', 
            message: errMsg,
            stack: errStack 
        }, { status: 500 })
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

/**
 * Send admin an email when a webhook event fails to process.
 */
async function notifyAdminOfWebhookFailure(eventType: string, eventId: string, errorMessage: string) {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
        console.log('[Webhook] Resend not configured, skipping failure notification')
        return
    }

    const resend = new Resend(resendKey)

    // Lookup admin email
    const { data: admin } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('role', 'admin')
        .limit(1)
        .single()

    if (!admin?.email) {
        console.error('[Webhook] No admin email found for failure notification')
        return
    }

    const stripeEventUrl = `https://dashboard.stripe.com/events/${eventId}`
    const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    })

    try {
        await resend.emails.send({
            from: 'Piano Studio <notifications@updates.musicalbasics.com>',
            to: admin.email,
            subject: `🚨 Webhook Failed: ${eventType}`,
            html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">
                    <h2 style="font-size: 20px; margin: 0 0 16px; color: #dc2626;">
                        🚨 Stripe Webhook Failed
                    </h2>
                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                        <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Event Type:</strong> ${eventType}</p>
                        <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Time:</strong> ${timestamp}</p>
                        <p style="font-size: 15px; color: #555; margin: 0;"><strong>Error:</strong></p>
                        <pre style="background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; font-size: 13px; overflow-x: auto; margin: 8px 0 0 0; color: #dc2626;">${errorMessage}</pre>
                    </div>
                    <p style="font-size: 14px; color: #888; margin: 0 0 16px;">
                        ⚠️ If this was a payment event, credits may not have been applied. Check the student's account.
                    </p>
                    <a href="${stripeEventUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                        View Event in Stripe →
                    </a>
                </div>
            `,
        })
        console.log(`[Webhook] Failure notification sent to ${admin.email} for ${eventType}`)
    } catch (emailErr) {
        console.error('[Webhook] Failed to send failure notification:', emailErr)
    }
}

/**
 * Send confirmation emails when a subscription renewal successfully adds credits.
 * Emails both admin (audit trail) and student (receipt).
 */
async function notifyRenewalSuccess({ studentName, studentEmail, creditsAdded, newTotal, amountPaid }: {
    studentName: string
    studentEmail: string | null
    creditsAdded: number
    newTotal: number
    amountPaid: number
}) {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
        console.log('[Webhook] Resend not configured, skipping renewal confirmation')
        return
    }

    const resend = new Resend(resendKey)
    const date = new Date().toLocaleDateString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'long', day: 'numeric', year: 'numeric'
    })

    // Lookup admin email
    const { data: admin } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('role', 'admin')
        .limit(1)
        .single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'

    // 1. Email to admin (audit trail)
    if (admin?.email) {
        try {
            await resend.emails.send({
                from: 'Piano Studio <notifications@updates.musicalbasics.com>',
                to: admin.email,
                subject: `✅ Subscription Renewed: ${creditsAdded} credits added for ${studentName}`,
                html: `
                    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">
                        <h2 style="font-size: 20px; margin: 0 0 16px; color: #16a34a;">
                            ✅ Subscription Renewal Processed
                        </h2>
                        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                            <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Student:</strong> ${studentName}</p>
                            <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Amount:</strong> $${amountPaid.toFixed(2)}</p>
                            <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Credits Added:</strong> ${creditsAdded}</p>
                            <p style="font-size: 15px; color: #555; margin: 0;"><strong>New Balance:</strong> ${newTotal} credits</p>
                        </div>
                        <p style="font-size: 13px; color: #888;">Date: ${date}</p>
                    </div>
                `,
            })
            console.log(`[Webhook] Admin renewal confirmation sent to ${admin.email}`)
        } catch (e) {
            console.error('[Webhook] Failed to send admin renewal email:', e)
        }
    }

    // 2. Email to student (receipt)
    if (studentEmail) {
        try {
            await resend.emails.send({
                from: 'Piano Studio <notifications@updates.musicalbasics.com>',
                to: studentEmail,
                subject: `Your subscription renewed — ${creditsAdded} credits added!`,
                html: `
                    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">
                        <h2 style="font-size: 20px; margin: 0 0 16px; color: #1a1a1a;">
                            Subscription Renewed 🎹
                        </h2>
                        <p style="font-size: 15px; color: #555; margin: 0 0 16px;">
                            Hi ${studentName}, your subscription has renewed and your credits have been added!
                        </p>
                        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                            <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Amount Charged:</strong> $${amountPaid.toFixed(2)}</p>
                            <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Credits Added:</strong> ${creditsAdded}</p>
                            <p style="font-size: 15px; color: #555; margin: 0;"><strong>Your Credit Balance:</strong> ${newTotal}</p>
                        </div>
                        <a href="${appUrl}/student" style="display: inline-block; background: #111; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                            Book a Lesson →
                        </a>
                        <p style="font-size: 12px; color: #888; margin-top: 24px;">
                            Date: ${date} • This is a receipt for your subscription renewal.
                        </p>
                    </div>
                `,
            })
            console.log(`[Webhook] Student renewal receipt sent to ${studentEmail}`)
        } catch (e) {
            console.error('[Webhook] Failed to send student renewal email:', e)
        }
    }
}
