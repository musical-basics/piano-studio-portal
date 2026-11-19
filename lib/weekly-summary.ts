import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { shiftDateStr, studioToday, studioWallClockToISO, weekdayOfDateStr, STUDIO_TZ } from '@/lib/studio-timezone'
import { UNLOGGED_STATUSES, formatClock } from '@/lib/unlogged-lessons'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { listClassroomRecordingsForAdmin, UUID_RE } from '@/lib/classroom-recordings'

/**
 * Monday morning summary of last week, for Lionel only (#754): one email to the
 * studio inbox every Monday at 8:30am Eastern. Lessons held and whether each was
 * logged (and by what), videos on those lessons, classroom recordings that
 * matched no lesson, credits used and added, and active families down to 0
 * lessons. No family is emailed; it replaces none of the daily emails.
 *
 * "Last week" is Monday to Sunday in the studio's zone, before the run. The two
 * teacher accounts (isUntrackedTeacherAccount) and the test account (status
 * 'other', "Test / Teacher" in the roster) are left out everywhere.
 */

export type SummaryLesson = { date: string; time: string; name: string; status: string }

export type WeeklySummary = {
    weekStart: string
    weekEnd: string
    /** "Nov 9 to 15" */
    label: string
    lessons: {
        held: number
        logged: number
        unlogged: SummaryLesson[]
        /** How the logged ones were logged. */
        loggedBy: { zoom: number; classroom: number; attendance: number; you: number; assistant: number; repair: number; unknown: number }
    }
    videos: {
        zoom: number
        classroom: number
        other: number
        /** Logged lessons with no video on them. */
        loggedWithout: number
        /** Classroom recordings from that week that fit no lesson. */
        unmatched: { name: string; recordedAt: string; minutes: number | null }[]
    }
    credits: {
        used: number
        added: number
        additions: { name: string; delta: number; at: string; label: string | null }[]
    }
    /** Active families at 0 lessons or below. */
    zeroFamilies: { name: string; credits: number; nextPayment: string | null; perPayment: number | null; planEnds: string | null }[]
}

/** Monday (YYYY-MM-DD) of the week holding this date. */
export function mondayOf(date: string): string {
    return shiftDateStr(date, -((weekdayOfDateStr(date) + 6) % 7))
}

/** The Monday of last week, seen from today in the studio's zone. */
export function lastWeekMonday(today: string = studioToday()): string {
    return shiftDateStr(mondayOf(today), -7)
}

function dayLabel(date: string, opts: Intl.DateTimeFormatOptions): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}

function weekLabel(start: string, end: string): string {
    const a = dayLabel(start, { month: 'short', day: 'numeric' })
    const sameMonth = start.slice(0, 7) === end.slice(0, 7)
    return `${a} to ${sameMonth ? dayLabel(end, { day: 'numeric' }) : dayLabel(end, { month: 'short', day: 'numeric' })}`
}

function studioDay(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: STUDIO_TZ })
}

function isTestEntry(row: { source: string | null; note: string | null }): boolean {
    return row.source === 'test cleanup' || /^test\b/i.test(row.note || '')
}

type Profile = { id: string; name: string | null; credits: number | null; status: string | null; stripe_customer_id: string | null }

