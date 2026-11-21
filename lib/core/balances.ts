import type Stripe from 'stripe'
import type { DbClient } from '@/lib/supabase/admin'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { isoToStudioWallClock, studioWallClockToISO } from '@/lib/studio-timezone'
import { DEFAULT_SORT, paymentFromSubscriptions, sortBalances, type BalanceRow, type LessonWhen, type PaymentInfo } from '@/lib/balances'

/**
 * Loads the admin Balances page (#935, see lib/balances.ts). Server only: the
 * service-role client reads every active student, and Stripe is asked about
 * each family with a card on file, all at once, each with its own time limit
 * so one slow answer cannot hold up the page. Reads only; never changes a thing.
 */

/** Per family; Stripe normally answers in well under a second. */
export const STRIPE_TIMEOUT_MS = 8000

export type StripeReader = {
    listSubscriptions(customerId: string): Promise<Stripe.Subscription[]>
    /** What the next invoice will actually charge (after account credit and discounts). */
    nextInvoiceAmount?(customerId: string, subscriptionId: string): Promise<number | null>
}

export function stripeReader(): StripeReader {
    return {
        async listSubscriptions(customerId) {
            const { stripe } = await import('@/lib/stripe')
            const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })
            return subs.data
        },
        async nextInvoiceAmount(customerId, subscriptionId) {
            const { stripe } = await import('@/lib/stripe')
            // A preview only: Stripe creates nothing.
            const preview = await stripe.invoices.createPreview({ customer: customerId, subscription: subscriptionId })
            return typeof preview.amount_due === 'number' ? preview.amount_due : null
        },
    }
}

export function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)}s`)), ms)
    })
    return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

/** Families with auto-refill on, and whether a refill is declined. Never throws: the page works without it. */
async function autoRefillStates(client: DbClient, ids: string[]): Promise<Map<string, PaymentInfo>> {
    const out = new Map<string, PaymentInfo>()
    try {
        const { data: plans, error } = await client.from('auto_refill_plans').select('student_id, credits, price_cents').eq('status', 'on').in('student_id', ids)
        if (error || !plans?.length) return out
        const { data: failed } = await client.from('auto_refills').select('student_id').eq('status', 'failed').in('student_id', ids)
        const declined = new Set((failed ?? []).map((r: any) => r.student_id as string))
        for (const p of plans as any[]) {
            out.set(p.student_id, { kind: 'auto_refill', credits: Number(p.credits), priceCents: Number(p.price_cents), declined: declined.has(p.student_id) })
        }
    } catch (e) {
        console.error('[loadBalances] auto-refill read failed:', e instanceof Error ? e.message : e)
    }
    return out
}

async function paymentFor(customerId: string, reader: StripeReader): Promise<PaymentInfo> {
    const info = paymentFromSubscriptions(await reader.listSubscriptions(customerId))
    if (info.kind !== 'autopay' || !reader.nextInvoiceAmount) return info
    try {
        const due = await reader.nextInvoiceAmount(customerId, info.subscriptionId)
        return due == null ? info : { ...info, amountCents: due }
    } catch {
        // The plan price still says roughly what is coming.
        return info
    }
}

type ProfileRow = { id: string; name: string | null; credits: number | null; stripe_customer_id: string | null }
type LessonRow = { student_id: string; date: string; time: string }

async function pagedLessons(client: DbClient, ids: string[], build: (q: any) => any): Promise<LessonRow[]> {
    const rows: LessonRow[] = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await build(client.from('lessons').select('student_id, date, time').in('student_id', ids)).range(from, from + 999)
        if (error) throw new Error(`lessons query failed: ${error.message}`)
        rows.push(...((data ?? []) as LessonRow[]))
        if (!data || data.length < 1000) return rows
    }
}

export async function loadBalances(
    client: DbClient,
    { reader = stripeReader(), now = new Date(), timeoutMs = STRIPE_TIMEOUT_MS }: { reader?: StripeReader; now?: Date; timeoutMs?: number } = {},
): Promise<BalanceRow[]> {
    const { data: profiles, error } = await client
        .from('profiles')
        .select('id, name, credits, stripe_customer_id')
        .eq('role', 'student')
        .eq('status', 'active')
    if (error) throw new Error(`profiles query failed: ${error.message}`)
    // The two teacher accounts (about 998 credits) are not tracked (#734).
    const students = ((profiles ?? []) as ProfileRow[]).filter(p => !isUntrackedTeacherAccount(p))
    if (students.length === 0) return []
    const ids = students.map(s => s.id)

    // Latest completed lesson per student (rows come newest first).
    const completed = await pagedLessons(client, ids, q => q.eq('status', 'completed').order('date', { ascending: false }).order('time', { ascending: false }))
    const last = new Map<string, LessonWhen>()
    for (const l of completed) if (!last.has(l.student_id)) last.set(l.student_id, { date: l.date, time: String(l.time).slice(0, 5) })

    // Next scheduled lesson that has not started yet (today's earlier ones are past, logged or not).
    const today = isoToStudioWallClock(now.toISOString()).localDate
    const upcoming = await pagedLessons(client, ids, q => q.eq('status', 'scheduled').gte('date', today).order('date', { ascending: true }).order('time', { ascending: true }))
    const next = new Map<string, LessonWhen>()
    for (const l of upcoming) {
        if (next.has(l.student_id)) continue
        const time = String(l.time).slice(0, 5)
        if (Date.parse(studioWallClockToISO(l.date, time)) >= now.getTime()) next.set(l.student_id, { date: l.date, time })
    }

    // Stripe, every family at once, each with its own time limit.
    const payments = await Promise.all(students.map(async (s): Promise<PaymentInfo> => {
        if (!s.stripe_customer_id) return { kind: 'none' }
        try {
            return await withTimeout(paymentFor(s.stripe_customer_id, reader), timeoutMs, 'Stripe')
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            console.error('[loadBalances] Stripe lookup failed for a family:', message)
            return { kind: 'unknown', error: message }
        }
    }))

    // Auto-refill (#1477) is in the portal's own tables, not a Stripe plan.
    const refill = await autoRefillStates(client, ids)
    const rows: BalanceRow[] = students.map((s, i) => ({
        studentId: s.id,
        name: s.name || 'Unnamed student',
        credits: Number(s.credits) || 0,
        lastLesson: last.get(s.id) ?? null,
        nextLesson: next.get(s.id) ?? null,
        payment: refill.has(s.id) && payments[i].kind !== 'autopay' ? refill.get(s.id)! : payments[i],
    }))
    return sortBalances(rows, DEFAULT_SORT.key, DEFAULT_SORT.dir)
}
