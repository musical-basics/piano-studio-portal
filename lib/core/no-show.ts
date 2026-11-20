import { revalidatePath } from 'next/cache'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { UNLOGGED_STATUSES } from '@/lib/unlogged-lessons'
import { recordLessonEvent } from '@/lib/lesson-events'
import { sendMessageCore } from '@/lib/core/messages'
import { resolveSalutation } from '@/lib/core/students'
import { smsConfigured } from '@/lib/sms'
import { studioToday, studioTzAbbr } from '@/lib/studio-timezone'
import { UNDO_WINDOW_MS, undoMsLeft } from '@/lib/undo-window'
import type { RecentUndo } from '@/lib/core/undo-cancel'

/**
 * A no-show: the student never came, so the lesson is forfeited. The admin
 * "No-Show" button (markNoShow in app/actions/lessons.ts) and, since #797, the
 * morning email's "No-Show" button both run this.
 *
 * What it does, all of it:
 *   - the lesson stays, marked status 'cancelled' (the portal's no-show mark;
 *     a real cancellation deletes the row) with the note below;
 *   - 1 credit is taken (no refund), with the usual before/after snapshots on
 *     the lesson, and the ledger row is labelled 'no-show';
 *   - the family's History tab counts it as a lesson used.
 * It sends nothing: no email, portal message or text to the family. It does
 * not touch the Zoom meeting, the calendar event or the next lesson (standing
 * lessons are booked by the daily auto-schedule, not by logging).
 *
 * Uses the service-role client for every write (a cross-user credits update
 * through an admin's own session can silently change nothing). Refuses when
 * the lesson is no longer unlogged, so a second press never takes two credits.
 *
 * Since #1097 it keeps what the lesson was (status, notes, when) on
 * lessons.no_show_before, so undoNoShowCore below can put it back within 10
 * minutes, with the credit.
 */

export const NO_SHOW_NOTE = 'Marked as No-Show by teacher. Credit forfeited.'
export const NO_SHOW_LEDGER_SOURCE = 'no-show'

export type NoShowResult =
    | { ok: true; studentId: string; previousCredits: number; newCredits: number }
    | { ok: false; changed: true; status: string | null }
    | { ok: false; changed?: false; error: string }

export async function markNoShowCore(lessonId: string, { via }: { via?: string } = {}): Promise<NoShowResult> {
    const client = createAdminClient()
    const started = new Date()

    const { data: before, error: readError } = await client
        .from('lessons')
        .select('id, student_id, status, on_hold_reason, date, time, notes')
        .eq('id', lessonId)
        .maybeSingle()
    if (readError) return { ok: false, error: `lesson lookup failed: ${readError.message}` }
    if (!before) return { ok: false, changed: true, status: null }
    // #989: nothing happens to a held lesson until Lionel releases it.
    if ((before as any).on_hold_reason) return { ok: false, error: `this lesson is on hold (${(before as any).on_hold_reason}); release it in admin first` }
    if (!UNLOGGED_STATUSES.includes(before.status as string)) return { ok: false, changed: true, status: before.status as string }

    // Claim the lesson while it is still unlogged: a double tap, or a log from
    // somewhere else at the same moment, finds nothing to claim.
    const { data: claimed, error: claimError } = await client
        .from('lessons')
        .update({
            status: 'cancelled',
            notes: NO_SHOW_NOTE,
            // #1097: what Undo puts back.
            no_show_before: { at: started.toISOString(), status: before.status, notes: (before as any).notes ?? null },
        })
        .eq('id', lessonId)
        .in('status', UNLOGGED_STATUSES)
        .is('credit_snapshot', null)
        .select('id, student_id')
    if (claimError) return { ok: false, error: `lesson update failed: ${claimError.message}` }
    if (!claimed || claimed.length === 0) return { ok: false, changed: true, status: null }
    const studentId = claimed[0].student_id as string

    const undo = () => client.from('lessons').update({ status: before.status, notes: (before as any).notes ?? null, no_show_before: null }).eq('id', lessonId)

    const { data: profile, error: creditsError } = await client
        .from('profiles')
        .select('credits')
        .eq('id', studentId)
        .single()
    if (creditsError || !profile) {
        await undo()
        return { ok: false, error: `could not read the credits: ${creditsError?.message || 'no profile'}` }
    }
    const previousCredits = Number(profile.credits ?? 0)
    const newCredits = previousCredits - 1
    const { error: deductError } = await client.from('profiles').update({ credits: newCredits }).eq('id', studentId)
    if (deductError) {
        await undo()
        return { ok: false, error: `could not take the credit: ${deductError.message}` }
    }

    const { error: snapshotError } = await client
        .from('lessons')
        .update({ credit_snapshot_before: previousCredits, credit_snapshot: newCredits })
        .eq('id', lessonId)
    if (snapshotError) console.error('[no-show] snapshot not saved:', snapshotError.message)

    // The ledger trigger cannot see a source set over the REST API, so label
    // the row it just wrote.
    const { data: rows } = await client
        .from('credit_transactions')
        .select('id')
        .eq('student_id', studentId)
        .eq('previous_credits', previousCredits)
        .eq('new_credits', newCredits)
        .gte('changed_at', new Date(started.getTime() - 60_000).toISOString())
        .order('changed_at', { ascending: false })
        .limit(1)
    if (rows && rows[0]) {
        const { error: labelError } = await client.from('credit_transactions').update({ source: NO_SHOW_LEDGER_SOURCE }).eq('id', rows[0].id)
        if (labelError) console.error('[no-show] ledger label not saved:', labelError.message)
    }

    await recordLessonEvent({
        kind: 'no_show',
        actor: 'admin',
        studentId,
        lessonId,
        date: (before as any).date,
        time: (before as any).time,
        detail: { credits_before: previousCredits, credits_after: newCredits },
        context: { via },
    })

    try {
        revalidatePath('/admin')
        revalidatePath('/student')
    } catch {
        // Outside a request (scripts): nothing to revalidate.
    }
    return { ok: true, studentId, previousCredits, newCredits }
}

