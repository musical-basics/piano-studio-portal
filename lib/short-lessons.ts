import type { DbClient } from '@/lib/supabase/admin'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import { appBaseUrl } from '@/lib/lesson-action-links'
import { adminDayUrl } from '@/lib/auto-logged-lessons'

/**
 * Zoom lessons that ran much shorter than booked (Lionel's #966), for the
 * morning email, so a cut-short lesson is not charged as a full one without
 * him noticing. Read from the attendance the portal saves after each Zoom
 * lesson (#965, zoom_lesson_attendance): a lesson ran short when the time
 * Lionel and the student were in the meeting together is under half the
 * booked length. When Lionel's own account never joined, the student's own
 * minutes stand in.
 *
 * Left out: lessons with no saved attendance, Zoom only having a later use of
 * the meeting link ("later_use"), no-shows (the student never really joined;
 * the No-show tools cover those), and lessons with a classroom video made in
 * their slot (the lesson went on in the classroom, which Zoom cannot see).
 */

/** Ran short: together for under this share of the booked time. */
export const SHORT_SHARE = 0.5

export type ShortLesson = {
    id: string
    date: string
    time: string // HH:MM, studio wall clock
    duration: number // booked minutes
    studentName: string
    /** Seconds together (or the student's own when Lionel's account never joined). */
    seconds: number
    measure: 'together' | 'student'
    logged: boolean
    free: boolean
}

type AttendanceRow = { lesson_id: string; status: string; kind: string | null; overlap_seconds: number | null; student_seconds: number | null; teacher_seconds: number | null }

/** The time to compare with the booking, or null when the row says nothing about a lesson that ran. Pure. */
export function timeTogether(row: AttendanceRow): { seconds: number; measure: 'together' | 'student' } | null {
    if (row.status !== 'saved') return null
    if (row.kind === 'student_joined') return { seconds: Number(row.overlap_seconds) || 0, measure: 'together' }
    if (row.kind === 'host_absent') return { seconds: Number(row.student_seconds) || 0, measure: 'student' }
    return null
}

export function ranShort(seconds: number, bookedMinutes: number): boolean {
    return seconds < bookedMinutes * 60 * SHORT_SHARE
}

/** A day's Zoom lessons that ran short, logged or not, in time order. */
export async function findShortLessons(client: DbClient, date: string): Promise<ShortLesson[]> {
    const { data: lessons, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, status, free_reason, zoom_meeting_id')
        .eq('date', date)
        .not('zoom_meeting_id', 'is', null)
        .order('time', { ascending: true })
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    if (!lessons?.length) return []

    const ids = lessons.map(l => l.id as string)
    const { data: rows, error: aError } = await client
        .from('zoom_lesson_attendance')
        .select('lesson_id, status, kind, overlap_seconds, student_seconds, teacher_seconds')
        .in('lesson_id', ids)
    if (aError) throw new Error(`zoom_lesson_attendance query failed: ${aError.message}`)
    const byLesson = new Map(((rows ?? []) as AttendanceRow[]).map(r => [r.lesson_id, r]))

    const studentIds = [...new Set(lessons.map(l => l.student_id as string))]
    const { data: profiles, error: pError } = await client.from('profiles').select('id, name, credits, lesson_duration').in('id', studentIds)
    if (pError) throw new Error(`profiles query failed: ${pError.message}`)
    const profileById = new Map((profiles ?? []).map(p => [p.id as string, p]))

    const short: ShortLesson[] = []
    for (const l of lessons) {
        const p = profileById.get(l.student_id as string)
        if (isUntrackedTeacherAccount(p)) continue
        const row = byLesson.get(l.id as string)
        const t = row ? timeTogether(row) : null
        if (!t) continue
        const duration = Number(l.duration) || Number(p?.lesson_duration) || 60
        if (!ranShort(t.seconds, duration)) continue
        short.push({
            id: l.id as string,
            date: l.date as string,
            time: String(l.time).slice(0, 5),
            duration,
            studentName: (p?.name as string) || 'Unknown student',
            seconds: t.seconds,
            measure: t.measure,
            logged: l.status === 'completed',
            free: l.status === 'completed' && typeof l.free_reason === 'string',
        })
    }
    if (short.length === 0) return short

    // A classroom video made in the slot: the lesson went on there, Zoom saw only part of it.
    const starts = short.map(s => Date.parse(studioWallClockToISO(s.date, s.time)))
    const ends = short.map((s, i) => starts[i] + s.duration * 60_000)
    const { data: recs, error: rError } = await client
        .from('classroom_recordings')
        .select('student_id, created_at')
        .in('student_id', studentIds)
        .gte('created_at', new Date(Math.min(...starts) - 30 * 60_000).toISOString())
        .lte('created_at', new Date(Math.max(...ends) + 3 * 60 * 60_000).toISOString())
    if (rError) throw new Error(`classroom_recordings query failed: ${rError.message}`)
    const studentOf = new Map(lessons.map(l => [l.id as string, l.student_id as string]))
    return short.filter((s, i) => !(recs ?? []).some(r => {
        const at = Date.parse(r.created_at as string)
        return r.student_id === studentOf.get(s.id) && at >= starts[i] - 30 * 60_000 && at <= ends[i] + 3 * 60 * 60_000
    }))
}

// -------------------------------------------------------------- words ---

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function clock(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}

const minutes = (s: number) => (s > 0 && s < 60 ? 'under 1 min' : `${Math.round(s / 60)} min`)

/** "Amy: 8:30pm EST, booked 30 min, together 3 min. Logged, took a credit." */
export function describeShortLesson(s: ShortLesson): string {
    const time = s.measure === 'together'
        ? `together ${minutes(s.seconds)}`
        : `the student ${minutes(s.seconds)} (your account never joined)`
    const logged = !s.logged ? 'Not logged, no credit taken.' : s.free ? 'Logged as free, no credit taken.' : '<b>Logged, took a credit.</b>'
    return `${escapeHtml(s.studentName)}: ${clock(s.time)} ${studioTzAbbr(s.date)}, booked ${s.duration} min, ${time}. ${logged}`
}

const LINK_STYLE = 'display:inline-block;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;background:#ffffff;color:#1d4ed8;border:1px solid #1d4ed8'

/** The "Ran short" section of the morning email, empty when none ran short. */
export function shortLessonsSection(
    lessons: ShortLesson[],
    { baseUrl = appBaseUrl() }: { baseUrl?: string } = {},
): { lines: string[]; html: string; subject: string } {
    if (lessons.length === 0) return { lines: [], html: '', subject: '' }
    const lines = lessons.map(describeShortLesson)
    const blocks = lessons.map((l, i) => `<div style="margin:0 0 12px;padding:10px 14px;border:1px solid #fcd34d;border-radius:8px;background:#fffbeb">
<div style="font-size:15px;margin:0 0 8px">${lines[i]}</div>
<a href="${escapeHtml(adminDayUrl(l.date, baseUrl))}" style="${LINK_STYLE}">Open in admin</a>
</div>`)
    const n = lessons.length
    const html = `<h3 style="font-size:16px;margin:20px 0 6px">Ran short on Zoom (${n})</h3>
<p style="color:#57534e;font-size:14px;margin:0 0 10px">You and the student were in the Zoom meeting together for under half the booked time. If one was logged as a full lesson by mistake, Undo log is on the lesson in admin.</p>
${blocks.join('\n')}`
    return { lines, html, subject: `${n} ran short` }
}
