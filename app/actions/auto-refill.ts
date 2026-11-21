'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { getImpersonationTarget } from '@/app/actions/impersonate'
import { appBaseUrl } from '@/lib/lesson-action-links'
import { autoRefillDeps, offerFor } from '@/lib/auto-refill-server'
import { completeCheckout, turnOffAutoRefill, type AutoRefillOffer, type RefillStatus } from '@/lib/auto-refill'

/**
 * Auto-refill (#1477, lib/auto-refill.ts) for the family portal and admin.
 *
 * A family turns it on from the buy window (startAutoRefill: a Stripe
 * Checkout), sees it and turns it off in Settings, and updates the card there
 * after a decline (which pays the waiting refill straight away). Lionel turns
 * it off for a family from their side panel in admin. An admin preview of a
 * family can look but not start a checkout.
 */

async function me(): Promise<{ userId: string; studentId: string; preview: boolean } | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { studentId } = await getImpersonationTarget()
    return { userId: user.id, studentId: studentId ?? user.id, preview: Boolean(studentId) }
}

/** The buy window: is auto-refill offered to this family, and how. */
export async function getAutoRefillOffer(): Promise<AutoRefillOffer> {
    try {
        const who = await me()
        if (!who) return { show: false, reason: 'signed out' }
        const client = createAdminClient()
        return await offerFor(client, autoRefillDeps(client).stripe, who.studentId, { preview: who.preview })
    } catch (e) {
        console.error('[auto-refill] offer failed:', e instanceof Error ? e.message : e)
        return { show: false, reason: 'error' }
    }
}

/** "Start auto-refill": a Stripe Checkout that saves the card (and buys the first lessons when they are out). */
export async function startAutoRefill(): Promise<{ url?: string; error?: string }> {
    const who = await me()
    if (!who) return { error: 'Please sign in again.' }
    if (who.preview) return { error: 'This is a preview: the family turns auto-refill on themselves.' }
    try {
        const client = createAdminClient()
        const deps = autoRefillDeps(client)
        const { data: profile } = await client.from('profiles').select('role, email, stripe_customer_id').eq('id', who.userId).maybeSingle()
        if (profile?.role !== 'student') return { error: 'Only a student account can turn on auto-refill.' }
        const offer = await offerFor(client, deps.stripe, who.userId)
        if (!offer.show) {
            return { error: offer.on ? 'Auto-refill is already on.' : 'Auto-refill is not available for your plan right now. Message your teacher if you would like it.' }
        }
        const customerId = await deps.stripe.ensureCustomer(who.userId, profile.email ?? '', profile.stripe_customer_id ?? null)
        const appUrl = appBaseUrl()
        const { url } = await deps.stripe.createCheckout({
            mode: offer.mode === 'buy' ? 'payment' : 'setup',
            kind: 'auto_refill_start',
            customerId,
            userId: who.userId,
            credits: offer.credits,
            priceCents: offer.priceCents,
            pointId: offer.pointId,
            endSubscriptionId: offer.mode === 'switch' ? offer.subscriptionId : null,
            refillId: null,
            successUrl: `${appUrl}/student/settings?refill_checkout={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${appUrl}/student?canceled=true`,
        })
        return { url }
    } catch (e) {
        console.error('[auto-refill] start failed:', e instanceof Error ? e.message : e)
        return { error: 'Could not start the checkout. Please try again, or message your teacher.' }
    }
}

export type AutoRefillSettings = {
    plan: {
        status: 'on' | 'off'
        credits: number
        priceCents: number
        cardBrand: string | null
        cardLast4: string | null
        startedAt: string
        stoppedAt: string | null
    } | null
    /** A refill that is waiting: declined (with its next try), or about to be charged. */
    waiting: { status: RefillStatus; attempts: number; nextRetryAt: string | null } | null
    /** Their monthly plan is winding down after a switch: its end. */
    monthlyEndsAt: string | null
    preview: boolean
}

