import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'

/**
 * Lessons from a given studio day that nobody logged. A lesson takes its credit
 * only when it is logged (Zoom's webhook does it for lessons it recorded for 5+
 * minutes; everything else is logged by hand), so an unlogged lesson silently
 * costs the student nothing. In Nov 2026 eleven of them were found going back to
 * the previous December. Decision #426: email the studio each morning about
 * yesterday's, so none sits unnoticed again.
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
const UNLOGGED = ['scheduled', 'logging']

export async function findUnloggedLessons(client: DbClient, date: string): Promise<UnloggedLesson[]> {
    const { data: lessons, error } = await client
        .from('lessons')
        .select('id, date, time, duration, status, student_id')
        .eq('date', date)
        .in('status', UNLOGGED)
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

/** Emails the studio inbox about the day's unlogged lessons. No email when there are none. */
export async function alertUnloggedLessons(client: DbClient, date: string, lessons: UnloggedLesson[]): Promise<boolean> {
    if (lessons.length === 0) return false
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
    const n = lessons.length
    const admin = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'}/admin`
    return sendCronAlert(client, {
        subject: `${n} lesson${n === 1 ? '' : 's'} from ${day} not logged yet`,
        lines: lessons.map(describeUnlogged),
        footer: `Nobody logged ${n === 1 ? 'this lesson' : 'these lessons'}, so no credit was taken. If it happened, log it in the <a href="${admin}">admin dashboard</a> (that takes the credit). If it didn't, cancel it there. This email comes only on mornings with something unlogged.`,
    })
}
