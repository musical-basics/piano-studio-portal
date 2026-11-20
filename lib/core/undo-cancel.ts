/**
 * "Undo" a cancel (Lionel's #1086): for 10 minutes after he cancels a lesson
 * in admin, a mis-tap can be reversed from the bar at the top of admin
 * (components/admin/recent-undo-bar.tsx).
 *
 * Cancelling deletes the lessons row, its Zoom meeting and its calendar event
 * (cancelLessonCore), and keeps the row on cancellation_log.undo_snapshot.
 * Undo:
 *   - books the same date, time and length again through scheduleLessonCore,
 *     the usual booking: a new Zoom meeting, a new calendar event, and the
 *     usual "Lesson Scheduled" email to the family (they were sent "Lesson
 *     Canceled", so this tells them it is back);
 *   - puts back what the deleted row carried (notes, homework, sheet music,
 *     recording link, the family's confirmation, the reminders already sent so
 *     they don't come twice, a hold) and the family's homework ticks;
 *   - credits and fees: an admin cancel takes neither (only a family's own late
 *     cancel adds a fee, and those are not undone here), so nothing comes back;
 *   - marks the cancellation_log row undone with the new lesson, so the
 *     auto-schedule and the booking warning stop treating that date as
 *     cancelled, and records 'cancel_undone' in "Today's changes".
 * Refused after 10 minutes, when the slot has another lesson now, or twice.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { checkAvailabilityCore, scheduleLessonCore } from '@/lib/core/lessons'
import { recordLessonEvent } from '@/lib/lesson-events'
import { lessonWhen } from '@/lib/day-changes'
import { studioTzAbbr } from '@/lib/studio-timezone'
import { UNDO_WINDOW_MS, cancelUndoBlock, undoMsLeft, type CancelUndoSnapshot } from '@/lib/undo-window'

/** Lesson fields carried over to the new row; it gets its own id, Zoom meeting and calendar event. */
const CARRIED_FIELDS = [
    'notes',
    'homework',
    'sheet_music_url',
    'video_url',
    'is_confirmed',
    'reminder_48h_sent',
    'reminder_24h_sent',
    'reminder_12h_sent',
    'reminder_2h_sent',
    'reminder_15m_sent',
    'on_hold_reason',
    'on_hold_at',
] as const

const CARRIED_WORDS: Partial<Record<(typeof CARRIED_FIELDS)[number], string>> = {
    notes: 'notes',
    homework: 'homework',
    sheet_music_url: 'sheet music',
    video_url: 'recording link',
    on_hold_reason: 'hold',
}

type CancellationRow = {
    id: string
    student_id: string
    lesson_id: string | null
    cancelled_by: string
    cancelled_at: string
    undone_at: string | null
    undo_snapshot: CancelUndoSnapshot | null
}

export type RecentUndo = {
    kind: 'cancel' | 'no_show'
    /** cancellation_log.id for a cancel, lessons.id for a no-show. */
    id: string
    studentId: string
    studentName: string
    date: string
    /** HH:MM, studio (Eastern) time. */
    time: string
    duration: number
    /** When it was done (ISO); Undo runs out 10 minutes later. */
    at: string
}

/** "Thu Nov 20, 4:30pm EST" */
function whenLabel(date: string, time: string): string {
    return `${lessonWhen(date, time)} ${studioTzAbbr(date)}`
}

/** Lionel's cancels from the last 10 minutes that Undo can still reverse, newest first. */
export async function listRecentCancelUndosCore(): Promise<RecentUndo[]> {
    const client = createAdminClient()
    const cutoff = new Date(Date.now() - UNDO_WINDOW_MS).toISOString()
    const { data, error } = await client
        .from('cancellation_log')
        .select('id, student_id, lesson_id, cancelled_by, cancelled_at, undone_at, undo_snapshot')
        .gt('cancelled_at', cutoff)
        .is('undone_at', null)
        .eq('cancelled_by', 'admin')
        .order('cancelled_at', { ascending: false })
        .limit(20)
    if (error) throw new Error(`cancellation_log query failed: ${error.message}`)
    const rows = ((data ?? []) as CancellationRow[]).filter(r => cancelUndoBlock(r) === null)
    if (rows.length === 0) return []

    const ids = Array.from(new Set(rows.map(r => r.student_id)))
    const { data: students } = await client.from('profiles').select('id, name').in('id', ids)
    const names = new Map((students ?? []).map(s => [s.id as string, (s.name as string) || 'Student']))
    return rows.map(r => {
        const lesson = r.undo_snapshot!.lesson
        return {
            kind: 'cancel' as const,
            id: r.id,
            studentId: r.student_id,
            studentName: names.get(r.student_id) || 'Student',
            date: String(lesson.date),
            time: String(lesson.time).slice(0, 5),
            duration: Number(lesson.duration) || 60,
            at: r.cancelled_at,
        }
    })
}

export type UndoCancelResult = { success: true; summary: string; lessonId: string } | { error: string }