export async function buildWeeklySummary(
    client: DbClient,
    weekStart: string,
    { now = new Date(), stripeLookup = nextPaymentFromStripe }: {
        now?: Date
        /** Next payment for a Stripe customer; injectable so dry runs and tests can skip Stripe. */
        stripeLookup?: (customerId: string) => Promise<{ nextPayment: string | null; perPayment: number | null; planEnds: string | null } | null>
    } = {},
): Promise<WeeklySummary> {
    const monday = mondayOf(weekStart)
    const sunday = shiftDateStr(monday, 6)
    const startIso = studioWallClockToISO(monday, '00:00')
    const endIso = studioWallClockToISO(shiftDateStr(monday, 7), '00:00')

    const { data: profileRows, error: profileError } = await client
        .from('profiles')
        .select('id, name, credits, status, stripe_customer_id')
        .eq('role', 'student')
    if (profileError) throw new Error(`profiles query failed: ${profileError.message}`)
    const profiles = new Map(((profileRows || []) as Profile[]).map(p => [p.id, p]))
    // Left out: the teacher accounts, and every "Test / Teacher" account (status
    // 'other', which the roster also keeps out of the schedule and counts).
    const tracked = (id: string) => {
        const p = profiles.get(id)
        return !!p && p.status !== 'other' && !isUntrackedTeacherAccount(p)
    }
    const nameOf = (id: string) => profiles.get(id)?.name?.trim() || 'Unknown student'

    // ---- Lessons that week (that have started by now).
    const { data: lessonRows, error: lessonError } = await client
        .from('lessons')
        .select('id, student_id, date, time, status, completed_source, video_url')
        .gte('date', monday)
        .lte('date', sunday)
        .neq('status', 'cancelled')
        .order('date', { ascending: true })
        .order('time', { ascending: true })
    if (lessonError) throw new Error(`lessons query failed: ${lessonError.message}`)
    const lessons = (lessonRows || []).filter(l =>
        tracked(l.student_id) && Date.parse(studioWallClockToISO(l.date, String(l.time).slice(0, 5))) <= now.getTime())

    const loggedBy = { zoom: 0, classroom: 0, attendance: 0, you: 0, assistant: 0, repair: 0, unknown: 0 }
    const videos = { zoom: 0, classroom: 0, other: 0, loggedWithout: 0 }
    const unlogged: SummaryLesson[] = []
    let logged = 0
    for (const l of lessons) {
        const url: string = l.video_url || ''
        const classroomVideo = /r2\.dev|r2\.cloudflarestorage/i.test(url)
        if (url) {
            if (classroomVideo) videos.classroom++
            else if (/dropbox/i.test(url)) videos.zoom++
            else videos.other++
        }
        if (UNLOGGED_STATUSES.includes(l.status)) {
            unlogged.push({ date: l.date, time: String(l.time).slice(0, 5), name: nameOf(l.student_id), status: l.status })
            continue
        }
        logged++
        if (!url) videos.loggedWithout++
        switch (l.completed_source) {
            case 'zoom_webhook': loggedBy.zoom++; break
            // 'system' is the classroom auto-log, and also the old credit-repair route.
            case 'system': if (classroomVideo) loggedBy.classroom++; else loggedBy.repair++; break
            case 'classroom_attendance': loggedBy.attendance++; break
            case 'admin_ui': loggedBy.you++; break
            case 'agent_log': loggedBy.assistant++; break
            default: loggedBy.unknown++
        }
    }

    // ---- Classroom recordings from that week that fit no lesson.
    const recordings = await listClassroomRecordingsForAdmin(client)
    const unmatched = recordings
        .filter(r => r.recordedAt >= startIso && r.recordedAt < endIso)
        .filter(r => UUID_RE.test(r.studentId) && tracked(r.studentId))
        .filter(r => r.status.kind === 'no_lesson')
        .map(r => ({ name: nameOf(r.studentId), recordedAt: r.recordedAt, minutes: r.minutes === null ? null : Math.round(r.minutes) }))
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))

    // ---- Credits: every change that week, from the ledger.
    const { data: ledger, error: ledgerError } = await client
        .from('credit_transactions')
        .select('student_id, delta, source, note, changed_at')
        .gte('changed_at', startIso)
        .lt('changed_at', endIso)
        .order('changed_at', { ascending: true })
    if (ledgerError) throw new Error(`credit_transactions query failed: ${ledgerError.message}`)
    let used = 0
    let added = 0
    const additions: WeeklySummary['credits']['additions'] = []
    for (const row of ledger || []) {
        if (!tracked(row.student_id) || isTestEntry(row)) continue
        const delta = Number(row.delta) || 0
        if (delta < 0) used += -delta
        if (delta > 0) {
            added += delta
            additions.push({ name: nameOf(row.student_id), delta, at: row.changed_at, label: row.source || null })
        }
    }

    // ---- Active families at 0 or below (as of now).
    const zero = [...profiles.values()]
        .filter(p => p.status === 'active' && Number(p.credits ?? 0) <= 0 && tracked(p.id))
        .sort((a, b) => Number(a.credits ?? 0) - Number(b.credits ?? 0))
    const zeroFamilies = await Promise.all(zero.map(async p => {
        const plan = p.stripe_customer_id ? await stripeLookup(p.stripe_customer_id).catch(() => null) : null
        return {
            name: p.name?.trim() || 'Unknown student',
            credits: Number(p.credits ?? 0),
            nextPayment: plan?.nextPayment ?? null,
            perPayment: plan?.perPayment ?? null,
            planEnds: plan?.planEnds ?? null,
        }
    }))

    return {
        weekStart: monday,
        weekEnd: sunday,
        label: weekLabel(monday, sunday),
        lessons: { held: lessons.length, logged, unlogged, loggedBy },
        videos: { ...videos, unmatched },
        credits: { used, added, additions },
        zeroFamilies,
    }
}