// ---------------------------------------------------------------------------
// "Undo" a no-show (Lionel's #1097): for 10 minutes after he marks one (admin
// button or the morning email's), from the bar at the top of admin, for when
// the student did come and he pressed the wrong button.
//   - the credit the no-show took comes back, with a reason he types: the
//     ledger row is labelled "no-show undone: <reason>" and the no-show's own
//     row gets a note, so the monthly credit check pairs them;
//   - the lesson goes back to how it was (unlogged, its notes as before, no
//     snapshots), so he can log it properly;
//   - nothing goes to the family unless he ticks the box, which shows the text.
// Refused after 10 minutes, twice, or for a no-show from before #1097.
// ---------------------------------------------------------------------------

export const NO_SHOW_UNDO_SOURCE_PREFIX = 'no-show undone: '
const UNDO_REASON_MAX = 200

type NoShowBefore = { at: string; status: string; notes: string | null }

function weekdayName(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}
function monthDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}
function studioTimeLabel(time: string, date: string): string {
    const [h, m] = time.split(':')
    const hn = parseInt(h, 10)
    return `${hn % 12 || 12}:${m}${hn >= 12 ? 'pm' : 'am'} ${studioTzAbbr(date)}`
}

/** The optional note to the family, in Lionel's voice (no payment math). */
export function noShowUndoFamilyMessage(firstName: string | null, lessonDate: string): string {
    return `Hi ${firstName || 'there'}, I marked your lesson on ${weekdayName(lessonDate)}, ${monthDay(lessonDate)} as a no-show by mistake, so I have put it back. Sorry for the mix-up!`
}

type LoadedNoShow = {
    lesson: {
        id: string
        student_id: string
        date: string
        time: string
        notes: string | null
        credit_snapshot_before: number
        credit_snapshot: number
    }
    before: NoShowBefore
    student: any
}

