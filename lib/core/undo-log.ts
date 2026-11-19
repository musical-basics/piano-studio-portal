/**
 * "Undo log" (#794): give back the credit a log took, with a reason Lionel
 * types, so a wrong charge (say Zoom auto-logging a free trial) is one fix.
 *
 * Two ways to leave the lesson:
 *   - 'free' (default for a charged lesson): it stays logged, now as a free
 *     lesson (free_reason "Log undone: <reason>", snapshots before = after, the
 *     same as "Free, don't take a credit"). Families see "Free lesson"; it never
 *     shows up as unlogged, so nothing re-charges it.
 *   - 'unlog': back to how it was before the log: 'scheduled', no snapshots, no
 *     completed_source, no free_reason. It then shows as unlogged until Lionel
 *     logs or removes it. The only choice for a lesson that was logged free.
 * Notes, homework, recording and sheet music stay either way. The next lesson
 * the log booked is not touched.
 *
 * The credit: exactly what the log took (credit_snapshot_before minus
 * credit_snapshot, 0 for a free lesson), given back on profiles.credits. The
 * ledger row the trigger writes is labelled "log undone: <reason>", and the
 * original charge row gets a note, so the monthly credit check (which skips
 * free lessons and labelled changes, and pairs a charge with its give-back)
 * never flags either. A lesson with no snapshots (logged before they existed)
 * is refused: what its log took isn't on record.
 *
 * No family message unless Lionel ticks the box, which shows the exact text.
 */

