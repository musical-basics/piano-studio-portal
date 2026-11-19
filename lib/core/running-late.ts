/**
 * "Running late" (#788): one tap on today's lesson sends Lionel's usual
 * "running late" line to that one family's portal chat (sendMessageCore, which
 * also emails the usual notice and texts families who opted in).
 *
 * Only for a lesson that is still scheduled for today, studio (Eastern) time.
 * The same line to the same family within the last 30 minutes is not sent
 * again, so a double tap can't send it twice.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessageCore } from '@/lib/core/messages'
import { smsConfigured } from '@/lib/sms'
import { isoToStudioWallClock, studioToday, studioTzAbbr } from '@/lib/studio-timezone'
import { isRunningLateMinutes, runningLateMessage, RUNNING_LATE_MINUTES } from '@/lib/running-late'

const REPEAT_WINDOW_MINUTES = 30

/** "4:45pm EST" for a stored studio time. */
function studioTimeLabel(time: string, date: string): string {
    const [h, m] = time.split(':')
    const hn = parseInt(h, 10)
    return `${hn % 12 || 12}:${m}${hn >= 12 ? 'pm' : 'am'} ${studioTzAbbr(date)}`
}

export type RunningLatePreview = {
    studentName: string
    /** "4:45pm EST" */
    lessonTime: string
    /** The family opted in to texts, so the message also goes out as a text. */
    alsoTexts: boolean
}

export type RunningLateResult = { success: true; summary: string } | { error: string }

async function loadTodayLesson(lessonId: string) {
    const client = createAdminClient()
    const { data: lesson, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, status')
        .eq('id', lessonId)
        .maybeSingle()
    if (error) return { error: `Could not read the lesson: ${error.message}` } as const
    if (!lesson) return { error: 'Lesson not found. It may have been cancelled.' } as const
    if (lesson.date !== studioToday()) return { error: "This lesson isn't today, so nothing was sent." } as const
    if (lesson.status !== 'scheduled') return { error: 'This lesson is already logged or cancelled, so nothing was sent.' } as const

    const { data: student, error: studentError } = await client
        .from('profiles')
        .select('*')
        .eq('id', lesson.student_id)
        .single()
    if (studentError || !student) return { error: 'Student not found' } as const
    return { client, lesson: { ...lesson, time: String(lesson.time).slice(0, 5) }, student } as const
}

export async function getRunningLatePreviewCore(lessonId: string): Promise<RunningLatePreview | { error: string }> {
    const loaded = await loadTodayLesson(lessonId)
    if ('error' in loaded) return { error: loaded.error as string }
    return {
        studentName: loaded.student.name || 'Student',
        lessonTime: studioTimeLabel(loaded.lesson.time, loaded.lesson.date),
        alsoTexts: smsConfigured() && Boolean(loaded.student.sms_opt_in && loaded.student.sms_phone),
    }
}

export async function runningLateCore({
    adminId,
    lessonId,
    minutes,
    expectedMessage,
}: {
    adminId: string
    lessonId: string
    minutes: number
    /** The text the confirm step showed; must match what would be sent. */
    expectedMessage: string
}): Promise<RunningLateResult> {
    if (!isRunningLateMinutes(minutes)) {
        return { error: `Pick ${RUNNING_LATE_MINUTES.join(', ')} minutes. Nothing was sent.` }
    }
    const content = runningLateMessage(minutes)
    if (content !== expectedMessage) return { error: 'The message changed since it was shown. Nothing was sent; open it again.' }

    const loaded = await loadTodayLesson(lessonId)
    if ('error' in loaded) return { error: loaded.error as string }
    const { client, lesson, student } = loaded

    const since = new Date(Date.now() - REPEAT_WINDOW_MINUTES * 60_000).toISOString()
    const { data: recent, error: recentError } = await client
        .from('messages')
        .select('id, created_at')
        .eq('sender_id', adminId)
        .eq('recipient_id', lesson.student_id)
        .eq('content', content)
        .is('deleted_at', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
    if (recentError) return { error: `Nothing was sent: could not check for an earlier send (${recentError.message}).` }
    if (recent && recent.length > 0) {
        const at = isoToStudioWallClock(recent[0].created_at).localTime
        return { error: `This exact message already went to ${student.name || 'this family'} at ${studioTimeLabel(at, lesson.date)}, so it was not sent again.` }
    }

    const sent = await sendMessageCore({ client, senderId: adminId, recipientId: lesson.student_id, content })
    if (sent.error || !sent.message) return { error: `Not sent: ${sent.error ?? 'no message saved'}` }
    return { success: true, summary: `Sent to ${student.name || 'the family'}: "${content}"` }
}
