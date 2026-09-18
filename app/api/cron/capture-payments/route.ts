import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { cronSource, writeHeartbeat } from '@/lib/cron-alerts'
import { stripe } from '@/lib/stripe'
import { CAPTURE_JOB, sendCaptureAlert } from '@/lib/payment-capture-alerts'

export const dynamic = 'force-dynamic'

/**
 * Auto-capture held card payments after a review window.
 *
 * One-time purchases and balance payments check out with
 * `capture_method: 'manual'`, so the card is only authorized and the studio
 * gets a "needs capture" email. Credits are granted at checkout regardless.
 * Capturing by hand was easy to forget, and an authorization Stripe hasn't
 * captured within 7 days silently expires, so the family keeps the credits
 * and the studio never gets paid.
 *
 * This captures anything still held once it is CAPTURE_AFTER_DAYS old. To stop
 * a charge, cancel the payment in the Stripe dashboard before then: a
 * cancelled PaymentIntent is no longer `requires_capture`, so it is skipped.
 */
const CAPTURE_AFTER_DAYS = 3
/** Stripe card authorizations expire after 7 days; nothing older is capturable. */
const LOOKBACK_DAYS = 8

const FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'
const FALLBACK_TO = 'support@musicalbasics.com'

type Outcome = { id: string; amount: number; studentName: string; error?: string }

/**
 * Only capture payments this app created. PIs from newer checkouts carry
 * userId in their own metadata; older ones only have it on the Checkout
 * Session, so fall back to looking that up.
 */
async function resolveUserId(pi: Stripe.PaymentIntent): Promise<string | null> {
    if (pi.metadata?.userId) return pi.metadata.userId
    const sessions = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 1 })
    return sessions.data[0]?.metadata?.userId || null
}

export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = createAdminClient()
    try {
        return await run(request, client)
    } catch (e) {
        // Whole run died (Stripe unreachable, bad key, ...): nothing got captured.
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[Cron/capture-payments] Run failed:', e)
        await sendCaptureAlert(client, '🚨 Payment auto-capture cron failed', [
            `Error: <code>${msg}</code>`,
            'No held payments were captured on this run. It retries hourly, but check Stripe if this repeats.',
        ])
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

async function run(request: Request, client: ReturnType<typeof createAdminClient>) {
    const nowSec = Math.floor(Date.now() / 1000)
    const cutoff = nowSec - CAPTURE_AFTER_DAYS * 86400

    const recent = await stripe.paymentIntents
        .list({ created: { gte: nowSec - LOOKBACK_DAYS * 86400, lte: cutoff }, limit: 100 })
        .autoPagingToArray({ limit: 1000 })
    const held = recent.filter(pi => pi.status === 'requires_capture')

    const captured: Outcome[] = []
    const failed: Outcome[] = []

    for (const pi of held) {
        const userId = await resolveUserId(pi)
        if (!userId) {
            console.log(`[Cron/capture-payments] Skipping ${pi.id}: not created by the studio app`)
            continue
        }

        const { data: profile } = await client.from('profiles').select('name').eq('id', userId).maybeSingle()
        const outcome: Outcome = {
            id: pi.id,
            amount: pi.amount_capturable / 100,
            studentName: profile?.name || 'Unknown student',
        }

        try {
            // Idempotency key so an overlapping run can't double-capture.
            await stripe.paymentIntents.capture(pi.id, {}, { idempotencyKey: `auto-capture-${pi.id}` })
            captured.push(outcome)
            console.log(`[Cron/capture-payments] ✅ Captured ${pi.id} $${outcome.amount.toFixed(2)} (${outcome.studentName})`)
        } catch (e) {
            outcome.error = e instanceof Error ? e.message : String(e)
            failed.push(outcome)
            console.error(`[Cron/capture-payments] ❌ Capture failed for ${pi.id}:`, outcome.error)
        }
    }

    if (captured.length) {
        await notifyStudio(client, captured).catch(e => {
            console.error('[Cron/capture-payments] Summary email failed:', e)
        })
    }
    if (failed.length) {
        await sendCaptureAlert(client, `⚠️ ${failed.length} payment capture${failed.length === 1 ? '' : 's'} failed`, [
            ...failed.map(row),
            'These are still held and will be retried hourly until the authorization expires (7 days after checkout).',
        ])
    }

    await writeHeartbeat(client, CAPTURE_JOB, { source: cronSource(request) })

    return NextResponse.json({ held: held.length, captured: captured.length, failed: failed.length })
}

const row = (o: Outcome) =>
    `${o.studentName}: $${o.amount.toFixed(2)} (<a href="https://dashboard.stripe.com/payments/${o.id}">${o.id}</a>)${o.error ? ` - ${o.error}` : ''}`

async function notifyStudio(client: ReturnType<typeof createAdminClient>, captured: Outcome[]) {
    if (!process.env.RESEND_API_KEY) return
    const { data: admin } = await client.from('profiles').select('email').eq('role', 'admin').limit(1).maybeSingle()
    const to = admin?.email || FALLBACK_TO

    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
        from: FROM,
        to,
        subject: `💰 Auto-captured ${captured.length} payment${captured.length === 1 ? '' : 's'}`,
        html: `<p><strong>Captured after ${CAPTURE_AFTER_DAYS} days:</strong></p><ul>${captured.map(o => `<li>${row(o)}</li>`).join('')}</ul>`,
    })
}
