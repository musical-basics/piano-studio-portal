import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import { LINK_TTL_DAYS, appBaseUrl, lessonActionUrl, signLessonAction } from '@/lib/lesson-action-links'

/**
 * Lessons from a given studio day that nobody logged. A lesson takes its credit
 * only when it is logged (Zoom's webhook does it for lessons it recorded for 5+
 * minutes; everything else is logged by hand), so an unlogged lesson silently
 * costs the student nothing. In Nov 2026 eleven of them were found going back to
 * the previous December. Decision #426: email the studio each morning about
 * yesterday's, so none sits unnoticed again.
 *
 * Each lesson in the email carries two one-time buttons (#441): "Log it" and
 * "Didn't happen" (see app/api/lesson-action).
 */

export type UnloggedLesson = {
    id: string
    date: string
    time: string
    duration: number
    status: string
    studentName: string
    accountStatus: string | null
}

// Statuses a lesson has before it is logged. 'logging' is a log that started and
// never finished, which still took no credit.
export const UNLOGGED_STATUSES = ['scheduled', 'logging']

export async function findUnloggedLessons(client: DbClient, date: string): Promise<UnloggedLesson[]> {
    const { data: lessons, error } = await client
        .from('lessons')
        .select('id, date, time, duration, status, student_id')
        .eq('date', date)
        .in('status', UNLOGGED_STATUSES)
        .order('time', { ascending: true })
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    if (!lessons || lessons.length === 0) return []

    const ids = [...new Set(lessons.map(l => l.student_id as string))]
    const { data: students, error: studentError } = await client
        .from('profiles')
        .select('id, name, status')
        .in('id', ids)
    if (studentError) throw new Error(`profiles query failed: ${studentError.message}`)
    const byId = new Map((students || []).map(s => [s.id as string, s]))

    return lessons.map(l => {
        const s = byId.get(l.student_id as string)
        return {
            id: l.id as string,
            date: l.date as string,
            time: String(l.time).slice(0, 5),
            duration: (l.duration as number) || 60,
            status: l.status as string,
            studentName: (s?.name as string) || 'Unknown student',
            accountStatus: (s?.status as string) ?? null,
        }
    })
}

export function formatClock(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function describeUnlogged(lesson: UnloggedLesson): string {
    const zone = studioTzAbbr(studioWallClockToISO(lesson.date, lesson.time))
    const account = lesson.accountStatus && lesson.accountStatus !== 'active' ? ` (account: ${lesson.accountStatus})` : ''
    const half = lesson.status === 'logging' ? ', logging started but never finished' : ''
    return `${escapeHtml(lesson.studentName)}${account}: ${formatClock(lesson.time)} ${zone}, ${lesson.duration} min${half}`
}

const BUTTON = 'display:inline-block;padding:11px 18px;margin:0 8px 6px 0;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;line-height:1.2'
const LOG_STYLE = `${BUTTON};background:#15803d;color:#ffffff;border:1px solid #15803d`
const REMOVE_STYLE = `${BUTTON};background:#ffffff;color:#b91c1c;border:1px solid #b91c1c`

/**
 * Subject, body and footer of the unlogged-lessons email, without sending it,
 * so a dry run can render exactly what would go out.
 */
export function buildUnloggedEmail(
    date: string,
    lessons: UnloggedLesson[],
    { now = new Date(), baseUrl = appBaseUrl() }: { now?: Date; baseUrl?: string } = {},
): { subject: string; lines: string[]; html: string; footer: string; buttons: boolean } {
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
    const n = lessons.length
    const subject = `${n} lesson${n === 1 ? '' : 's'} from ${day} not logged yet`
    const lines = lessons.map(describeUnlogged)

    let buttons = true
    const blocks = lessons.map((lesson, i) => {
        const log = signLessonAction({ lessonId: lesson.id, action: 'log', date: lesson.date, time: lesson.time }, now)
        const remove = signLessonAction({ lessonId: lesson.id, action: 'remove', date: lesson.date, time: lesson.time }, now)
        if (!log || !remove) {
            buttons = false
            return `<li>${lines[i]}</li>`
        }
        return `<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px">
<div style="font-size:15px;margin:0 0 10px">${lines[i]}</div>
<a href="${escapeHtml(lessonActionUrl(log, baseUrl))}" style="${LOG_STYLE}">Log it</a><a href="${escapeHtml(lessonActionUrl(remove, baseUrl))}" style="${REMOVE_STYLE}">Didn't happen</a>
</div>`
    })
    const html = buttons ? blocks.join('\n') : `<ul>${blocks.join('')}</ul>`

    const admin = `${baseUrl}/admin`
    const these = n === 1 ? 'this lesson' : 'these lessons'
    const when = 'This email comes only on mornings with something unlogged.'
    const footer = buttons
        ? `Nobody logged ${these}, so no credit was taken. <b>Log it</b> if it happened: that takes 1 credit, the usual log. <b>Didn't happen</b> removes it quietly: no credit, nobody is told. Each button asks you to confirm, works once, and expires in ${LINK_TTL_DAYS} days. The <a href="${admin}">admin dashboard</a> works too. ${when}`
        : `Nobody logged ${these}, so no credit was taken. If it happened, log it in the <a href="${admin}">admin dashboard</a> (that takes the credit). If it didn't, cancel it there. ${when}`

    return { subject, lines, html, footer, buttons }
}

/** Emails the studio inbox about the day's unlogged lessons. No email when there are none. */
export async function alertUnloggedLessons(
    client: DbClient,
    date: string,
    lessons: UnloggedLesson[],
): Promise<boolean> {
    if (lessons.length === 0) return false
    const { subject, lines, html, footer } = buildUnloggedEmail(date, lessons)
    return sendCronAlert(client, { subject, lines, html, footer })
}
