import type Stripe from 'stripe'
import { runningSubscription, summarizeSubscriptions } from '@/lib/subscription-summary'
import { isoToStudioWallClock, studioToday, studioTzAbbr } from '@/lib/studio-timezone'

/**
 * The admin Balances page (Lionel's #935): every active family's lessons left,
 * last and next lesson, and next payment, on one sortable list. Read only.
 *
 * This file is the part the browser also uses (rows, sorting, words); the
 * loading lives in lib/core/balances.ts and runs on the server.
 */

/** Studio (Eastern) wall clock, as stored on lessons. */
export type LessonWhen = { date: string; time: string }

export type PaymentInfo =
    /** A running plan that will charge again. amountCents is what Stripe will take (after any account credit or discount) when it could tell, else the plan price. */
    | { kind: 'autopay'; nextPaymentAt: string | null; amountCents: number | null; planAmountCents: number | null; pastDue: boolean; subscriptionId: string }
    /** A capped plan that has taken its last payment and stops on endingAt. */
    | { kind: 'ending'; endingAt: string | null }
    /** Had a plan, now stopped. */
    | { kind: 'ended'; endedAt: string | null; how: 'canceled' | 'unpaid' | 'paused' }
    /** Never had a plan (or never paid by card). */
    | { kind: 'none' }
    /** Stripe failed or was too slow for this family. */
    | { kind: 'unknown'; error: string }

export type BalanceRow = {
    studentId: string
    name: string
    /** profiles.credits: lessons left; negative means lessons owed. */
    credits: number
    lastLesson: LessonWhen | null
    nextLesson: LessonWhen | null
    payment: PaymentInfo
}

const STOPPED: Record<string, 'canceled' | 'unpaid' | 'paused'> = { canceled: 'canceled', unpaid: 'unpaid', paused: 'paused' }

/** A family's plan, from what stripe.subscriptions.list({ status: 'all' }) returned. */
export function paymentFromSubscriptions(subs: Stripe.Subscription[]): PaymentInfo {
    const running = runningSubscription(subs)
    if (running) {
        const s = summarizeSubscriptions(subs)
        if (running.cancel_at_period_end || running.cancel_at) return { kind: 'ending', endingAt: s.endingAt }
        const item = running.items?.data?.[0]
        const unit = item?.price?.unit_amount
        const plan = unit == null ? null : unit * (item?.quantity ?? 1)
        return { kind: 'autopay', nextPaymentAt: s.nextPaymentAt, amountCents: plan, planAmountCents: plan, pastDue: running.status === 'past_due', subscriptionId: running.id }
    }
    const stopped = subs
        .filter(sub => STOPPED[sub.status])
        .map(sub => ({ sub, at: sub.ended_at ?? sub.canceled_at ?? sub.created ?? 0 }))
        .sort((a, b) => b.at - a.at)[0]
    if (stopped) {
        return { kind: 'ended', endedAt: stopped.at ? new Date(stopped.at * 1000).toISOString() : null, how: STOPPED[stopped.sub.status] }
    }
    return { kind: 'none' }
}

// ------------------------------------------------------------ sorting ---

export type SortKey = 'name' | 'credits' | 'last' | 'next' | 'payment'
export type SortDir = 'asc' | 'desc'

/** Fewest lessons left first. */
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: 'credits', dir: 'asc' }

function sortValue(row: BalanceRow, key: SortKey): string | number | null {
    switch (key) {
        case 'name': return row.name.toLowerCase()
        case 'credits': return row.credits
        case 'last': return row.lastLesson ? `${row.lastLesson.date} ${row.lastLesson.time}` : null
        case 'next': return row.nextLesson ? `${row.nextLesson.date} ${row.nextLesson.time}` : null
        case 'payment': return row.payment.kind === 'autopay' ? row.payment.nextPaymentAt : null
    }
}

/** Sorted copy. Blanks (no lesson, no autopay) always go last; ties go by name. */
export function sortBalances(rows: BalanceRow[], key: SortKey, dir: SortDir): BalanceRow[] {
    const sign = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
        const x = sortValue(a, key)
        const y = sortValue(b, key)
        if (x === null || y === null) {
            if (x !== y) return x === null ? 1 : -1
        } else if (x !== y) {
            return (x < y ? -1 : 1) * sign
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
}

/** Clicking a header: the same column flips direction, a new one starts ascending. */
export function nextSort(current: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
    return current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
}

// -------------------------------------------------------------- words ---

function clock(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}

function day(date: string, today: string): string {
    const withYear = date.slice(0, 4) !== today.slice(0, 4)
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
    })
}

/** "Tue, Nov 18, 5:30pm EST" (Eastern, the year only when it is not this year). */
export function lessonWords(when: LessonWhen, today: string = studioToday()): string {
    return `${day(when.date, today)}, ${clock(when.time.slice(0, 5))} ${studioTzAbbr(when.date)}`
}

/** A Stripe instant as an Eastern day: "Mon, Dec 1". */
export function paymentDay(iso: string, today: string = studioToday()): string {
    return day(isoToStudioWallClock(iso).localDate, today)
}

export function dollars(cents: number): string {
    return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

/** Lessons left, said plainly: a negative balance is lessons owed. */
export function creditWords(credits: number): { text: string; note: string | null; tone: 'owes' | 'zero' | 'low' | 'ok' } {
    if (credits < 0) return { text: String(credits), note: `owes ${-credits} lesson${credits === -1 ? '' : 's'}`, tone: 'owes' }
    if (credits === 0) return { text: '0', note: 'none left', tone: 'zero' }
    return { text: String(credits), note: null, tone: credits <= 1 ? 'low' : 'ok' }
}

/** The payment cell: main words plus a marker for anything that is not plain autopay. */
export function paymentWords(p: PaymentInfo, today: string = studioToday()): { text: string; marker: string | null; tone: 'ok' | 'warn' | 'muted' } {
    switch (p.kind) {
        case 'autopay': {
            const when = p.nextPaymentAt ? paymentDay(p.nextPaymentAt, today) : 'date unknown'
            const amount = p.amountCents == null ? '' : `, ${dollars(p.amountCents)}`
            const plan = p.planAmountCents != null && p.amountCents != null && p.planAmountCents !== p.amountCents
                ? ` (plan ${dollars(p.planAmountCents)})` : ''
            return { text: `${when}${amount}${plan}`, marker: p.pastDue ? 'Past due: last payment failed' : null, tone: p.pastDue ? 'warn' : 'ok' }
        }
        case 'ending':
            return { text: p.endingAt ? `Plan ends ${paymentDay(p.endingAt, today)}` : 'Plan ending', marker: 'No more payments', tone: 'warn' }
        case 'ended': {
            const how = p.how === 'canceled' ? 'Plan ended' : p.how === 'unpaid' ? 'Plan stopped, unpaid' : 'Plan paused'
            return { text: p.endedAt ? `${how} ${paymentDay(p.endedAt, today)}` : how, marker: 'No autopay', tone: 'warn' }
        }
        case 'none':
            return { text: 'No plan', marker: 'No autopay', tone: 'muted' }
        case 'unknown':
            return { text: 'Stripe did not answer', marker: null, tone: 'muted' }
    }
}
