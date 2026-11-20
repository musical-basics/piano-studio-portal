import type { DbClient } from '@/lib/supabase/admin'
import { isoToStudioWallClock, shiftDateStr, studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { appBaseUrl } from '@/lib/lesson-action-links'
import { isClassroomVideoUrl } from '@/lib/classroom-video-url'

/**
 * Lessons the portal logged by itself on a given studio day (Lionel's #793):
 * the morning email lists them next to the unlogged ones, so a wrong charge is
 * caught before the family notices. Logging takes the credit, and the family
 * gets the usual lesson email straight away, so this list is the only place
 * Lionel sees those charges without opening admin.
 *
 * "Automatically" means a log nobody pressed a button for, told apart by
 * lessons.completed_source:
 *   - zoom_webhook: Zoom's recording webhook (5+ minute recording and,
 *                   since #1070, the student 10+ minutes in the meeting);
 *   - system:       the classroom hand-off (#537, a 20+ minute classroom
 *                   video), or the old credit-repair route;
 *   - agent_log:    an assistant through the agent API (Elephant logs as
 *                   admin_ui, since Lionel pressed the button there);
 *   - classroom_attendance: Lionel and the student in the classroom together
 *                   20+ minutes (#795, lib/classroom-attendance.ts).
 * admin_ui (admin, the email buttons, Elephant) is Lionel's own log and is
 * left out.
 *
 * "Yesterday" is the day the log happened (Eastern), taken from the ledger row
 * the log wrote: the credit change matching the lesson's before/after
 * snapshots. So each charge is listed once, and a classroom video that logs a
 * lesson from three days earlier still shows up. A log with no such ledger row
 * (free, or no credit recorded) has no time, so it is listed under its lesson's
 * own date.
 */

export type AutoLogSource = 'zoom' | 'classroom' | 'attendance' | 'assistant' | 'portal'

export const AUTO_LOG_SOURCES = ['zoom_webhook', 'system', 'agent_log', 'classroom_attendance'] as const

export type AutoLoggedLesson = {
    id: string
    studentId: string
    studentName: string
    date: string
    time: string
    duration: number
    by: AutoLogSource
    /** When the credit was taken (ms), null when no ledger row matches. */
    loggedAtMs: number | null
    before: number | null
    after: number | null
    /** Logged free (#756), no credit taken. */
    free: boolean
}

/** The classroom hand-off can log a lesson up to 7 days old; a little slack on top. */
const LOOKBACK_DAYS = 10
/** A log can come a little before the scheduled start (early lessons). */
const EARLY_MS = 2 * 60 * 60 * 1000

/** On R2 or, after 60 days, moved to its Dropbox copy (#1020). */
const classroomVideo = isClassroomVideoUrl

export function autoLogSource(completedSource: string | null, videoUrl: string | null): AutoLogSource | null {
    switch (completedSource) {
        case 'zoom_webhook': return 'zoom'
        case 'system': return classroomVideo(videoUrl) ? 'classroom' : 'portal'
        case 'agent_log': return 'assistant'
        case 'classroom_attendance': return 'attendance'
        default: return null
    }
}

export const AUTO_LOG_LABEL: Record<AutoLogSource, string> = {
    zoom: 'Zoom recording',
    classroom: 'classroom video',
    attendance: 'attendance (you and the student in the classroom 20+ min)',
    assistant: 'an assistant (agent API)',
    portal: 'the portal (credit repair)',
}

/** Every lesson the portal logged by itself during `date` (Eastern). Read-only. */
export async function findAutoLoggedLessons(client: DbClient, date: string): Promise<AutoLoggedLesson[]> {
    const dayStartMs = Date.parse(studioWallClockToISO(date, '00:00'))
    const dayEndMs = Date.parse(studioWallClockToISO(shiftDateStr(date, 1), '00:00'))

    const { data: lessons, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, completed_source, credit_snapshot_before, credit_snapshot, free_reason, video_url')
        .eq('status', 'completed')
        .in('completed_source', [...AUTO_LOG_SOURCES])
        .gte('date', shiftDateStr(date, -LOOKBACK_DAYS))
        .lte('date', shiftDateStr(date, 1))
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    if (!lessons || lessons.length === 0) return []

    const studentIds = [...new Set(lessons.map(l => l.student_id as string))]
    const { data: students, error: studentError } = await client
        .from('profiles')
        .select('id, name, credits')
        .in('id', studentIds)
    if (studentError) throw new Error(`profiles query failed: ${studentError.message}`)
    const byId = new Map((students || []).map(s => [s.id as string, s]))

    const { data: ledger, error: ledgerError } = await client
        .from('credit_transactions')
        .select('id, student_id, previous_credits, new_credits, changed_at')
        .in('student_id', studentIds)
        .gte('changed_at', new Date(Date.parse(studioWallClockToISO(shiftDateStr(date, -LOOKBACK_DAYS), '00:00')) - EARLY_MS).toISOString())
        .order('changed_at', { ascending: true })
    if (ledgerError) throw new Error(`credit_transactions query failed: ${ledgerError.message}`)

    const startMs = (l: { date: string; time: string }) => Date.parse(studioWallClockToISO(l.date, String(l.time).slice(0, 5)))
    const ordered = [...lessons].sort((a, b) => startMs(a) - startMs(b))
    const used = new Set<string>()
    const found: AutoLoggedLesson[] = []

    for (const l of ordered) {
        const student = byId.get(l.student_id as string)
        if (isUntrackedTeacherAccount(student)) continue
        const by = autoLogSource(l.completed_source as string | null, l.video_url as string | null)
        if (!by) continue
        const before = l.credit_snapshot_before as number | null
        const after = l.credit_snapshot as number | null
        const free = l.free_reason !== null && l.free_reason !== undefined
        const start = startMs(l)

        // The credit change this log wrote: same student, same balances, at or after the start.
        let loggedAtMs: number | null = null
        if (before !== null && after !== null && before !== after) {
            const row = (ledger || []).find(r =>
                !used.has(r.id as string) && r.student_id === l.student_id &&
                r.previous_credits === before && r.new_credits === after &&
                Date.parse(r.changed_at as string) >= start - EARLY_MS)
            if (row) {
                used.add(row.id as string)
                loggedAtMs = Date.parse(row.changed_at as string)
            }
        }

        const inDay = loggedAtMs !== null
            ? loggedAtMs >= dayStartMs && loggedAtMs < dayEndMs
            : l.date === date
        if (!inDay) continue

        found.push({
            id: l.id as string,
            studentId: l.student_id as string,
            studentName: (student?.name as string) || 'Unknown student',
            date: l.date as string,
            time: String(l.time).slice(0, 5),
            duration: (l.duration as number) || 60,
            by,
            loggedAtMs,
            before,
            after,
            free,
        })
    }
    return found.sort((a, b) => (a.loggedAtMs ?? startMs(a)) - (b.loggedAtMs ?? startMs(b)))
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function clock(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

function shortDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Admin opens on that day's schedule (#793), where the lesson and its buttons are. */
export function adminDayUrl(date: string, baseUrl: string = appBaseUrl()): string {
    return `${baseUrl}/admin?day=${encodeURIComponent(date)}`
}

export function creditText(l: Pick<AutoLoggedLesson, 'before' | 'after' | 'free'>): string {
    if (l.free) return 'logged free, no credit taken'
    if (l.before === null || l.after === null) return 'no credit change recorded on the lesson'
    if (l.before === l.after) return `no credit taken (${l.after} left)`
    const below = l.after < 0 ? ', now below zero' : ''
    return `credit ${l.before} → ${l.after}${below}`
}

/** One auto-logged lesson as an email line (HTML-escaped). */
export function describeAutoLogged(l: AutoLoggedLesson, date: string): string {
    const zone = studioTzAbbr(studioWallClockToISO(l.date, l.time))
    const otherDay = l.date !== date ? `${shortDay(l.date)}, ` : ''
    const at = l.loggedAtMs !== null ? ` at ${clock(isoToStudioWallClock(new Date(l.loggedAtMs).toISOString()).localTime)}` : ''
    return `${escapeHtml(l.studentName)}: ${otherDay}${clock(l.time)} ${zone}, ${l.duration} min. ` +
        `Logged by ${AUTO_LOG_LABEL[l.by]}${at}, ${creditText(l)}.`
}

const LINK_STYLE = 'display:inline-block;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;background:#ffffff;color:#1d4ed8;border:1px solid #1d4ed8'

/** The email section (#793). Empty string when nothing was logged automatically. */
export function autoLoggedSection(
    lessons: AutoLoggedLesson[],
    date: string,
    { baseUrl = appBaseUrl() }: { baseUrl?: string } = {},
): { lines: string[]; html: string } {
    if (lessons.length === 0) return { lines: [], html: '' }
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    const lines = lessons.map(l => describeAutoLogged(l, date))
    const blocks = lessons.map((l, i) => `<div style="margin:0 0 12px;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px">
<div style="font-size:15px;margin:0 0 8px">${lines[i]}</div>
<a href="${escapeHtml(adminDayUrl(l.date, baseUrl))}" style="${LINK_STYLE}">Open in admin</a>
</div>`)
    const n = lessons.length
    const html = `<h3 style="font-size:16px;margin:20px 0 6px">Logged automatically ${escapeHtml(day)} (${n})</h3>
<p style="color:#57534e;font-size:14px;margin:0 0 10px">Nobody pressed a button for these. Logging takes the credit and emails the family the usual lesson notes, so if one looks wrong, open it in admin.</p>
${blocks.join('\n')}`
    return { lines, html }
}