export async function undoCancelCore({ adminId, cancellationId }: { adminId: string; cancellationId: string }): Promise<UndoCancelResult> {
    const client = createAdminClient()
    const { data, error: readError } = await client
        .from('cancellation_log')
        .select('id, student_id, lesson_id, cancelled_by, cancelled_at, undone_at, undo_snapshot')
        .eq('id', cancellationId)
        .maybeSingle()
    if (readError) return { error: `Nothing was changed: could not read the cancel (${readError.message}).` }
    if (!data) return { error: 'That cancel was not found. Nothing was changed.' }
    const row = data as CancellationRow
    const blocked = cancelUndoBlock(row)
    if (blocked) return { error: `${blocked} Nothing was changed.` }
    if (undoMsLeft(row.cancelled_at) <= 0) {
        return { error: 'Undo is offered for 10 minutes after a cancel, and that has passed. Nothing was changed; book the lesson again from the schedule if you want it back.' }
    }

    const snap = row.undo_snapshot!
    const old = snap.lesson
    const date = String(old.date)
    const time = String(old.time).slice(0, 5)
    const duration = Number(old.duration) || 60
    const when = whenLabel(date, time)

    if (!(await checkAvailabilityCore(client, date, time, duration))) {
        return { error: `${when} has another lesson now, so it can't be booked back. Nothing was changed.` }
    }

    // Claim the cancel while it is still open and inside the 10 minutes, so a
    // double press books one lesson, not two.
    const { data: claimed, error: claimError } = await client
        .from('cancellation_log')
        .update({ undone_at: new Date().toISOString(), undone_by: adminId })
        .eq('id', row.id)
        .is('undone_at', null)
        .gt('cancelled_at', new Date(Date.now() - UNDO_WINDOW_MS).toISOString())
        .select('id')
    if (claimError) return { error: `Nothing was changed: ${claimError.message}` }
    if (!claimed || claimed.length === 0) return { error: 'This cancel was already undone, or its 10 minutes ran out. Nothing was changed.' }
    const release = () => client.from('cancellation_log').update({ undone_at: null, undone_by: null }).eq('id', row.id)

    // The usual booking: new Zoom meeting, calendar event, "Lesson Scheduled" email.
    // The intent-flag check is skipped: this is the same lesson coming back.
    const booked = await scheduleLessonCore({
        client,
        adminId,
        studentId: row.student_id,
        date,
        time,
        duration,
        confirmOverride: true,
        recordEvent: false,
    })
    if ('error' in booked) {
        await release()
        return { error: `Not booked back: ${booked.error}. Nothing was changed.` }
    }
    const lesson = booked.lesson as Record<string, any>
    const done: string[] = [`${when}, ${duration} min, is booked again`]
    done.push(lesson?.zoom_meeting_id ? 'with a new Zoom link' : 'with your usual Zoom link (a new meeting could not be made)')
    done.push(lesson?.google_event_id ? 'a new calendar event' : 'no calendar event (the calendar did not answer)')
    done.push('the family gets the usual "Lesson Scheduled" email')

    // What the deleted row carried.
    const carried: Record<string, unknown> = {}
    for (const f of CARRIED_FIELDS) {
        if (old[f] !== undefined && old[f] !== null && old[f] !== false) carried[f] = old[f]
    }
    const restored = (Object.keys(carried) as Array<(typeof CARRIED_FIELDS)[number]>).map(f => CARRIED_WORDS[f]).filter((w): w is string => Boolean(w))
    if (lesson?.id && Object.keys(carried).length > 0) {
        const { error } = await client.from('lessons').update(carried).eq('id', lesson.id)
        if (error) {
            console.error('[undo-cancel] fields not put back:', error.message)
            done.push(`but its ${restored.join(', ') || 'details'} could not be put back (${error.message})`)
        } else if (restored.length) {
            done.push(`its ${restored.join(', ')} put back`)
        }
    }
    const ticks = Array.isArray(snap.homework_ticks) ? snap.homework_ticks : []
    if (lesson?.id && ticks.length > 0) {
        const { error } = await client.from('homework_ticks').insert(ticks.map(t => ({
            lesson_id: lesson.id,
            student_id: row.student_id,
            item_index: t.item_index,
            item_text: t.item_text,
            ticked_at: t.ticked_at,
        })))
        if (error) console.error('[undo-cancel] homework ticks not put back:', error.message)
    }
    done.push('no credit or fee to put back (cancelling took none)')

    const { error: linkError } = await client.from('cancellation_log').update({ undone_lesson_id: lesson?.id ?? null }).eq('id', row.id)
    if (linkError) console.error('[undo-cancel] new lesson not saved on the cancel:', linkError.message)

    await recordLessonEvent({
        kind: 'cancel_undone',
        actor: 'admin',
        studentId: row.student_id,
        lessonId: lesson?.id ?? null,
        date,
        time,
        detail: {
            cancelled_lesson_id: row.lesson_id,
            duration,
            zoom: Boolean(lesson?.zoom_meeting_id),
            calendar: Boolean(lesson?.google_event_id),
            restored,
        },
    })

    return { success: true, summary: `${done.join(', ')}.`, lessonId: lesson?.id }
}
