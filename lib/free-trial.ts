import type { DbClient } from '@/lib/supabase/admin'

/**
 * A new student's free trial, logged free automatically (Lionel's #946).
 *
 * The studio's first lesson is a free trial (confirmed 2026-11-17). Before
 * this, logging it took a credit and Lionel's helpers gave one back by hand
 * (ledger source 'free trial'). Now every log path (admin log, the email's
 * Log it page, the admin unlogged list, Zoom and classroom auto-logs, the
 * agent API, the quiet late log and "log a past lesson") asks this first and
 * logs the trial with the usual free choice (#756): no credit taken, free
 * reason "Trial".
 *
 * The rule. A lesson is the free trial when all of these hold:
 *   1. It is the first lesson on the account: no other lesson was ever logged
 *      or marked a no-show, and no other lesson is booked earlier (an earlier
 *      one still unlogged would be the trial instead).
 *   2. Nothing was ever paid: the balance is 0 or below, and the credit
 *      ledger has never added a lesson to the account (no purchase, no plan
 *      payment, no adjustment). That also leaves out a trial already covered
 *      the old way (+1 credit, source 'free trial'), so it is never free twice,
 *      and teacher accounts (their balance is in the hundreds).
 * A family who buys lessons before their first one is enrolled, not on a
 * trial, so that first lesson takes a credit as usual (Lionel can still tick
 * Free by hand). When anything cannot be read, the lesson is logged the usual
 * way (a credit), as before this rule existed.
 */

export type TrialLesson = { id: string; date: string; time: string; status: string }

export type TrialFacts = {
    /** The lesson being logged: studio date and time. */
    date: string
    time: string
    /** The student's other lessons, any status (this one left out). */
    others: TrialLesson[]
    /** profiles.credits now. */
    creditsNow: number
    /** How many times the ledger ever added credits to the account. */
    creditAdditions: number
}

export type TrialDecision = { trial: boolean; why: string }

/** Logged (completed) or a no-show (cancelled): the lesson already counted. */
const COUNTED_STATUSES = new Set(['completed', 'cancelled'])

function slot(date: string, time: string): string {
    return `${date} ${String(time).slice(0, 5)}`
}

/** The rule above, on facts already read. Pure. */
export function freeTrialDecision(f: TrialFacts): TrialDecision {
    if (f.others.some(o => COUNTED_STATUSES.has(o.status))) return { trial: false, why: 'not the first lesson: another was already logged' }
    const mine = slot(f.date, f.time)
    if (f.others.some(o => slot(o.date, o.time) < mine)) return { trial: false, why: 'not the first lesson: an earlier one is still booked' }
    if (f.creditsNow > 0) return { trial: false, why: 'lessons on the balance (paid)' }
    if (f.creditAdditions > 0) return { trial: false, why: 'lessons were added to the account before (a purchase, or the trial was already covered)' }
    return { trial: true, why: 'first lesson, nothing paid' }
}

/**
 * Reads the facts and decides. `client` must be the service-role client (the
 * ledger is not readable from an admin's own session). `lessonId` is null for
 * a past lesson that is about to be created.
 */
export async function checkFreeTrial(
    client: DbClient,
    { studentId, lessonId, date, time }: { studentId: string; lessonId: string | null; date: string; time: string },
): Promise<TrialDecision> {
    try {
        const [profileRes, lessonsRes, ledgerRes] = await Promise.all([
            client.from('profiles').select('credits').eq('id', studentId).single(),
            client.from('lessons').select('id, date, time, status').eq('student_id', studentId),
            client.from('credit_transactions').select('id', { count: 'exact', head: true }).eq('student_id', studentId).gt('delta', 0),
        ])
        if (profileRes.error || !profileRes.data) return { trial: false, why: `could not read the balance: ${profileRes.error?.message || 'no profile'}` }
        if (lessonsRes.error) return { trial: false, why: `could not read the lessons: ${lessonsRes.error.message}` }
        if (ledgerRes.error) return { trial: false, why: `could not read the credit history: ${ledgerRes.error.message}` }
        return freeTrialDecision({
            date,
            time,
            others: ((lessonsRes.data || []) as TrialLesson[]).filter(l => l.id !== lessonId),
            creditsNow: Number(profileRes.data.credits ?? 0),
            creditAdditions: ledgerRes.count ?? 0,
        })
    } catch (e: any) {
        return { trial: false, why: `trial check failed: ${e?.message || e}` }
    }
}