/** Settings: the family's auto-refill, if they have ever turned it on. */
export async function getAutoRefillSettings(): Promise<AutoRefillSettings | null> {
    try {
        const who = await me()
        if (!who) return null
        const client = createAdminClient()
        const deps = autoRefillDeps(client)
        const plan = await deps.store.plan(who.studentId)
        if (!plan) return null
        const open = await deps.store.openRefill(who.studentId)
        let monthlyEndsAt: string | null = null
        if (plan.status === 'on' && plan.ended_subscription_id && plan.stripe_customer_id) {
            try {
                const running = await deps.stripe.runningPlan(plan.stripe_customer_id)
                if (running && running.id === plan.ended_subscription_id && running.ending) monthlyEndsAt = running.periodEnd
            } catch {
                // the date is a nicety; leave it out
            }
        }
        return {
            plan: {
                status: plan.status,
                credits: plan.credits,
                priceCents: plan.price_cents,
                cardBrand: plan.card_brand,
                cardLast4: plan.card_last4,
                startedAt: plan.started_at,
                stoppedAt: plan.stopped_at,
            },
            waiting: open ? { status: open.status, attempts: open.attempts, nextRetryAt: open.next_retry_at } : null,
            monthlyEndsAt,
            preview: who.preview,
        }
    } catch (e) {
        console.error('[auto-refill] settings read failed:', e instanceof Error ? e.message : e)
        return null
    }
}

/** Settings: "Turn off auto-refill". */
export async function turnOffMyAutoRefill(): Promise<{ ok: boolean; message: string }> {
    const who = await me()
    if (!who) return { ok: false, message: 'Please sign in again.' }
    try {
        const res = await turnOffAutoRefill(autoRefillDeps(), who.studentId, who.preview ? 'admin' : 'family')
        revalidatePath('/student/settings')
        if (!res.wasOn) return { ok: true, message: 'Auto-refill was already off.' }
        return {
            ok: true,
            message: res.resumedMonthly
                ? 'Auto-refill is off, and your monthly plan carries on as before.'
                : 'Auto-refill is off. Your card will not be charged when your lessons run out.',
        }
    } catch (e) {
        console.error('[auto-refill] turn off failed:', e instanceof Error ? e.message : e)
        return { ok: false, message: 'Could not turn it off. Please try again, or message your teacher.' }
    }
}

/** Settings: "Update card" (after a decline: "Update my card and pay"). A Checkout that only saves a card. */
export async function updateAutoRefillCard(): Promise<{ url?: string; error?: string }> {
    const who = await me()
    if (!who) return { error: 'Please sign in again.' }
    if (who.preview) return { error: 'This is a preview: the family updates their own card.' }
    try {
        const client = createAdminClient()
        const deps = autoRefillDeps(client)
        const plan = await deps.store.plan(who.userId)
        if (!plan) return { error: 'Auto-refill is not set up.' }
        const { data: profile } = await client.from('profiles').select('email, stripe_customer_id').eq('id', who.userId).maybeSingle()
        const customerId = await deps.stripe.ensureCustomer(who.userId, profile?.email ?? '', plan.stripe_customer_id ?? profile?.stripe_customer_id ?? null)
        const open = await deps.store.openRefill(who.userId)
        const appUrl = appBaseUrl()
        const { url } = await deps.stripe.createCheckout({
            mode: 'setup',
            kind: 'auto_refill_card',
            customerId,
            userId: who.userId,
            credits: plan.credits,
            priceCents: plan.price_cents,
            pointId: plan.pricing_point_id,
            endSubscriptionId: null,
            refillId: open?.id ?? null,
            successUrl: `${appUrl}/student/settings?refill_checkout={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${appUrl}/student/settings`,
        })
        return { url }
    } catch (e) {
        console.error('[auto-refill] card checkout failed:', e instanceof Error ? e.message : e)
        return { error: 'Could not open the card page. Please try again, or message your teacher.' }
    }
}

/**
 * The family is back from Checkout (?refill_checkout=...). Does what the
 * Stripe webhook does, so it works even before the webhook arrives; whichever
 * is second finds it done.
 */
