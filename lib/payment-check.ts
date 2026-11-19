import type Stripe from 'stripe'
import type { DbClient } from '@/lib/supabase/admin'
import { STUDIO_TZ, studioWallClockToISO } from '@/lib/studio-timezone'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'

/**
 * Payments vs lessons added (#757), part of the credit check on the 1st: every
 * Stripe payment last month lined up with the lessons added to that family, so
 * a payment that never added its lessons, or lessons added with no payment and
 * no reason, gets noticed. Read-only: it changes nothing in Stripe or the portal.
 *
 * How lessons get added (checked against Stripe and credit_transactions, Jun-Nov 2026):
 *   - Monthly plan: the first payment's Checkout adds the plan's lessons
 *     (session metadata.credits), each renewal invoice adds them again
 *     (subscription metadata.credits), seconds after the invoice is paid.
 *     A renewal that used Account Credit still adds the full 4 lessons.
 *   - Package (one-time Checkout): lessons are added when the checkout
 *     completes. The card is only held then and captured 3 days later, so the
 *     charge time is the checkout time, not the capture time.
 *   - Balance payments (fees) and the dollar Account Credit (the Stripe
 *     customer balance) never touch lessons and are left out.
 *   - A Stripe customer belongs to the student named in the payment's own
 *     metadata (userId, which the webhook uses), else to the profile with that
 *     stripe_customer_id. Some families' customers are not on their profile.
 *   - Lessons added with no payment that are fine: anything labelled with a
 *     source or note (free trial, test cleanup, late charge, notes like "credit
 *     not charged"), and a credit given back right after one was taken (Oct
 *     2026: -1 then +1 a day later; Nov 2026: the same within 20 minutes).
 *
 * Rules:
 *   - A plan or package payment must have an addition of its lessons for that
 *     student within MATCH_WINDOW (either side). None: payment_without_lessons.
 *     A different number: wrong_lessons.
 *   - An addition with no payment near it, no source or note, and not giving
 *     back a credit taken just before: lessons_without_payment.
 *   - Any other Stripe payment for the family (a manual invoice, a charge made
 *     in the Stripe dashboard) explains a nearby addition, but is never flagged
 *     for adding none: it may have been for something else.
 *   - Failed payment attempts and unpaid invoices are not payments: left out.
 *   - A fully refunded payment (or a held card payment cancelled before
 *     capture) expects no lessons. If lessons were added for it and not taken
 *     back: refunded_lessons_kept. A partial refund counts as paid.
 *   - Teacher accounts are left out (#734, isUntrackedTeacherAccount).
 */

export type PaymentKind = 'plan' | 'package' | 'other'

export type StudioPayment = {
    /** Invoice, Checkout Session or charge id. */
    id: string
    studentId: string
    kind: PaymentKind
    /** Lessons the payment should add (from its plan or package); null when unknown. */
    lessons: number | null
    amountCents: number
    /** Fully refunded, or a held card payment cancelled before capture. */
    refunded: boolean
    atMs: number
}

export type LedgerChange = {
    id: string
    studentId: string
    prev: number
    next: number
    delta: number
    source: string | null
    note: string | null
    atMs: number
}

export type PaymentFindingKind = 'payment_without_lessons' | 'wrong_lessons' | 'lessons_without_payment' | 'refunded_lessons_kept'

export type PaymentFinding = {
    kind: PaymentFindingKind
    studentId: string
    studentName: string
    atMs: number
    /** Plain text, no name: what doesn't match. */
    detail: string
}

