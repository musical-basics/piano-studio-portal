import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { LINK_TTL_DAYS, appBaseUrl } from '@/lib/lesson-action-links'
import { MISSED_IT_NOTE, formatClock, unloggedLessonBlocks, type UnloggedLesson } from '@/lib/unlogged-lessons'

/**
 * Monthly credit check (#443): every lesson logged in a month, lined up with
 * the credits actually taken, so a lesson charged twice or not at all gets
 * noticed. The kind of mix-up it is for: on 2026-06-17 a recording job wrongly
 * re-charged 13 credits for old lessons and nothing said so.
 *
 * What the data looks like (checked against Jun-Nov 2026):
 *   - credit_transactions has a row for every change to profiles.credits
 *     (a trigger writes it), but no lesson id, and `source` is almost always
 *     null (PostgREST connections drop the setting).
 *   - logLessonCore takes the credit, then writes the before/after balance on
 *     the lesson (credit_snapshot_before/credit_snapshot). That pair, the
 *     student, and a time at or after the lesson are what tie a ledger row to
 *     a lesson. Balances repeat (a monthly 1 -> 0), so the time matters.
 *   - Zoom logs most lessons 2-30 minutes after they end; hand logs can be
 *     a day or more later.
 *   - Fine and not flagged: purchases (+4), a free trial (+1, source 'free
 *     trial'), a credit given back after a lesson was cancelled (-1 then +1),
 *     and any change someone labelled with a source or note.
 *
 * Flagged:
 *   - not_charged: a logged lesson with no credit taken for it.
 *   - charged_twice: a second credit taken around a lesson that already took
 *     one (and not given back), or two logged lessons at the same time.
 *   - charge_without_lesson: a credit taken that month with no logged lesson
 *     to match and not given back (for example a lesson logged, then deleted).
 *   - charged_late: a credit taken that month for a lesson more than a month
 *     older, the June 2026 pattern (check it was not already paid for).
 *
 * Teacher accounts are left out entirely (#734, isUntrackedTeacherAccount).
 * Since #736 the same email also lists every past lesson still unlogged
 * (findPastUnloggedLessons), with the morning email's buttons.
 */

export type CreditFindingKind = 'not_charged' | 'charged_twice' | 'charge_without_lesson' | 'charged_late'

export type CreditFinding = {
    kind: CreditFindingKind
    studentId: string
    studentName: string
    lessonId: string | null
    lessonDate: string | null
    lessonTime: string | null
    /** Plain text: what happened to the credit. */
    detail: string
}

export type CreditCheckReport = {
    month: string
    lessonsChecked: number
    lessonsCharged: number
    creditsTaken: number
    givenBack: number
    labelled: number
    findings: CreditFinding[]
}

type CheckLesson = {
    id: string
    studentId: string
    date: string
    time: string
    status: string
    before: number | null
    after: number | null
    startMs: number
    inMonth: boolean
}

type LedgerRow = {
    id: string
    studentId: string
    prev: number
    next: number
    delta: number
    source: string | null
    note: string | null
    atMs: number
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** A log can come a little before the scheduled start (lessons start early). */
const EARLY_LOG = 12 * HOUR
/** How far after a lesson a credit with no balance match still counts as its log. */
const LOOSE_WINDOW = 3 * DAY
/** A credit given back within this long cancels the charge out. */
const GIVE_BACK_WINDOW = 30 * DAY
/** Charged more than this long after the lesson: worth a look (June 2026). */
const LATE_CHARGE = 31 * DAY
/** How long after a lesson its own credit can still be matched by balance. */
const EXACT_WINDOW = 45 * DAY
/**
 * The ledger trigger went live on 2026-06-17. Older lessons have no ledger row
 * of their own, so they never take part in matching by balance (they would
 * claim a later row that merely repeats the same balance).
 */
const LEDGER_START_MS = Date.parse('2026-06-17T00:00:00Z')

/** "YYYY-MM" of the month before the given studio date. */
export function previousMonth(today: string): string {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 1)
    return d.toISOString().slice(0, 7)
}

