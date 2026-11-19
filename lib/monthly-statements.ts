import { Resend } from 'resend'
import * as React from 'react'
import type { DbClient } from '@/lib/supabase/admin'
import { resolveSalutation } from '@/lib/core/students'
import { resolveNotificationEmail } from '@/lib/notification-email'
import { replyAddressForStudent } from '@/lib/inbound-email'
import { familyTimeZone } from '@/lib/family-time'
import { STUDIO_TZ, studioWallClockToISO } from '@/lib/studio-timezone'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { appBaseUrl } from '@/lib/lesson-action-links'
import { UNLOGGED_STATUSES } from '@/lib/unlogged-lessons'
import { nextPaymentFromStripe } from '@/lib/weekly-summary'
import { sendCronAlert } from '@/lib/cron-alerts'
import { MonthlyStatementEmail } from '@/components/emails/monthly-statement-email'

/**
 * The monthly statement (Lionel's #936): on the 1st, one short email to each
 * active family about the month before. Lessons held (how many and the dates,
 * in the family's own calendar), lessons left now, and the next payment DATE
 * if they are on a monthly plan. Never an amount, a price or payment math (a
 * standing rule of his), and never one email to many people.
 *
 * Who gets one: role 'student', status 'active'. Test/teacher accounts
 * (status 'other', or a teacher's untracked credits) never do. Addressed like
 * every other family email: "Hi <resolveSalutation>," to resolveNotificationEmail.
 * When the salutation is the parent, the email names the child ("Here's Waris's
 * lesson summary"); otherwise it says "your".
 *
 * The announcement opt-out (profiles.announcement_emails_opt_out) does NOT
 * apply: that switch only covers announcements (recitals, events), and its
 * page promises "Lesson reminders and account emails continue as usual". A
 * statement of the family's own lessons and balance is an account email.
 *
 * Exactly once per family per month: a monthly_statements_sent row (unique
 * student + month) is claimed before sending, so a re-run sends nothing twice.
 * Resend also gets an idempotency key for the same pair.
 *
 * Counted as held: lessons logged that month (status 'completed'), marked
 * "(free)" when logged free (#756). A no-show (status 'cancelled') still took
 * a lesson, so it is listed on its own line. Lessons still unlogged are not in
 * the email (no lesson was taken for them); the run reports them per family.
 */

export type StatementRow = { label: string; value: string }

export type StatementContent = {
    subject: string
    preview: string
    heading: string
    greeting: string
    intro: string
    rows: StatementRow[]
    historyLine: string
    historyUrl: string
    replyLine: string | null
    closing: string
    signature: string
    /** The plain text version, word for word what the HTML says. */
    text: string
}

export type StatementLesson = { date: string; time: string; free?: boolean }

export type StatementFacts = {
    /** "YYYY-MM": the month the statement covers. */
    month: string
    /** The student's first (or preferred) name. */
    studentFirst: string
    /** The X in "Hi X," (resolveSalutation), or null for "Hi there,". */
    greetingName: string | null
    /** The email goes to a parent, so it names the child instead of "your". */
    toParent: boolean
    /** Logged lessons that month (studio dates and times). */
    held: StatementLesson[]
    /** No-shows that month: they still took a lesson. */
    missed: StatementLesson[]
    /** profiles.credits now. */
    creditsNow: number
    /** The plan's next automatic payment (ISO), or null when not on a plan. */
    nextPaymentAt: string | null
    /** profiles.timezone: dates are shown in the family's own calendar when known. */
    familyTz: string | null
    historyUrl: string
    /** Replies route into the family's portal chat (Reply-To is set). */
    canReply: boolean
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-11" -> "November" */
export function monthName(month: string): string {
    return MONTHS[Number(month.slice(5, 7)) - 1] ?? month
}

/** "YYYY-MM" of the month before the given studio date "YYYY-MM-DD". */
export function previousMonthOf(today: string): string {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 1)
    return d.toISOString().slice(0, 7)
}