export type PaymentCheckReport = {
    month: string
    /** Plan and package payments that month (not refunded). */
    payments: number
    paidCents: number
    /** Positive changes to lessons that month, and how many lessons they added. */
    additions: number
    lessonsAdded: number
    /** Additions explained by a plan or package payment. */
    paidFor: number
    /** Additions explained by another Stripe payment for the family. */
    otherPaid: number
    labelled: number
    givenBack: number
    findings: PaymentFinding[]
    /** Set when Stripe or the database could not be read: nothing was checked. */
    error?: string
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Lessons added this close to a payment (before or after) belong to it. */
export const MATCH_WINDOW = 2 * DAY
/** A credit given back this soon after the same credit was taken is a reversal. */
const GIVE_BACK_WINDOW = 3 * DAY
/** How long after a refund the lessons it added may still be taken back. */
const TAKE_BACK_WINDOW = 31 * DAY

function nextMonthStart(month: string): string {
    const d = new Date(`${month}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + 1)
    return d.toISOString().slice(0, 10)
}

function monthBounds(month: string): { startMs: number; endMs: number } {
    return {
        startMs: Date.parse(studioWallClockToISO(`${month}-01`, '00:00')),
        endMs: Date.parse(studioWallClockToISO(nextMonthStart(month), '00:00')),
    }
}

/** "Oct 8" in studio time. */
function day(ms: number): string {
    return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: STUDIO_TZ })
}

/** "Oct 8 9:50pm" in studio time. */
function when(ms: number): string {
    const clock = new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: STUDIO_TZ }).replace(' ', '').toLowerCase()
    return `${day(ms)} ${clock}`
}

function dollars(cents: number): string {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function lessonsWord(n: number): string {
    return `${n} lesson${Math.abs(n) === 1 ? '' : 's'}`
}

function what(p: StudioPayment): string {
    const plan = p.kind === 'plan' ? 'monthly plan' : 'package'
    return p.lessons === null ? plan : `${plan}, ${lessonsWord(p.lessons)}`
}

const labelled = (r: LedgerChange) => Boolean(r.source || r.note)

/** The change closest in time to `atMs`. */
function nearest(rows: LedgerChange[], atMs: number): LedgerChange | undefined {
    let best: LedgerChange | undefined
    for (const r of rows) {
        if (!best || Math.abs(r.atMs - atMs) < Math.abs(best.atMs - atMs)) best = r
    }
    return best
}

/**
 * Pure matching of one month's payments to lessons added. `payments` and
 * `ledger` may run past the month on both sides (a payment on the 31st whose
 * lessons land on the 1st); only payments and additions inside the month are
 * reported.
 */
export function reconcilePayments(
    month: string,
    payments: StudioPayment[],
    ledger: LedgerChange[],
    names: Map<string, string>,
): PaymentCheckReport {
    const { startMs, endMs } = monthBounds(month)
    const inMonth = (ms: number) => ms >= startMs && ms < endMs
    const name = (id: string) => names.get(id) || 'Unknown student'

    const byTime = <T extends { atMs: number }>(rows: T[]) => [...rows].sort((a, b) => a.atMs - b.atMs)
    const additions = byTime(ledger.filter(r => r.delta > 0))
    const deductions = byTime(ledger.filter(r => r.delta < 0))
    const lessonPayments = byTime(payments.filter(p => p.kind !== 'other'))
    const otherPayments = byTime(payments.filter(p => p.kind === 'other' && !p.refunded))

    const explained = new Set<string>()
    const addedFor = new Map<string, LedgerChange>() // payment id -> its addition
    const open = (p: StudioPayment) => additions.filter(r =>
        !explained.has(r.id) && r.studentId === p.studentId && Math.abs(r.atMs - p.atMs) <= MATCH_WINDOW)
    const claim = (p: StudioPayment, row: LedgerChange | undefined) => {
        if (!row) return
        explained.add(row.id)
        addedFor.set(p.id, row)
    }

    // 1. Each payment's own lessons: the right number, closest in time.
    for (const p of lessonPayments) {
        if (p.lessons !== null) claim(p, nearest(open(p).filter(r => r.delta === p.lessons), p.atMs))
    }

    // 2. A credit given back right after it was taken (or lessons added by
    //    mistake and taken straight back): a reversal, not a purchase.
    let givenBack = 0
    const reversed = new Set<string>()
    for (const r of additions) {
        if (explained.has(r.id) || labelled(r)) continue
        const pair = (d: LedgerChange) => !reversed.has(d.id) && d.studentId === r.studentId && d.delta === -r.delta
        const before = deductions.filter(d => pair(d) && d.atMs <= r.atMs && r.atMs - d.atMs <= GIVE_BACK_WINDOW).pop()
        // Taken back afterwards only counts for 2+, since a single credit
        // taken the next day is usually just a lesson.
        const after = r.delta >= 2
            ? deductions.find(d => pair(d) && d.atMs >= r.atMs && d.atMs - r.atMs <= GIVE_BACK_WINDOW)
            : undefined
        const match = before ?? after
        if (match) {
            reversed.add(match.id)
            explained.add(r.id)
            if (inMonth(r.atMs)) givenBack++
        }
    }

    // 3. A payment whose lessons came in a different number.
    for (const p of lessonPayments) {
        if (addedFor.has(p.id) || p.refunded) continue
        claim(p, nearest(open(p).filter(r => !labelled(r)), p.atMs))
    }

    // 4. Other Stripe payments for the family explain lessons added near them.
    let otherPaid = 0
    for (const p of otherPayments) {
        const row = nearest(open(p).filter(r => !labelled(r)), p.atMs)
        if (!row) continue
        explained.add(row.id)
        if (inMonth(row.atMs)) otherPaid++
    }

    const findings: PaymentFinding[] = []
    const flag = (kind: PaymentFindingKind, studentId: string, atMs: number, detail: string) =>
        findings.push({ kind, studentId, studentName: name(studentId), atMs, detail })

    let paid = 0
    let paidCents = 0
    for (const p of lessonPayments) {
        if (!inMonth(p.atMs)) continue
        const row = addedFor.get(p.id)
        if (p.refunded) {
            if (!row) continue
            const takenBack = row.delta >= 2 && deductions.some(d =>
                d.studentId === p.studentId && d.delta === -row.delta &&
                d.atMs > row.atMs && d.atMs - row.atMs <= TAKE_BACK_WINDOW)
            if (!takenBack) {
                flag('refunded_lessons_kept', p.studentId, p.atMs,
                    `paid ${dollars(p.amountCents)} on ${day(p.atMs)} (${what(p)}), but the payment was refunded or cancelled in Stripe ` +
                    `and the ${lessonsWord(row.delta)} added for it (${when(row.atMs)}) were not taken back.`)
            }
            continue
        }
        paid++
        paidCents += p.amountCents
        if (!row) {
            flag('payment_without_lessons', p.studentId, p.atMs,
                `paid ${dollars(p.amountCents)} on ${day(p.atMs)} (${what(p)}), but no lessons were added within 2 days.`)
        } else if (p.lessons !== null && row.delta !== p.lessons) {
            flag('wrong_lessons', p.studentId, p.atMs,
                `paid ${dollars(p.amountCents)} on ${day(p.atMs)} (${what(p)}), but ${row.delta === 1 ? '1 lesson was' : `${row.delta} lessons were`} added ` +
                `(${when(row.atMs)}, ${row.prev} to ${row.next}).`)
        }
    }

    const paidRows = new Set([...addedFor.values()].map(r => r.id))
    let additionsInMonth = 0
    let lessonsAdded = 0
    let paidFor = 0
    let labelledCount = 0
    for (const r of additions) {
        if (!inMonth(r.atMs)) continue
        additionsInMonth++
        lessonsAdded += r.delta
        if (paidRows.has(r.id)) paidFor++
        if (explained.has(r.id)) continue
        if (labelled(r)) {
            labelledCount++
            continue
        }
        flag('lessons_without_payment', r.studentId, r.atMs,
            `${lessonsWord(r.delta)} added ${when(r.atMs)} (${r.prev} to ${r.next}) with no Stripe payment within 2 days and no reason noted. ` +
            `Fine if it was paid another way or given on purpose.`)
    }

    findings.sort((a, b) => a.atMs - b.atMs || a.studentName.localeCompare(b.studentName))
    return {
        month,
        payments: paid,
        paidCents,
        additions: additionsInMonth,
        lessonsAdded,
        paidFor,
        otherPaid,
        labelled: labelledCount,
        givenBack,
        findings,
    }
}

type Owner = (customerId: string | null, userId: string | null | undefined) => string | null

function idOf(x: string | { id: string } | null | undefined): string | null {
    if (!x) return null
    return typeof x === 'string' ? x : x.id
}

/**
 * Reads the studio's Stripe payments between two times (read-only list calls).
 * `ownerOf` maps a payment to a tracked student, or null to skip it.
 */
export async function loadStripePayments(fromMs: number, toMs: number, ownerOf: Owner): Promise<StudioPayment[]> {
    const { stripe } = await import('@/lib/stripe')
    const sec = (ms: number) => Math.floor(ms / 1000)
    const inWindow = (ms: number) => ms >= fromMs && ms <= toMs
    const out: StudioPayment[] = []
    const claimed = new Set<string>() // payment intents that belong to an invoice or a checkout

    const charges = await stripe.charges
        .list({ created: { gte: sec(fromMs - DAY), lte: sec(toMs) }, limit: 100 })
        .autoPagingToArray({ limit: 5000 })
    const chargeOf = new Map<string, Stripe.Charge>() // payment intent -> its successful charge
    for (const c of charges) {
        const pi = idOf(c.payment_intent)
        if (pi && c.status === 'succeeded') chargeOf.set(pi, c)
    }

    // Plans: paid subscription invoices. Retries can run for weeks, so look
    // further back for invoices created before the window but paid in it.
    const invoices = await stripe.invoices
        .list({ created: { gte: sec(fromMs - 40 * DAY), lte: sec(toMs) }, status: 'paid', limit: 100, expand: ['data.payments'] })
        .autoPagingToArray({ limit: 5000 })
    for (const inv of invoices) {
        const intents = (inv.payments?.data || []).map(p => idOf(p.payment?.payment_intent)).filter((x): x is string => Boolean(x))
        intents.forEach(pi => claimed.add(pi))
        const paidAt = inv.status_transitions?.paid_at
        if (!paidAt || !inWindow(paidAt * 1000)) continue
        const sub = inv.parent?.subscription_details
        const studentId = ownerOf(idOf(inv.customer), sub?.metadata?.userId)
        if (!studentId) continue
        const isPlan = Boolean(sub) && (inv.billing_reason === 'subscription_create' || inv.billing_reason === 'subscription_cycle')
        // Other invoices (manual ones, plan-change prorations) add no lessons by themselves.
        if (!isPlan && !inv.amount_paid) continue
        const charges = intents.map(pi => chargeOf.get(pi)).filter((c): c is Stripe.Charge => Boolean(c))
        out.push({
            id: inv.id!,
            studentId,
            kind: isPlan ? 'plan' : 'other',
            lessons: isPlan ? Number(sub?.metadata?.credits) || null : null,
            amountCents: inv.amount_paid,
            refunded: charges.length > 0 && charges.every(c => c.refunded),
            atMs: paidAt * 1000,
        })
    }

    // Packages: completed one-time Checkouts. A plan's first Checkout is
    // covered by its first invoice above; balance payments are fees.
    const sessions = await stripe.checkout.sessions
        .list({ created: { gte: sec(fromMs - DAY), lte: sec(toMs) }, status: 'complete', limit: 100 })
        .autoPagingToArray({ limit: 5000 })
    for (const s of sessions) {
        const pi = idOf(s.payment_intent)
        if (pi) claimed.add(pi)
        if (s.mode !== 'payment' || s.payment_status === 'unpaid') continue
        if (s.metadata?.type === 'balance_payment') continue
        const charge = pi ? chargeOf.get(pi) : undefined
        const atMs = (charge?.created ?? s.created) * 1000
        if (!inWindow(atMs)) continue
        const studentId = ownerOf(idOf(s.customer), s.metadata?.userId)
        if (!studentId) continue
        const lessons = Number(s.metadata?.credits) || null
        out.push({
            id: s.id,
            studentId,
            kind: lessons ? 'package' : 'other',
            lessons,
            amountCents: s.amount_total ?? 0,
            refunded: Boolean(charge?.refunded),
            atMs,
        })
    }

    // Anything else charged to a studio family (the Stripe dashboard, a payment link).
    for (const c of charges) {
        const pi = idOf(c.payment_intent)
        if (c.status !== 'succeeded' || (pi && claimed.has(pi)) || !inWindow(c.created * 1000)) continue
        const studentId = ownerOf(idOf(c.customer), c.metadata?.userId)
        if (!studentId) continue
        out.push({ id: c.id, studentId, kind: 'other', lessons: null, amountCents: c.amount, refunded: c.refunded, atMs: c.created * 1000 })
    }

    return out
}

/**
 * Loads a month's Stripe payments and lesson changes and matches them.
 * Read-only. Never throws: a failure comes back as `error` so the rest of the
 * credit check still goes out.
 */
export async function checkPayments(
    client: DbClient,
    month: string,
    { loadPayments = loadStripePayments }: { loadPayments?: typeof loadStripePayments } = {},
): Promise<PaymentCheckReport> {
    try {
        const { startMs, endMs } = monthBounds(month)

        const { data: profiles, error: profileError } = await client
            .from('profiles')
            .select('id, name, credits, stripe_customer_id')
        if (profileError) throw new Error(`profiles query failed: ${profileError.message}`)
        const names = new Map<string, string>()
        const tracked = new Set<string>()
        const byCustomer = new Map<string, string>()
        for (const p of profiles || []) {
            names.set(p.id as string, (p.name as string)?.trim() || 'Unknown student')
            if (isUntrackedTeacherAccount(p)) continue
            tracked.add(p.id as string)
            if (p.stripe_customer_id) byCustomer.set(p.stripe_customer_id as string, p.id as string)
        }
        const ownerOf: Owner = (customerId, userId) => {
            if (userId && names.has(userId)) return tracked.has(userId) ? userId : null
            const id = customerId ? byCustomer.get(customerId) : undefined
            return id ?? null
        }

        const { data: rows, error: ledgerError } = await client
            .from('credit_transactions')
            .select('id, student_id, previous_credits, new_credits, delta, source, note, changed_at')
            .gte('changed_at', new Date(startMs - MATCH_WINDOW - GIVE_BACK_WINDOW).toISOString())
            .lt('changed_at', new Date(endMs + TAKE_BACK_WINDOW).toISOString())
            .order('changed_at', { ascending: true })
            .limit(10000)
        if (ledgerError) throw new Error(`credit_transactions query failed: ${ledgerError.message}`)
        const ledger: LedgerChange[] = (rows || [])
            .filter(r => tracked.has(r.student_id as string))
            .map(r => ({
                id: r.id as string,
                studentId: r.student_id as string,
                prev: Number(r.previous_credits),
                next: Number(r.new_credits),
                delta: Number(r.delta),
                source: (r.source as string) || null,
                note: (r.note as string) || null,
                atMs: Date.parse(r.changed_at as string),
            }))

        const payments = await loadPayments(startMs - MATCH_WINDOW, endMs + MATCH_WINDOW, ownerOf)
        return reconcilePayments(month, payments, ledger, names)
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[payment-check] ${month} failed: ${detail}`)
        return {
            month, payments: 0, paidCents: 0, additions: 0, lessonsAdded: 0,
            paidFor: 0, otherPaid: 0, labelled: 0, givenBack: 0, findings: [], error: detail,
        }
    }
}