import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { sendMessageCore } from '@/lib/core/messages'
import { resolveSalutation } from '@/lib/core/students'
import { smsConfigured } from '@/lib/sms'
import { studioToday, studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'

export type UndoLogMode = 'free' | 'unlog'

export const UNDO_LOG_SOURCE_PREFIX = 'log undone: '
export const UNDO_LOG_FREE_PREFIX = 'Log undone: '
const REASON_MAX = 200

/** Matches the credit check: a charge counts from 12h before the lesson to 45 days after. */
const EARLY_LOG_MS = 12 * 60 * 60 * 1000
const CHARGE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000

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
export function undoLogFamilyMessage(firstName: string | null, lessonDate: string): string {
    return `Hi ${firstName || 'there'}, I have given back the lesson credit for your lesson on ${weekdayName(lessonDate)}, ${monthDay(lessonDate)}, so it won't count toward your lessons. My apologies for the mix-up!`
}

type LoadedLesson = {
    lesson: {
        id: string
        student_id: string
        date: string
        time: string
        status: string
        credit_snapshot_before: number | null
        credit_snapshot: number | null
        free_reason: string | null
        completed_source: string | null
    }
    student: any
    /** Credits the log took: 1 for a charged lesson, 0 for a free one. */
    creditBack: number
    isFree: boolean
}

async function loadLoggedLesson(client: DbClient, lessonId: string): Promise<LoadedLesson | { error: string }> {
    const { data: lesson, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, status, credit_snapshot_before, credit_snapshot, free_reason, completed_source')
        .eq('id', lessonId)
        .maybeSingle()
    if (error) return { error: `Could not read the lesson: ${error.message}` }
    if (!lesson) return { error: 'Lesson not found.' }
    if (lesson.status !== 'completed') return { error: "This lesson isn't logged, so there is nothing to undo." }

    const isFree = typeof lesson.free_reason === 'string'
    let creditBack = 0
    if (!isFree) {
        if (lesson.credit_snapshot_before === null || lesson.credit_snapshot === null) {
            return { error: "This lesson has no record of the credit its log took (it was logged before that was recorded), so nothing was changed. Fix this one by hand." }
        }
        creditBack = lesson.credit_snapshot_before - lesson.credit_snapshot
        if (creditBack !== 1) {
            return { error: `The lesson's record says its log took ${creditBack} credits, not 1, so nothing was changed. Fix this one by hand.` }
        }
    }

    const { data: student, error: studentError } = await client.from('profiles').select('*').eq('id', lesson.student_id).single()
    if (studentError || !student) return { error: 'Student not found' }
    return { lesson: { ...lesson, time: String(lesson.time).slice(0, 5) }, student, creditBack, isFree }
}

export type UndoLogPreview = {
    studentName: string
    /** "Tuesday, November 18 at 4:45pm EST" */
    lessonLabel: string
    creditBack: number
    isFree: boolean
    /** The lesson's free reason when it was logged free. */
    freeReason: string | null
    currentCredits: number
    /** Exactly what the family gets if the box is ticked. */
    familyMessage: string
    alsoTexts: boolean
    /** How it was logged: 'zoom_webhook', 'admin_ui', ... */
    completedSource: string | null
}

export async function getUndoLogPreviewCore(lessonId: string): Promise<UndoLogPreview | { error: string }> {
    const client = createAdminClient()
    const loaded = await loadLoggedLesson(client, lessonId)
    if ('error' in loaded) return loaded
    const { lesson, student } = loaded
    return {
        studentName: student.name || 'Student',
        lessonLabel: `${weekdayName(lesson.date)}, ${monthDay(lesson.date)} at ${studioTimeLabel(lesson.time, lesson.date)}`,
        creditBack: loaded.creditBack,
        isFree: loaded.isFree,
        freeReason: lesson.free_reason,
        currentCredits: Number(student.credits ?? 0),
        familyMessage: undoLogFamilyMessage(resolveSalutation(student), lesson.date),
        alsoTexts: smsConfigured() && Boolean(student.sms_opt_in && student.sms_phone),
        completedSource: lesson.completed_source,
    }
}

export type UndoLogResult = { success: true; summary: string } | { error: string }

export async function undoLessonLogCore({
    adminId,
    lessonId,
    reason: rawReason,
    mode,
    sendFamilyMessage = false,
    expectedMessage,
}: {
    adminId: string
    lessonId: string
    reason: string
    mode: UndoLogMode
    sendFamilyMessage?: boolean
    /** The family text the dialog showed, required when sending it. */
    expectedMessage?: string
}): Promise<UndoLogResult> {
    const reason = rawReason.trim().replace(/\s+/g, ' ').slice(0, REASON_MAX)
    if (!reason) return { error: 'Type a reason. Nothing was changed.' }
    if (mode !== 'free' && mode !== 'unlog') return { error: 'Unknown choice. Nothing was changed.' }

    const client = createAdminClient()
    const loaded = await loadLoggedLesson(client, lessonId)
    if ('error' in loaded) return loaded
    const { lesson, student, creditBack, isFree } = loaded

    if (mode === 'free' && isFree) {
        return { error: 'This lesson is already free (it took no credit). Use "Undo the log completely" to put it back to unlogged. Nothing was changed.' }
    }
    const familyMessage = undoLogFamilyMessage(resolveSalutation(student), lesson.date)
    if (sendFamilyMessage) {
        if (creditBack === 0) return { error: 'No credit comes back for a free lesson, so there is no message to send. Nothing was changed.' }
        if (expectedMessage !== familyMessage) return { error: 'The message changed since it was shown. Nothing was changed; open it again.' }
    }

    // 1. Claim the lesson while it is still exactly as loaded, so a second
    //    press (or a log edit at the same moment) can't give two credits back.
    const fields = mode === 'free'
        ? { free_reason: `${UNDO_LOG_FREE_PREFIX}${reason}`, credit_snapshot: lesson.credit_snapshot_before }
        : { status: 'scheduled', completed_source: null, credit_snapshot_before: null, credit_snapshot: null, free_reason: null }
    let claim = client.from('lessons').update(fields).eq('id', lessonId).eq('status', 'completed')
    claim = lesson.credit_snapshot_before === null ? claim.is('credit_snapshot_before', null) : claim.eq('credit_snapshot_before', lesson.credit_snapshot_before)
    claim = lesson.credit_snapshot === null ? claim.is('credit_snapshot', null) : claim.eq('credit_snapshot', lesson.credit_snapshot)
    claim = lesson.free_reason === null ? claim.is('free_reason', null) : claim.eq('free_reason', lesson.free_reason)
    const { data: claimed, error: claimError } = await claim.select('id')
    if (claimError) return { error: `Nothing was changed: ${claimError.message}` }
    if (!claimed || claimed.length === 0) return { error: 'The lesson changed since this was opened (maybe already undone). Nothing was changed; open it again.' }

    const restoreLesson = () => client.from('lessons').update({
        status: lesson.status,
        completed_source: lesson.completed_source,
        credit_snapshot_before: lesson.credit_snapshot_before,
        credit_snapshot: lesson.credit_snapshot,
        free_reason: lesson.free_reason,
    }).eq('id', lessonId)

    const source = `${UNDO_LOG_SOURCE_PREFIX}${reason}`
    const done: string[] = []

    // 2. The credit back, and the ledger labels.
    if (creditBack > 0) {
        const started = Date.now()
        const { data: profile, error: readError } = await client.from('profiles').select('credits').eq('id', lesson.student_id).single()
        if (readError || !profile) {
            await restoreLesson()
            return { error: `Nothing was changed: could not read the credits (${readError?.message || 'no profile'}).` }
        }
        const previous = Number(profile.credits ?? 0)
        const next = previous + creditBack
        const { error: creditError } = await client.from('profiles').update({ credits: next }).eq('id', lesson.student_id)
        if (creditError) {
            await restoreLesson()
            return { error: `Nothing was changed: could not give the credit back (${creditError.message}).` }
        }
        done.push(`${creditBack} credit given back (${previous} to ${next})`)

        // The trigger can't see a source set over the REST API, so label the
        // row it just wrote (the credit check and payment check skip labelled rows).
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
            const { error } = await client.from('credit_transactions').update({ source }).eq('id', rows[0].id)
            if (error) console.error('[undo-log] ledger label not saved:', error.message)
        } else {
            console.error('[undo-log] could not find the give-back ledger row to label')
        }

        // The original charge: the first unlabelled change at or after the
        // lesson with the balances it recorded, the way the credit check pairs
        // them (a labelled one is already skipped by the check).
        const startMs = Date.parse(studioWallClockToISO(lesson.date, lesson.time))
        const { data: charges } = await client
            .from('credit_transactions')
            .select('id')
            .eq('student_id', lesson.student_id)
            .eq('previous_credits', lesson.credit_snapshot_before)
            .eq('new_credits', lesson.credit_snapshot)
            .is('source', null)
            .is('note', null)
            .gte('changed_at', new Date(startMs - EARLY_LOG_MS).toISOString())
            .lte('changed_at', new Date(startMs + CHARGE_WINDOW_MS).toISOString())
            .order('changed_at', { ascending: true })
            .limit(1)
        const charge = charges?.[0]
        if (charge) {
            const { error } = await client
                .from('credit_transactions')
                .update({ note: `charge undone ${studioToday()}: ${reason}` })
                .eq('id', charge.id)
            if (error) console.error('[undo-log] note on the original charge not saved:', error.message)
        }
    } else {
        done.push('no credit to give back (it was logged free)')
    }

    done.push(mode === 'free' ? 'lesson kept as a free lesson' : 'lesson back to unlogged')

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

    return { success: true, summary: `${done.join(', ')}.` }
}