export async function finishAutoRefillCheckout(sessionId: string): Promise<{ ok: boolean; message: string }> {
    const who = await me()
    if (!who) return { ok: false, message: 'Please sign in again.' }
    if (who.preview) return { ok: false, message: 'Preview: nothing was changed.' }
    const id = String(sessionId ?? '')
    if (!/^cs_[A-Za-z0-9_-]{6,1000}$/.test(id)) return { ok: false, message: 'That checkout link is not valid.' }
    try {
        const deps = autoRefillDeps()
        const session = await deps.stripe.getCheckout(id)
        if (session.metadata?.userId !== who.userId) return { ok: false, message: 'That checkout belongs to another account.' }
        if (session.status !== 'complete') return { ok: false, message: 'The checkout was not finished, so nothing changed.' }
        const res = await completeCheckout(deps, session)
        revalidatePath('/student/settings')
        if (session.metadata.type === 'auto_refill_card') {
            if (res.charge === 'paid') return { ok: true, message: 'Thank you! Your new card is saved and your lessons have been added.' }
            if (res.charge === 'declined') return { ok: false, message: 'Your new card is saved, but the payment was declined. Please try another card.' }
            return { ok: true, message: 'Your new card is saved.' }
        }
        return { ok: true, message: 'Auto-refill is on.' }
    } catch (e) {
        console.error('[auto-refill] finish checkout failed:', e instanceof Error ? e.message : e)
        return { ok: false, message: 'We could not confirm the checkout yet. Refresh in a minute; nothing is charged twice.' }
    }
}

// ---------------------------------------------------------------- admin ---

export type AutoRefillAdminView = {
    plan: AutoRefillSettings['plan'] & { stoppedBy: 'family' | 'admin' | null; lastRefillAt: string | null }
    refills: { id: string; kind: 'start' | 'refill'; status: RefillStatus; amountCents: number; attempts: number; createdAt: string; paidAt: string | null; nextRetryAt: string | null; lastError: string | null; note: string | null }[]
}

/** Admin side panel: a family's auto-refill and its last refills (null when they never turned it on). */
export async function getAutoRefillAdmin(studentId: string): Promise<AutoRefillAdminView | null | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    try {
        const client = createAdminClient()
        const plan = await autoRefillDeps(client).store.plan(String(studentId ?? ''))
        if (!plan) return null
        const { data } = await client
            .from('auto_refills')
            .select('id, kind, status, amount_cents, attempts, created_at, paid_at, next_retry_at, last_error, note')
            .eq('student_id', plan.student_id)
            .order('created_at', { ascending: false })
            .limit(6)
        return {
            plan: {
                status: plan.status, credits: plan.credits, priceCents: plan.price_cents, cardBrand: plan.card_brand, cardLast4: plan.card_last4,
                startedAt: plan.started_at, stoppedAt: plan.stopped_at, stoppedBy: plan.stopped_by, lastRefillAt: plan.last_refill_at,
            },
            refills: (data ?? []).map((r: any) => ({
                id: r.id, kind: r.kind, status: r.status, amountCents: r.amount_cents, attempts: r.attempts, createdAt: r.created_at,
                paidAt: r.paid_at, nextRetryAt: r.next_retry_at, lastError: r.last_error, note: r.note,
            })),
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
    }
}

/** Admin: turn a family's auto-refill off. */
export async function adminTurnOffAutoRefill(studentId: string): Promise<{ ok: boolean; message: string }> {
    const denied = await requireAdmin()
    if (denied) return { ok: false, message: denied }
    try {
        const res = await turnOffAutoRefill(autoRefillDeps(), String(studentId ?? ''), 'admin')
        if (!res.wasOn) return { ok: true, message: 'It was already off.' }
        return {
            ok: true,
            message: ['Auto-refill is off.', res.cancelledRefill ? 'The unpaid refill was cancelled.' : '', res.resumedMonthly ? 'Their monthly plan carries on.' : ''].filter(Boolean).join(' '),
        }
    } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
}