function nextMonthStart(month: string): string {
    const d = new Date(`${month}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + 1)
    return d.toISOString().slice(0, 10)
}

function shortDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Oct 8 9:50pm" in studio time. */
function when(ms: number): string {
    const d = new Date(ms)
    const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).replace(' ', '').toLowerCase()
    return `${day} ${clock}`
}

function credits(n: number): string {
    return `${n} credit${Math.abs(n) === 1 ? '' : 's'}`
}

/**
 * Pure matching of lessons to credit changes for one month. `lessons` holds the
 * month's logged lessons (inMonth) plus the same students' charged lessons from
 * other months, so a credit taken this month for an older lesson is recognised.
 */
export function reconcileCredits(
    month: string,
    lessons: CheckLesson[],
    ledger: LedgerRow[],
    names: Map<string, string>,
): CreditCheckReport {
    const monthStartMs = Date.parse(studioWallClockToISO(`${month}-01`, '00:00'))
    const monthEndMs = Date.parse(studioWallClockToISO(nextMonthStart(month), '00:00'))
    const inMonthRow = (r: LedgerRow) => r.atMs >= monthStartMs && r.atMs < monthEndMs
    const name = (id: string) => names.get(id) || 'Unknown student'

    const used = new Set<string>()
    const chargeOf = new Map<string, LedgerRow>() // lesson id -> its ledger row
    const deductions = ledger.filter(r => r.delta < 0).sort((a, b) => a.atMs - b.atMs)
    const byStart = [...lessons].sort((a, b) => a.startMs - b.startMs)

    // 1. Exact: the balance the lesson recorded, the first such change at or
    //    after its start. Every student's whole ledger is loaded, so each
    //    lesson since the ledger began claims its own row in time order.
    for (const lesson of byStart) {
        if (lesson.before === null || lesson.after === null) continue
        if (!lesson.inMonth && lesson.startMs < LEDGER_START_MS) continue
        const row = deductions.find(r =>
            !used.has(r.id) && r.studentId === lesson.studentId &&
            r.prev === lesson.before && r.next === lesson.after &&
            r.atMs >= lesson.startMs - EARLY_LOG && r.atMs <= lesson.startMs + EXACT_WINDOW)
        if (row) {
            used.add(row.id)
            chargeOf.set(lesson.id, row)
        }
    }

    // 2. Loose, for this month's lessons only: any credit taken for the student
    //    soon after the lesson (no-shows and repairs write no balance pair).
    for (const lesson of byStart) {
        if (!lesson.inMonth || chargeOf.has(lesson.id)) continue
        const candidates = deductions.filter(r =>
            !used.has(r.id) && r.studentId === lesson.studentId &&
            r.atMs >= lesson.startMs - EARLY_LOG && r.atMs <= lesson.startMs + LOOSE_WINDOW)
        const row = candidates.sort((a, b) => Math.abs(a.atMs - lesson.startMs) - Math.abs(b.atMs - lesson.startMs))[0]
        if (row) {
            used.add(row.id)
            chargeOf.set(lesson.id, row)
        }
    }

    const findings: CreditFinding[] = []
    const lessonFinding = (lesson: CheckLesson, kind: CreditFindingKind, detail: string) => findings.push({
        kind,
        studentId: lesson.studentId,
        studentName: name(lesson.studentId),
        lessonId: lesson.id,
        lessonDate: lesson.date,
        lessonTime: lesson.time,
        detail,
    })

    const monthLessons = byStart.filter(l => l.inMonth)
    for (const lesson of monthLessons) {
        if (chargeOf.has(lesson.id)) continue
        if (lesson.before === null || lesson.after === null) {
            lessonFinding(lesson, 'not_charged', lesson.status === 'cancelled'
                ? 'marked a no-show, but no credit was taken'
                : 'logged, but no credit was taken')
        } else {
            lessonFinding(lesson, 'not_charged', `the lesson says a credit was taken (${lesson.before} to ${lesson.after}), but the credit history has no such change`)
        }
    }

    // 3. Credits taken this month that no lesson accounts for.
    let givenBack = 0
    let labelled = 0
    const gaveBack = new Set<string>()
    for (const row of deductions) {
        if (used.has(row.id) || !inMonthRow(row)) continue
        if (row.source || row.note) {
            labelled++
            continue
        }
        const back = ledger.find(r =>
            r.delta === -row.delta && r.studentId === row.studentId && !gaveBack.has(r.id) &&
            r.source !== 'free trial' && r.atMs > row.atMs && r.atMs <= row.atMs + GIVE_BACK_WINDOW)
        if (back) {
            gaveBack.add(back.id)
            givenBack++
            continue
        }
        const twin = monthLessons.find(l =>
            l.studentId === row.studentId && chargeOf.has(l.id) &&
            row.atMs >= l.startMs - EARLY_LOG && row.atMs <= l.startMs + LOOSE_WINDOW)
        // The June 2026 pattern: the balance recorded on a much older lesson.
        const old = byStart
            .filter(l => l.studentId === row.studentId && l.before === row.prev && l.after === row.next &&
                row.atMs - l.startMs > LATE_CHARGE)
            .pop()
        if (twin) {
            const first = chargeOf.get(twin.id)!
            lessonFinding(twin, 'charged_twice', `charged twice: credits taken ${when(first.atMs)} and ${when(row.atMs)}, and neither was given back`)
        } else if (old) {
            lessonFinding(old, 'charged_late', `credit taken ${when(row.atMs)} (${row.prev} to ${row.next}), long after the lesson. Check it was not already paid for.`)
        } else if (row.delta === -1) {
            findings.push({
                kind: 'charge_without_lesson',
                studentId: row.studentId,
                studentName: name(row.studentId),
                lessonId: null,
                lessonDate: null,
                lessonTime: null,
                detail: `1 credit taken ${when(row.atMs)} (${row.prev} to ${row.next}) with no logged lesson to match, and not given back. Maybe a lesson logged and then deleted.`,
            })
        }
        // Larger unlabelled cuts are hand edits of the balance, not lesson charges.
    }

    // 4. Credits taken this month for lessons from long before (June 2026).
    for (const lesson of byStart) {
        if (lesson.inMonth) continue
        const row = chargeOf.get(lesson.id)
        if (!row || !inMonthRow(row) || row.atMs - lesson.startMs <= LATE_CHARGE) continue
        lessonFinding(lesson, 'charged_late', `credit taken ${when(row.atMs)}, long after the lesson. Check it was not already paid for.`)
    }

    // 5. Two logged lessons for one student at the same time, each charged.
    for (let i = 0; i < monthLessons.length; i++) {
        for (let j = i + 1; j < monthLessons.length; j++) {
            const a = monthLessons[i], b = monthLessons[j]
            if (a.studentId !== b.studentId || a.date !== b.date) continue
            if (Math.abs(a.startMs - b.startMs) >= HOUR) continue
            if (!chargeOf.has(a.id) || !chargeOf.has(b.id)) continue
            lessonFinding(b, 'charged_twice', `logged twice: two lessons at ${formatClock(a.time)} and ${formatClock(b.time)} on the same day, each took a credit`)
        }
    }

    const order = (f: CreditFinding) => f.lessonDate ? `${f.lessonDate} ${f.lessonTime}` : '9999'
    findings.sort((a, b) => order(a).localeCompare(order(b)) || a.studentName.localeCompare(b.studentName))

    return {
        month,
        lessonsChecked: monthLessons.length,
        lessonsCharged: monthLessons.filter(l => chargeOf.has(l.id)).length,
        creditsTaken: deductions.filter(inMonthRow).reduce((n, r) => n - r.delta, 0),
        givenBack,
        labelled,
        findings,
    }
}

/** Loads a month's lessons and credit history and matches them. Read-only. */
export async function checkCredits(client: DbClient, month: string): Promise<CreditCheckReport> {
    const first = `${month}-01`
    const next = nextMonthStart(month)
    const monthStart = studioWallClockToISO(first, '00:00')
    const monthEnd = studioWallClockToISO(next, '00:00')

    const { data: monthRows, error: lessonError } = await client
        .from('lessons')
        .select('id, student_id, date, time, status, credit_snapshot_before, credit_snapshot')
        .gte('date', first)
        .lt('date', next)
        // Cancelling deletes the row; 'cancelled' is only ever a no-show, which forfeits a credit.
        .in('status', ['completed', 'cancelled'])
    if (lessonError) throw new Error(`lessons query failed: ${lessonError.message}`)

    const { data: monthLedger, error: monthLedgerError } = await client
        .from('credit_transactions')
        .select('student_id')
        .gte('changed_at', monthStart)
        .lt('changed_at', monthEnd)
        .limit(5000)
    if (monthLedgerError) throw new Error(`credit_transactions query failed: ${monthLedgerError.message}`)

    const involved = [...new Set([
        ...(monthRows || []).map(l => l.student_id as string),
        ...(monthLedger || []).map(r => r.student_id as string),
    ])]

    // Names, and which accounts are teachers nobody tracks credits for (#734).
    const names = new Map<string, string>()
    const untracked = new Set<string>()
    if (involved.length) {
        const { data, error } = await client.from('profiles').select('id, name, credits').in('id', involved)
        if (error) throw new Error(`profiles query failed: ${error.message}`)
        for (const p of data || []) {
            names.set(p.id as string, (p.name as string) || 'Unknown student')
            if (isUntrackedTeacherAccount(p)) untracked.add(p.id as string)
        }
    }
    const studentIds = involved.filter(id => !untracked.has(id))
    const monthLessons = (monthRows || []).filter(l => !untracked.has(l.student_id as string))

    // Each involved student's whole credit history (a few rows a week), so
    // matching by balance can run in time order from the start.
    const ledgerRows: any[] = []
    if (studentIds.length) {
        const { data, error } = await client
            .from('credit_transactions')
            .select('id, student_id, previous_credits, new_credits, delta, source, note, changed_at')
            .in('student_id', studentIds)
            .order('changed_at', { ascending: true })
            .limit(10000)
        if (error) throw new Error(`credit_transactions query failed: ${error.message}`)
        ledgerRows.push(...(data || []))
    }

    // The same students' charged lessons from other months, so a credit taken
    // this month for an older (or later) lesson is matched to it.
    const otherRows: any[] = []
    if (studentIds.length) {
        const { data, error } = await client
            .from('lessons')
            .select('id, student_id, date, time, status, credit_snapshot_before, credit_snapshot')
            .in('student_id', studentIds)
            .not('credit_snapshot_before', 'is', null)
            .or(`date.lt.${first},date.gte.${next}`)
            .limit(5000)
        if (error) throw new Error(`other lessons query failed: ${error.message}`)
        otherRows.push(...(data || []))
    }

    const toLesson = (l: any, inMonth: boolean): CheckLesson => {
        const time = String(l.time).slice(0, 5)
        return {
            id: l.id,
            studentId: l.student_id,
            date: l.date,
            time,
            status: l.status,
            before: l.credit_snapshot_before ?? null,
            after: l.credit_snapshot ?? null,
            startMs: Date.parse(studioWallClockToISO(l.date, time)),
            inMonth,
        }
    }
    const lessons = [
        ...monthLessons.map(l => toLesson(l, true)),
        ...otherRows.map(l => toLesson(l, false)),
    ]
    const ledger: LedgerRow[] = ledgerRows.map(r => ({
        id: r.id as string,
        studentId: r.student_id as string,
        prev: Number(r.previous_credits),
        next: Number(r.new_credits),
        delta: Number(r.delta),
        source: (r.source as string) || null,
        note: (r.note as string) || null,
        atMs: Date.parse(r.changed_at as string),
    }))

    return reconcileCredits(month, lessons, ledger, names)
}

function monthName(month: string): string {
    return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function describeFinding(f: CreditFinding): string {
    const lesson = f.lessonDate && f.lessonTime
        ? `, ${shortDay(f.lessonDate)} ${formatClock(f.lessonTime)} ${studioTzAbbr(f.lessonDate)} lesson`
        : ''
    return `${escapeHtml(f.studentName)}${lesson}: ${escapeHtml(f.detail)}`
}

export function buildCreditCheckEmail(
    report: CreditCheckReport,
    unlogged: UnloggedLesson[] = [],
    { now = new Date(), baseUrl = appBaseUrl() }: { now?: Date; baseUrl?: string } = {},
): { subject: string; lines: string[]; html: string; footer: string } {
    const n = report.findings.length
    const u = unlogged.length
    const name = monthName(report.month)
    const things = `${n} thing${n === 1 ? '' : 's'} to look at`
    const notLogged = `${u} past lesson${u === 1 ? '' : 's'} not logged`
    const subject = `Credit check for ${name}: ${[n ? things : '', u ? notLogged : ''].filter(Boolean).join(', ') || things}`
    const lines = report.findings.map(describeFinding)

    const parts: string[] = []
    if (n) {
        parts.push(`<ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`)
        parts.push(`<p style="color:#666;font-size:13px">Every lesson logged in ${name} (${report.lessonsChecked}) was lined up with the credit history (${credits(report.creditsTaken)} taken). ` +
            `Purchases, free trials, credits given back and changes with a note are fine and not listed. ` +
            `Nothing here was changed: fix a credit in the admin dashboard if it needs it.</p>`)
    } else {
        parts.push(`<p>Every lesson logged in ${name} (${report.lessonsChecked}) matches the credit history (${credits(report.creditsTaken)} taken).</p>`)
    }
    if (u) {
        const blocks = unloggedLessonBlocks(unlogged, { now, baseUrl, withDate: true })
        parts.push(`<p style="margin:22px 0 10px"><strong>Past lessons still not logged (${u}), oldest first</strong></p>`)
        parts.push(blocks.html)
        parts.push(`<p style="color:#666;font-size:13px">Nobody logged ${u === 1 ? 'this lesson' : 'these lessons'}, so no credit was taken. ` +
            (blocks.buttons
                ? `<b>Log it</b> if it happened: that takes 1 credit, with optional notes and homework on its page ` +
                  `(a lesson over a week old is logged quietly: no email to the family, no next lesson booked). ` +
                  `<b>Didn't happen</b> removes it quietly: no credit, nobody is told. ${MISSED_IT_NOTE} ` +
                  `Each button asks you to confirm, works once, and expires in ${LINK_TTL_DAYS} days.`
                : `Log or remove ${u === 1 ? 'it' : 'them'} in the <a href="${baseUrl}/admin">admin dashboard</a>.`) +
            `</p>`)
    }

    return {
        subject,
        lines,
        html: parts.join('\n'),
        footer: `This email comes on the 1st only when something doesn't match or a past lesson is still unlogged.`,
    }
}

/**
 * Emails the studio inbox when the month has mismatches or past lessons are
 * still unlogged. No email when both are clean.
 */
export async function alertCreditCheck(client: DbClient, report: CreditCheckReport, unlogged: UnloggedLesson[] = []): Promise<boolean> {
    if (report.findings.length === 0 && unlogged.length === 0) return false
    return sendCronAlert(client, buildCreditCheckEmail(report, unlogged))
}