async function loadNoShow(client: DbClient, lessonId: string): Promise<LoadedNoShow | { error: string }> {
    const { data: lesson, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, status, notes, credit_snapshot_before, credit_snapshot, no_show_before')
        .eq('id', lessonId)
        .maybeSingle()
    if (error) return { error: `Could not read the lesson: ${error.message}` }
    if (!lesson) return { error: 'Lesson not found.' }
    const before = lesson.no_show_before as NoShowBefore | null
    if (lesson.status !== 'cancelled' || !before?.at) return { error: "This lesson isn't marked a no-show now, so there is nothing to undo." }
    if (undoMsLeft(before.at) <= 0) return { error: 'Undo is offered for 10 minutes after a no-show, and that has passed. Nothing was changed.' }
    if (lesson.credit_snapshot_before === null || lesson.credit_snapshot === null || lesson.credit_snapshot_before - lesson.credit_snapshot !== 1) {
        return { error: "The lesson's record doesn't show the no-show taking exactly 1 credit, so nothing was changed. Fix this one by hand." }
    }
    const { data: student, error: studentError } = await client.from('profiles').select('*').eq('id', lesson.student_id).single()
    if (studentError || !student) return { error: 'Student not found' }
    return {
        lesson: { ...lesson, time: String(lesson.time).slice(0, 5) } as LoadedNoShow['lesson'],
        before,
        student,
    }
}

export type UndoNoShowPreview = {
    studentName: string
    /** "Tuesday, November 18 at 4:45pm EST" */
    lessonLabel: string
    currentCredits: number
    /** Exactly what the family gets if the box is ticked. */
    familyMessage: string
    alsoTexts: boolean
    /** ISO time it was marked; Undo runs out 10 minutes later. */
    markedAt: string
}

export async function getUndoNoShowPreviewCore(lessonId: string): Promise<UndoNoShowPreview | { error: string }> {
    const loaded = await loadNoShow(createAdminClient(), lessonId)
    if ('error' in loaded) return loaded
    const { lesson, student } = loaded
    return {
        studentName: student.name || 'Student',
        lessonLabel: `${weekdayName(lesson.date)}, ${monthDay(lesson.date)} at ${studioTimeLabel(lesson.time, lesson.date)}`,
        currentCredits: Number(student.credits ?? 0),
        familyMessage: noShowUndoFamilyMessage(resolveSalutation(student), lesson.date),
        alsoTexts: smsConfigured() && Boolean(student.sms_opt_in && student.sms_phone),
        markedAt: loaded.before.at,
    }
}

/** No-shows marked in the last 10 minutes, for the admin Undo bar. */
export async function listRecentNoShowUndosCore(): Promise<RecentUndo[]> {
    const client = createAdminClient()
    const cutoff = new Date(Date.now() - UNDO_WINDOW_MS).toISOString()
    const { data, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, no_show_before')
        .eq('status', 'cancelled')
        .gt('no_show_before->>at', cutoff)
        .limit(20)
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    const rows = (data ?? []).filter(r => (r.no_show_before as NoShowBefore | null)?.at)
    if (rows.length === 0) return []
    const ids = Array.from(new Set(rows.map(r => r.student_id as string)))
    const { data: students } = await client.from('profiles').select('id, name').in('id', ids)
    const names = new Map((students ?? []).map(s => [s.id as string, (s.name as string) || 'Student']))
    return rows.map(r => ({
        kind: 'no_show' as const,
        id: r.id as string,
        studentId: r.student_id as string,
        studentName: names.get(r.student_id as string) || 'Student',
        date: r.date as string,
        time: String(r.time).slice(0, 5),
        duration: Number(r.duration) || 60,
        at: (r.no_show_before as NoShowBefore).at,
    }))
}

export type UndoNoShowResult = { success: true; summary: string } | { error: string }

export async function undoNoShowCore({
    adminId,
    lessonId,
    reason: rawReason,
    sendFamilyMessage = false,
    expectedMessage,
}: {
    adminId: string
    lessonId: string
    reason: string
    sendFamilyMessage?: boolean
    /** The family text the dialog showed, required when sending it. */
    expectedMessage?: string
}): Promise<UndoNoShowResult> {
    const reason = rawReason.trim().replace(/\s+/g, ' ').slice(0, UNDO_REASON_MAX)
    if (!reason) return { error: 'Type a reason. Nothing was changed.' }

    const client = createAdminClient()
    const loaded = await loadNoShow(client, lessonId)
    if ('error' in loaded) return loaded
    const { lesson, before, student } = loaded
    const familyMessage = noShowUndoFamilyMessage(resolveSalutation(student), lesson.date)
    if (sendFamilyMessage && expectedMessage !== familyMessage) {
        return { error: 'The message changed since it was shown. Nothing was changed; open it again.' }
    }

    // 1. Claim the lesson while it is still exactly the no-show that was
    //    loaded and inside the 10 minutes, so a second press (or anything
    //    else at the same moment) can't give two credits back.
    const { data: claimed, error: claimError } = await client
        .from('lessons')
        .update({ status: 'scheduled', notes: before.notes ?? null, credit_snapshot_before: null, credit_snapshot: null, no_show_before: null })
        .eq('id', lessonId)
        .eq('status', 'cancelled')
        .eq('credit_snapshot_before', lesson.credit_snapshot_before)
        .eq('credit_snapshot', lesson.credit_snapshot)
        .gt('no_show_before->>at', new Date(Date.now() - UNDO_WINDOW_MS).toISOString())
        .select('id')
    if (claimError) return { error: `Nothing was changed: ${claimError.message}` }
    if (!claimed || claimed.length === 0) return { error: 'The lesson changed since this was opened (maybe already undone), or its 10 minutes ran out. Nothing was changed.' }

    const restoreLesson = () => client.from('lessons').update({
        status: 'cancelled',
        notes: lesson.notes,
        credit_snapshot_before: lesson.credit_snapshot_before,
        credit_snapshot: lesson.credit_snapshot,
        no_show_before: before,
    }).eq('id', lessonId)

    // 2. The credit back, and the ledger labels.
    const started = Date.now()
    const { data: profile, error: readError } = await client.from('profiles').select('credits').eq('id', lesson.student_id).single()
    if (readError || !profile) {
        await restoreLesson()
        return { error: `Nothing was changed: could not read the credits (${readError?.message || 'no profile'}).` }
    }
    const previous = Number(profile.credits ?? 0)
    const next = previous + 1
    const { error: creditError } = await client.from('profiles').update({ credits: next }).eq('id', lesson.student_id)
    if (creditError) {
        await restoreLesson()
        return { error: `Nothing was changed: could not give the credit back (${creditError.message}).` }
    }
    const done = [`1 credit given back (${previous} to ${next})`, 'lesson back to unlogged so you can log it']

    // The trigger can't see a source set over the REST API, so label the row it just wrote.
    const { data: rows } = await client
        .from('credit_transactions')
        .select('id')
        .eq('student_id', lesson.student_id)
        .eq('previous_credits', previous)
        .eq('new_credits', next)
        .gte('changed_at', new Date(started - 60_000).toISOString())
        .order('changed_at', { ascending: false })
        .limit(1)
    if (rows && rows[0]) {
        const { error } = await client.from('credit_transactions').update({ source: `${NO_SHOW_UNDO_SOURCE_PREFIX}${reason}` }).eq('id', rows[0].id)
        if (error) console.error('[no-show undo] ledger label not saved:', error.message)
    } else {
        console.error('[no-show undo] could not find the give-back ledger row to label')
    }
    // The no-show's own row, so the two read as a pair.
    const { data: charges } = await client
        .from('credit_transactions')
        .select('id')
        .eq('student_id', lesson.student_id)
        .eq('previous_credits', lesson.credit_snapshot_before)
        .eq('new_credits', lesson.credit_snapshot)
        .eq('source', NO_SHOW_LEDGER_SOURCE)
        .is('note', null)
        .gte('changed_at', new Date(Date.parse(before.at) - 60_000).toISOString())
        .order('changed_at', { ascending: true })
        .limit(1)
    if (charges?.[0]) {
        const { error } = await client.from('credit_transactions').update({ note: `no-show undone ${studioToday()}: ${reason}` }).eq('id', charges[0].id)
        if (error) console.error('[no-show undo] note on the no-show row not saved:', error.message)
    }

    await recordLessonEvent({
        kind: 'no_show_undone',
        actor: 'admin',
        studentId: lesson.student_id,
        lessonId,
        date: lesson.date,
        time: lesson.time,
        detail: { credits_before: previous, credits_after: next },
        context: { reason },
    })

    // 3. The family message, only when ticked.
    if (sendFamilyMessage) {
        const sent = await sendMessageCore({ client, senderId: adminId, recipientId: lesson.student_id, content: familyMessage })
        if (sent.error || !sent.message) {
            return { error: `${done.join(', ')}, but the message to the family did not send (${sent.error ?? 'no message saved'}). Send it from their chat if you still want to.` }
        }
        done.push('message sent to the family')
    } else {
        done.push('no message sent')
    }

    try {
        revalidatePath('/admin')
        revalidatePath('/student')
    } catch {
        // Outside a request (scripts): nothing to revalidate.
    }
    return { success: true, summary: `${done.join(', ')}.` }
}