/** First day of the month after "YYYY-MM", as "YYYY-MM-DD". */
export function nextMonthStart(month: string): string {
    const d = new Date(`${month}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + 1)
    return d.toISOString().slice(0, 10)
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "a", "a and b", "a, b and c" (Lionel writes lists without the last comma). */
function joinAnd(items: string[]): string {
    if (items.length <= 1) return items.join('')
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** "YYYY-MM-DD" of an instant on the family's own calendar (Eastern when their zone is unknown). */
function dateIn(at: Date, zone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
    const get = (type: string) => parts.find(p => p.type === type)?.value || ''
    return `${get('year')}-${get('month')}-${get('day')}`
}

/** The lesson's date as the family's calendar reads it (a late Eastern lesson can be the next day abroad). */
export function familyDate(date: string, time: string, familyTz: string | null | undefined): string {
    try {
        const at = new Date(studioWallClockToISO(date, String(time).slice(0, 5)))
        const zone = familyTimeZone(familyTz, at)
        if (!zone || isNaN(at.getTime())) return date
        return dateIn(at, zone)
    } catch {
        return date
    }
}

/**
 * "November 2, 9, 16 and 23": the month is named once per run of dates in it
 * ("October 31, November 7 and 14"). Two lessons on one day read "(2 lessons)";
 * a note ("free") goes in brackets after its date.
 */
export function formatDateList(items: { date: string; note?: string }[]): string {
    const byDate = new Map<string, { count: number; notes: Set<string> }>()
    for (const it of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
        const entry = byDate.get(it.date) ?? { count: 0, notes: new Set<string>() }
        entry.count += 1
        if (it.note) entry.notes.add(it.note)
        byDate.set(it.date, entry)
    }
    let lastMonth = ''
    const tokens: string[] = []
    for (const [date, { count, notes }] of byDate) {
        const ym = date.slice(0, 7)
        const day = String(Number(date.slice(8, 10)))
        const label = ym === lastMonth ? day : `${monthName(ym)} ${day}`
        lastMonth = ym
        const extra = [count > 1 ? `${count} lessons` : '', ...notes].filter(Boolean)
        tokens.push(extra.length ? `${label} (${extra.join(', ')})` : label)
    }
    return joinAnd(tokens)
}

/** "December 15" in the family's zone (Eastern when unknown), like the portal shows it. */
export function formatPaymentDate(iso: string, familyTz: string | null | undefined): string {
    const at = new Date(iso)
    const zone = familyTimeZone(familyTz, at) ?? STUDIO_TZ
    const date = dateIn(at, zone)
    return `${monthName(date.slice(0, 7))} ${Number(date.slice(8, 10))}`
}

/** Every word of one family's statement, for both the HTML and the plain text. Pure. */
export function buildStatement(f: StatementFacts): StatementContent {
    const month = monthName(f.month)
    const whose = f.toParent ? `${f.studentFirst}'s` : 'your'
    const Whose = f.toParent ? `${f.studentFirst}'s` : 'Your'

    const heldList = f.held.map(l => ({ date: familyDate(l.date, l.time, f.familyTz), note: l.free ? 'free' : undefined }))
    const rows: StatementRow[] = [{
        label: 'Lessons held',
        // Spaced hyphen, his usual aside: "3 - November 2, 9 and 16".
        value: heldList.length ? `${heldList.length} - ${formatDateList(heldList)}` : 'none',
    }]
    if (f.missed.length) {
        rows.push({
            label: 'Missed (still counted)',
            value: formatDateList(f.missed.map(l => ({ date: familyDate(l.date, l.time, f.familyTz) }))),
        })
    }
    const left = Math.max(0, f.creditsNow)
    rows.push({
        label: 'Lessons left',
        // Below zero means lessons were held before the next payment landed.
        // "-2" reads as a system error, so say what happened (as the portal does).
        value: f.creditsNow < 0
            ? `0 (${plural(Math.abs(f.creditsNow), 'lesson')} ahead of the credit balance)`
            : String(left),
    })
    if (f.nextPaymentAt) {
        rows.push({ label: 'Next payment', value: formatPaymentDate(f.nextPaymentAt, f.familyTz) })
    }

    const greeting = `Hi ${f.greetingName || 'there'},`
    const intro = `Here's ${whose} lesson summary for ${month}:`
    const historyLine = 'You can see every lesson in the History tab of the portal:'
    const replyLine = f.canReply ? 'Any questions, just reply to this email!' : null
    const closing = 'See you soon!'
    const signature = 'Lionel'

    const text = [
        greeting,
        '',
        intro,
        '',
        ...rows.map(r => `${r.label}: ${r.value}`),
        '',
        `${historyLine} ${f.historyUrl}`,
        ...(replyLine ? ['', replyLine] : []),
        '',
        closing,
        signature,
    ].join('\n')

    const held = heldList.length
    return {
        subject: `${Whose} ${month} lesson summary`,
        preview: `${held ? plural(held, 'lesson') : 'No lessons'} in ${month}, ${left} left`,
        heading: `${month} lesson summary`,
        greeting,
        intro,
        rows,
        historyLine,
        historyUrl: f.historyUrl,
        replyLine,
        closing,
        signature,
        text,
    }
}

// ------------------------------------------------------------ the run ---

export type FamilyStatus = 'sent' | 'would_send' | 'already_sent' | 'skipped' | 'failed'

export type FamilyResult = {
    studentId: string
    status: FamilyStatus
    /** Why it was skipped or failed. */
    reason?: string
    /** Worth a look, not in the email (e.g. a lesson last month still unlogged). */
    notes: string[]
    to?: string | null
    subject?: string
    text?: string
    html?: string
}

export type StatementRun = {
    month: string
    dryRun: boolean
    /** MONTHLY_STATEMENTS=off: nothing is sent (a dry run still shows what would be). */
    off: boolean
    sent: number
    wouldSend: number
    alreadySent: number
    skipped: number
    failed: number
    families: FamilyResult[]
}

/** The off switch: MONTHLY_STATEMENTS=off (or false/0/no). */
export function statementsOff(): boolean {
    return ['off', 'false', '0', 'no'].includes((process.env.MONTHLY_STATEMENTS || '').trim().toLowerCase())
}

const FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'
/** Resend allows a few sends a second; one family at a time, spaced out. */
const SEND_GAP_MS = 600

function firstWord(s: string | null | undefined): string {
    return (s || '').trim().split(/\s+/)[0] || ''
}

type LessonRow = { id: string; student_id: string; date: string; time: string; duration: number | null; status: string; free_reason: string | null }

/**
 * Builds (and unless dryRun, sends) every family's statement for `month`.
 * `only` limits the run to one student; in a dry run it may be any student
 * (the test account included), but a real send still needs an active family.
 * `withHtml` adds each email's HTML to the result (dry runs).
 */
export async function runMonthlyStatements(
    client: DbClient,
    { month, dryRun, only, withHtml = false, now = new Date() }: { month: string; dryRun: boolean; only?: string | null; withHtml?: boolean; now?: Date },
): Promise<StatementRun> {
    const off = statementsOff()
    const run: StatementRun = { month, dryRun, off, sent: 0, wouldSend: 0, alreadySent: 0, skipped: 0, failed: 0, families: [] }
    if (off && !dryRun) return run

    let q = client.from('profiles').select('*').eq('role', 'student')
    q = only ? q.eq('id', only) : q.eq('status', 'active')
    const { data: profiles, error: profilesError } = await q.order('name')
    if (profilesError) throw new Error(`profiles query failed: ${profilesError.message}`)
    const students = (profiles || []) as Record<string, any>[]
    if (!students.length) return run
    const ids = students.map(s => s.id as string)

    const start = `${month}-01`
    const end = nextMonthStart(month)
    const { data: lessonRows, error: lessonsError } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, status, free_reason')
        .in('student_id', ids)
        .gte('date', start)
        .lt('date', end)
        .order('date')
        .order('time')
    if (lessonsError) throw new Error(`lessons query failed: ${lessonsError.message}`)
    const lessons = (lessonRows || []) as LessonRow[]

    const { data: claimedRows, error: claimedError } = await client
        .from('monthly_statements_sent')
        .select('student_id, sent_at')
        .eq('month', month)
        .in('student_id', ids)
    if (claimedError) throw new Error(`monthly_statements_sent query failed: ${claimedError.message}`)
    const claimed = new Set((claimedRows || []).map((r: any) => r.student_id as string))

    const resend = !dryRun && process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
    const historyUrl = `${appBaseUrl()}/student?tab=history`
    let sentBefore = false

    for (const s of students) {
        const result: FamilyResult = { studentId: s.id, status: 'skipped', notes: [] }
        run.families.push(result)

        // Who gets one, decided before any Stripe call, so a re-run passes over
        // families that already have theirs without looking anything up.
        const to = resolveNotificationEmail(s)
        let decision: 'go' | 'skip' | 'already' = 'skip'
        if (s.status !== 'active') result.reason = `status ${s.status}, only active families get one`
        else if (isUntrackedTeacherAccount(s)) result.reason = 'teacher account'
        else if (!to) result.reason = 'no email address'
        else if (claimed.has(s.id)) decision = 'already'
        else decision = 'go'
        if (decision === 'already') result.status = 'already_sent'
        if (!dryRun && decision !== 'go') {
            if (decision === 'already') run.alreadySent++
            else run.skipped++
            continue
        }

        const theirs = lessons.filter(l => l.student_id === s.id)
        const pastEnd = (l: LessonRow) =>
            Date.parse(studioWallClockToISO(l.date, String(l.time).slice(0, 5))) + (l.duration || 60) * 60_000 <= now.getTime()
        const unlogged = theirs.filter(l => UNLOGGED_STATUSES.includes(l.status) && pastEnd(l))
        if (unlogged.length) {
            result.notes.push(`${plural(unlogged.length, 'lesson')} in ${monthName(month)} still unlogged (${unlogged.map(l => l.date).join(', ')}), not in the email`)
        }

        let nextPaymentAt: string | null = null
        if (s.stripe_customer_id) {
            try {
                const plan = await nextPaymentFromStripe(s.stripe_customer_id)
                nextPaymentAt = plan?.nextPayment ?? null
                if (plan && !plan.nextPayment && plan.planEnds) result.notes.push(`plan ends ${plan.planEnds.slice(0, 10)}, no next payment shown`)
            } catch (e: any) {
                // Without it the email could leave out a payment date the family
                // relies on, so it waits for a re-run instead.
                const why = `Stripe lookup failed: ${e?.message || e}`
                if (decision === 'go') {
                    result.status = 'failed'
                    result.reason = why
                    run.failed++
                    continue
                }
                result.notes.push(why)
            }
        }

        const greetingName = resolveSalutation(s)
        const parentFirst = firstWord(s.parent_contact_name)
        const toParent = s.primary_contact_role === 'parent' || Boolean(parentFirst && greetingName === parentFirst)
        const replyTo = replyAddressForStudent(s.id)
        const content = buildStatement({
            month,
            studentFirst: firstWord(s.preferred_name) || firstWord(s.name) || 'your child',
            greetingName,
            toParent,
            held: theirs.filter(l => l.status === 'completed').map(l => ({ date: l.date, time: l.time, free: typeof l.free_reason === 'string' })),
            missed: theirs.filter(l => l.status === 'cancelled').map(l => ({ date: l.date, time: l.time })),
            creditsNow: Number(s.credits ?? 0),
            nextPaymentAt,
            familyTz: s.timezone ?? null,
            historyUrl,
            canReply: Boolean(replyTo),
        })

        if (dryRun) {
            result.to = to
            result.subject = content.subject
            result.text = content.text
            if (withHtml) {
                const { render } = await import('@react-email/components')
                result.html = await render(React.createElement(MonthlyStatementEmail, { content }))
            }
        }

        if (decision === 'skip') {
            run.skipped++
            continue
        }
        if (decision === 'already') {
            run.alreadySent++
            continue
        }
        if (dryRun) {
            result.status = 'would_send'
            run.wouldSend++
            continue
        }
        if (!resend) {
            result.status = 'failed'
            result.reason = 'RESEND_API_KEY missing'
            run.failed++
            continue
        }

        // Claim first: a second run (or a second trigger) finds the row and stops.
        const { error: claimError } = await client.from('monthly_statements_sent').insert({ student_id: s.id, month })
        if (claimError) {
            if (claimError.code === '23505') {
                result.status = 'already_sent'
                run.alreadySent++
            } else {
                result.status = 'failed'
                result.reason = `could not claim: ${claimError.message}`
                run.failed++
            }
            continue
        }

        if (sentBefore) await new Promise(r => setTimeout(r, SEND_GAP_MS))
        sentBefore = true
        try {
            const { data, error } = await resend.emails.send({
                from: FROM,
                to: to as string, // set: decision 'go' needs an address
                subject: content.subject,
                react: React.createElement(MonthlyStatementEmail, { content }),
                text: content.text,
                ...(replyTo ? { replyTo } : {}),
            }, { idempotencyKey: `monthly-statement/${s.id}/${month}` })
            if (error) {
                // A clear refusal (4xx) means nothing went out: release the claim
                // so a re-run tries again. Unclear (network, 5xx): keep it, so the
                // family is never emailed twice; the alert says to check.
                const refused = typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
                if (refused) await client.from('monthly_statements_sent').delete().eq('student_id', s.id).eq('month', month)
                else await client.from('monthly_statements_sent').update({ error: `${error.name}: ${error.message}` }).eq('student_id', s.id).eq('month', month)
                result.status = 'failed'
                result.reason = `${error.message}${refused ? ' (not sent, a re-run will retry)' : ' (unclear whether it went out, not retried)'}`
                run.failed++
                continue
            }
            await client.from('monthly_statements_sent')
                .update({ sent_at: new Date().toISOString(), resend_id: data?.id ?? null })
                .eq('student_id', s.id).eq('month', month)
            result.status = 'sent'
            run.sent++
        } catch (e: any) {
            await client.from('monthly_statements_sent').update({ error: String(e?.message || e) }).eq('student_id', s.id).eq('month', month)
            result.status = 'failed'
            result.reason = `${e?.message || e} (unclear whether it went out, not retried)`
            run.failed++
        }
    }

    return run
}

/** Emails the studio inbox when a real run left families without their statement. */
export async function alertStatementFailures(client: DbClient, run: StatementRun): Promise<boolean> {
    const failed = run.families.filter(f => f.status === 'failed')
    if (run.dryRun || !failed.length) return false
    const families = failed.length === 1 ? '1 family' : `${failed.length} families`
    return sendCronAlert(client, {
        subject: `Monthly statements: ${families} not sent for ${monthName(run.month)}`,
        lines: failed.map(f => `Student ${f.studentId}: ${f.reason || 'failed'}`),
        footer: `${run.sent} sent, ${run.alreadySent} already had theirs. Re-running is safe (each family gets at most one per month): ` +
            '<code>curl "https://lessons.musicalbasics.com/api/cron/monthly-statements?key=$CRON_SECRET"</code>',
    })
}