/** True when the payments part of the credit check has something to say. */
export function paymentCheckNeedsEmail(report: PaymentCheckReport | null | undefined): boolean {
    return Boolean(report && (report.error || report.findings.length))
}

/** How many lines the payments part adds to the email's "things to look at". */
export function paymentCheckCount(report: PaymentCheckReport | null | undefined): number {
    if (!report) return 0
    return report.error ? 1 : report.findings.length
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** The "Payments and lessons added" part of the credit check email. */
export function paymentCheckHtml(report: PaymentCheckReport, monthLabel: string): string {
    const heading = (text: string) => `<p style="margin:22px 0 10px"><strong>${text}</strong></p>`
    if (report.error) {
        return heading('Payments and lessons added') +
            `<p>Payments could not be checked this time (${escapeHtml(report.error)}). Nothing was changed. ` +
            `Run it again with ?month=${report.month}&amp;dry=1 once Stripe answers.</p>`
    }
    const n = report.findings.length
    const scope = `${report.payments} Stripe payment${report.payments === 1 ? '' : 's'} for lessons in ${monthLabel} (${dollars(report.paidCents)})`
    if (!n) {
        return report.payments
            ? `<p>Payments: all ${scope} added their lessons, and every lesson added that month had a payment or a reason.</p>`
            : `<p>Payments: no Stripe payments for lessons in ${monthLabel}, and every lesson added that month had a reason.</p>`
    }
    return heading(`Payments and lessons added (${n})`) +
        `<ul>${report.findings.map(f => `<li>${escapeHtml(f.studentName)}: ${escapeHtml(f.detail)}</li>`).join('')}</ul>` +
        `<p style="color:#666;font-size:13px">The ${scope} were lined up with the lessons added to each family within 2 days: ` +
        `a monthly plan or package should add its lessons, and lessons added without a payment should have a reason. ` +
        `Free trials, credits given back, test cleanups and changes with a note are fine and not listed. ` +
        `Failed payment attempts are left out, and a refunded payment should not keep its lessons. ` +
        `Read-only: nothing in Stripe or the portal was changed.</p>`
}