/**
 * The family's running monthly plan, read from Stripe the same way the student
 * page does (getSubscriptionSummary): next payment date and credits per payment,
 * or when a capped plan ends. Null without a running subscription.
 */
export async function nextPaymentFromStripe(customerId: string): Promise<{ nextPayment: string | null; perPayment: number | null; planEnds: string | null } | null> {
    const { stripe } = await import('@/lib/stripe')
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })
    const running = subs.data.find(sub => ['active', 'trialing', 'past_due'].includes(sub.status))
    if (!running) return null
    const item = running.items.data[0] as any
    const periodEndUnix: number | undefined = item?.current_period_end ?? (running as any).current_period_end
    const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null
    const windingDown = running.cancel_at_period_end || Boolean(running.cancel_at)
    const cancelAt = running.cancel_at ? new Date(running.cancel_at * 1000).toISOString() : null
    return {
        nextPayment: windingDown ? null : periodEnd,
        perPayment: Number(running.metadata?.credits) || null,
        planEnds: windingDown ? (cancelAt ?? periodEnd) : null,
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`
}

const H = 'font-size:16px;margin:18px 0 6px;padding-top:10px;border-top:1px solid #e5e7eb'
const P = 'font-size:15px;margin:4px 0;line-height:1.45'
const UL = 'font-size:15px;margin:4px 0 4px;padding-left:20px;line-height:1.45'
const MUTED = 'font-size:13px;color:#555;margin:4px 0'

export function weeklySummarySubject(s: WeeklySummary): string {
    const n = s.lessons.unlogged.length
    return `Last week at the studio: ${plural(s.lessons.held, 'lesson')}, ${n === 0 ? 'all logged' : `${n} not logged`}`
}

export function renderWeeklySummary(s: WeeklySummary): { subject: string; html: string; footer: string } {
    const L = s.lessons
    const by = L.loggedBy
    const byParts = [
        by.zoom && `Zoom ${by.zoom}`,
        by.classroom && `classroom (automatic) ${by.classroom}`,
        by.attendance && `classroom attendance (automatic) ${by.attendance}`,
        by.you && `you ${by.you}`,
        by.assistant && `your assistant ${by.assistant}`,
        by.repair && `credit repair ${by.repair}`,
        by.unknown && `not recorded ${by.unknown}`,
    ].filter(Boolean)

    const parts: string[] = []
    parts.push(`<p style="${MUTED}">Mon ${escapeHtml(s.label)} (Eastern)</p>`)

    parts.push(`<h3 style="${H}">Lessons</h3>`)
    parts.push(`<p style="${P}">${plural(L.held, 'lesson')} held, ${L.logged} logged${L.unlogged.length ? `, <b>${L.unlogged.length} not logged</b>` : ''}.</p>`)
    if (L.unlogged.length) {
        parts.push(`<ul style="${UL}">${L.unlogged.map(u =>
            `<li>${escapeHtml(u.name)}: ${dayLabel(u.date, { weekday: 'short', month: 'short', day: 'numeric' })}, ${formatClock(u.time)}${u.status === 'logging' ? ' (logging started, never finished)' : ''}</li>`).join('')}</ul>`)
    }
    if (byParts.length) parts.push(`<p style="${P}">Logged by: ${byParts.join(', ')}.</p>`)

    const V = s.videos
    parts.push(`<h3 style="${H}">Videos</h3>`)
    const onLessons = V.zoom + V.classroom + V.other
    parts.push(`<p style="${P}">${plural(onLessons, 'lesson')} with a video: ${V.zoom} Zoom, ${V.classroom} classroom${V.other ? `, ${V.other} other` : ''}.`
        + `${V.loggedWithout ? ` ${plural(V.loggedWithout, 'logged lesson')} without one.` : ''}</p>`)
    if (V.unmatched.length) {
        parts.push(`<p style="${P}"><b>Classroom ${V.unmatched.length === 1 ? 'recording' : 'recordings'} that matched no lesson:</b></p>`)
        parts.push(`<ul style="${UL}">${V.unmatched.map(u => {
            const wall = new Date(u.recordedAt)
            const clock = wall.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: STUDIO_TZ }).replace(' ', '').toLowerCase()
            return `<li>${escapeHtml(u.name)}: ${studioDay(u.recordedAt)}, ${clock}${u.minutes !== null ? `, ${u.minutes} min` : ''}</li>`
        }).join('')}</ul>`)
        parts.push(`<p style="${MUTED}">Attach them from Admin, Classroom recordings.</p>`)
    }

    const C = s.credits
    parts.push(`<h3 style="${H}">Credits</h3>`)
    parts.push(`<p style="${P}">Used: ${C.used}. Added: ${C.added}.</p>`)
    if (C.additions.length) {
        parts.push(`<ul style="${UL}">${C.additions.map(a =>
            `<li>${escapeHtml(a.name)}: +${a.delta}, ${studioDay(a.at)}${a.label ? ` (${escapeHtml(a.label)})` : ''}</li>`).join('')}</ul>`)
    }

    parts.push(`<h3 style="${H}">Families at 0 lessons</h3>`)
    if (s.zeroFamilies.length === 0) {
        parts.push(`<p style="${P}">None. Every active family has lessons left.</p>`)
    } else {
        parts.push(`<ul style="${UL}">${s.zeroFamilies.map(f => {
            const plan = f.nextPayment
                ? `, next payment ${studioDay(f.nextPayment)}${f.perPayment ? ` (+${f.perPayment})` : ''}`
                : f.planEnds ? `, plan ended or ends ${studioDay(f.planEnds)}` : ''
            return `<li>${escapeHtml(f.name)}: ${f.credits} lessons${plan}</li>`
        }).join('')}</ul>`)
        parts.push(`<p style="${MUTED}">Balance as of this morning.</p>`)
    }

    return {
        subject: weeklySummarySubject(s),
        html: parts.join('\n'),
        footer: 'Sent every Monday at 8:30am Eastern by the portal (/api/cron/weekly-summary), only to you. No family gets it, and the daily emails come as usual. Teacher and test accounts are left out.',
    }
}

/** Emails the summary to the studio inbox. Returns whether it went out. */
export async function sendWeeklySummary(client: DbClient, summary: WeeklySummary): Promise<boolean> {
    const { subject, html, footer } = renderWeeklySummary(summary)
    return sendCronAlert(client, { subject, lines: [], html, footer })
}
