import type { DbClient } from '@/lib/supabase/admin'
import { eventLine, lessonWhen, type DayChange, type EventRow } from '@/lib/day-changes'
import { isoToStudioWallClock, shiftDateStr, studioToday } from '@/lib/studio-timezone'

/**
 * The student side panel in admin (Lionel's #1087): open any student's
 * upcoming and recent lessons, lessons left, last few messages and recent
 * lesson changes from their name anywhere in admin. `client` must be the
 * service-role client; the server action checks the caller is the admin.
 * Reads only.
 */

export type PanelLessonState = 'upcoming' | 'today' | 'logged' | 'free' | 'no_show' | 'not_logged' | 'on_hold'

export type PanelLesson = {
    id: string
    /** "Thu Nov 20, 4:30pm" (Eastern). */
    when: string
    date: string
    time: string
    duration: number
    state: PanelLessonState
    /** "5 to 4" when the log or no-show took a credit. */
    credits: string | null
    notes: string | null
    homework: string | null
    videoUrl: string | null
    onHoldReason: string | null
}

export type PanelMessage = {
    id: string
    fromStudent: boolean
    /** First 400 characters. */
    text: string
    attachments: number
    /** "Nov 19, 4:12pm" (Eastern). */
    when: string
    at: string
    unread: boolean
}

export type StudentPanelData = {
    student: {
        id: string
        name: string
        email: string | null
        status: string | null
        credits: number
        balanceDue: number
        lessonDay: string | null
        lessonTime: string | null
        venue: 'classroom' | 'zoom'
    }
    upcoming: PanelLesson[]
    recent: PanelLesson[]
    messages: PanelMessage[]
    /** Messages from them the admin has not read. */
    unread: number
    /** Their latest lesson changes, newest first (#1005 records). */
    changes: DayChange[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function clock(hhmm: string): string {
    const [h, m = '00'] = hhmm.split(':')
    const hn = parseInt(h, 10)
    return `${hn % 12 || 12}:${m.padStart(2, '0')}${hn >= 12 ? 'pm' : 'am'}`
}

function messageWhen(iso: string, today: string): string {
    const { localDate, localTime } = isoToStudioWallClock(iso)
    if (!localDate) return ''
    const d = new Date(`${localDate}T12:00:00Z`)
    const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    const year = localDate.slice(0, 4) === today.slice(0, 4) ? '' : ` ${localDate.slice(0, 4)}`
    return `${month} ${d.getUTCDate()}${year}, ${clock(localTime)}`
}

function lessonState(l: any, today: string): PanelLessonState {
    if (l.on_hold_reason) return 'on_hold'
    if (l.status === 'completed') return typeof l.free_reason === 'string' ? 'free' : 'logged'
    if (l.status === 'cancelled') return 'no_show'
    if (l.date > today) return 'upcoming'
    if (l.date === today) return 'today'
    return 'not_logged'
}

function toPanelLesson(l: any, today: string): PanelLesson {
    const before = l.credit_snapshot_before
    const after = l.credit_snapshot
    const time = String(l.time).slice(0, 5)
    return {
        id: l.id,
        when: lessonWhen(l.date, time),
        date: l.date,
        time,
        duration: Number(l.duration) || 60,
        state: lessonState(l, today),
        credits: typeof before === 'number' && typeof after === 'number' && before !== after ? `${before} to ${after}` : null,
        notes: l.notes ? String(l.notes).slice(0, 400) : null,
        homework: l.homework ? String(l.homework).slice(0, 300) : null,
        videoUrl: l.video_url || null,
        onHoldReason: l.on_hold_reason || null,
    }
}

export async function loadStudentPanel(client: DbClient, studentId: string, { today = studioToday() }: { today?: string } = {}): Promise<StudentPanelData | { error: string }> {
    if (!UUID.test(studentId)) return { error: 'Unknown student' }

    const [profileRes, upcomingRes, pastRes, messagesRes, unreadRes, eventsRes] = await Promise.all([
        client.from('profiles').select('id, name, email, status, role, credits, balance_due, lesson_day, lesson_time, lesson_venue').eq('id', studentId).maybeSingle(),
        client.from('lessons')
            .select('id, date, time, duration, status, notes, homework, video_url, credit_snapshot_before, credit_snapshot, free_reason, on_hold_reason')
            .eq('student_id', studentId).eq('status', 'scheduled').gte('date', today)
            .order('date', { ascending: true }).order('time', { ascending: true }).limit(5),
        client.from('lessons')
            .select('id, date, time, duration, status, notes, homework, video_url, credit_snapshot_before, credit_snapshot, free_reason, on_hold_reason')
            .eq('student_id', studentId).lte('date', today).gte('date', shiftDateStr(today, -400))
            .order('date', { ascending: false }).order('time', { ascending: false }).limit(8),
        client.from('messages')
            .select('id, sender_id, recipient_id, content, attachments, is_read, created_at')
            .or(`sender_id.eq.${studentId},recipient_id.eq.${studentId}`)
            .is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(5),
        client.from('messages').select('id', { count: 'exact', head: true })
            .eq('sender_id', studentId).eq('is_read', false).is('deleted_at', null),
        client.from('lesson_events')
            .select('id, lesson_id, student_id, kind, actor, lesson_date, lesson_time, detail, created_at')
            .eq('student_id', studentId).order('created_at', { ascending: false }).limit(6),
    ])

    if (profileRes.error) return { error: `Could not read the student: ${profileRes.error.message}` }
    const p = profileRes.data as any
    if (!p || p.role !== 'student') return { error: 'Student not found' }
    for (const [what, res] of [['lessons', upcomingRes], ['lessons', pastRes], ['messages', messagesRes]] as const) {
        if ((res as any).error) return { error: `Could not read the ${what}: ${(res as any).error.message}` }
    }

    const name = (p.name as string) || 'Student'
    // Today's lessons that are still scheduled show as upcoming, not twice.
    const upcomingIds = new Set(((upcomingRes.data ?? []) as any[]).map(l => l.id))
    const recent = ((pastRes.data ?? []) as any[])
        .filter(l => !upcomingIds.has(l.id))
        .slice(0, 5)
        .map(l => toPanelLesson(l, today))

    return {
        student: {
            id: p.id,
            name,
            email: p.email ?? null,
            status: p.status ?? null,
            credits: Number(p.credits ?? 0),
            balanceDue: Number(p.balance_due ?? 0),
            lessonDay: p.lesson_day ?? null,
            lessonTime: p.lesson_time ?? null,
            venue: p.lesson_venue === 'classroom' ? 'classroom' : 'zoom',
        },
        upcoming: ((upcomingRes.data ?? []) as any[]).map(l => toPanelLesson(l, today)),
        recent,
        messages: ((messagesRes.data ?? []) as any[]).reverse().map(m => ({
            id: m.id,
            fromStudent: m.sender_id === studentId,
            text: String(m.content ?? '').slice(0, 400),
            attachments: Array.isArray(m.attachments) ? m.attachments.length : 0,
            when: messageWhen(m.created_at, today),
            at: m.created_at,
            unread: m.sender_id === studentId && !m.is_read,
        })),
        unread: unreadRes.count ?? 0,
        // The changes list is a nice-to-have: a failed read leaves it empty.
        changes: ((eventsRes.data ?? []) as EventRow[]).map(ev => eventLine(ev, name)),
    }
}
