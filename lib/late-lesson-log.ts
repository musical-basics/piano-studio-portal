import { revalidatePath } from 'next/cache'
import { recordLessonEvent } from '@/lib/lesson-events'
import type { DbClient } from '@/lib/supabase/admin'
import { shiftDateStr, studioToday } from '@/lib/studio-timezone'
import { UNLOGGED_STATUSES } from '@/lib/unlogged-lessons'
import { checkFreeTrial } from '@/lib/free-trial'
import { FREE_TRIAL_REASON } from '@/lib/free-lesson-reasons'

/**
 * Logging a lesson that is more than a week old, from the "Log it" button.
 *
 * The usual log (logLessonCore) also emails the family the lesson notes and
 * books the same slot a week after the lesson, with a booking email. For an
 * old lesson that books a date already gone and tells the family about it, so
 * old lessons are logged quietly instead, the way Lionel had the #432 ones
 * done: the lesson is marked logged, 1 credit is taken with the usual
 * before/after snapshots, the ledger row is labelled, and nobody is emailed.
 * The monthly credit check (#736) is what lists such old lessons.
 */

/** From this many days after the lesson, the usual log would book into the past. */
export const QUIET_LOG_AFTER_DAYS = 7

/** Ledger label, so the credit check knows this late credit is meant. */
export const LATE_LOG_SOURCE = 'unlogged lesson logged late (email button)'

/** The same, for a log from the admin home's unlogged list (#760). */
export const LATE_LOG_SOURCE_ADMIN = 'unlogged lesson logged late (admin list)'

export function isTooOldForUsualLog(date: string, today: string = studioToday()): boolean {
    return shiftDateStr(date, QUIET_LOG_AFTER_DAYS) <= today
}

export type QuietLogResult =
    /** trial: the new student's free trial (#946), logged free with no credit taken. */
    | { ok: true; previousCredits: number; newCredits: number; trial: boolean }
    | { ok: false; changed: true }
    | { ok: false; changed?: false; error: string }

/**
 * Marks an unlogged lesson logged and takes its credit, with no email and no
 * booking. `client` must be the service-role client. Refuses (changed: true)
 * when the lesson is no longer unlogged.
 */
export async function logOldLessonQuietly(
    client: DbClient,
    lessonId: string,
    { notes, homework, source = LATE_LOG_SOURCE }: { notes?: string; homework?: string; source?: string } = {},
): Promise<QuietLogResult> {
    const started = new Date()
    const { data: before, error: readError } = await client
        .from('lessons')
        .select('id, student_id, status, date, time')
        .eq('id', lessonId)
        .maybeSingle()
    if (readError) return { ok: false, error: `lesson lookup failed: ${readError.message}` }
    if (!before || !UNLOGGED_STATUSES.includes(before.status as string)) return { ok: false, changed: true }

    // Claim the lesson first, only while it is still unlogged, so a second
    // press or a log from admin at the same moment cannot take two credits.
    const fields: Record<string, unknown> = { status: 'completed', completed_source: 'admin_ui' }
    if (notes) fields.notes = notes
    if (homework) fields.homework = homework
    const { data: claimed, error: claimError } = await client
        .from('lessons')
        .update(fields)
        .eq('id', lessonId)
        .in('status', UNLOGGED_STATUSES)
        .is('credit_snapshot', null)
        .select('id, student_id')
    if (claimError) return { ok: false, error: `lesson update failed: ${claimError.message}` }
    if (!claimed || claimed.length === 0) return { ok: false, changed: true }
    const studentId = claimed[0].student_id as string

    const undo = () => client.from('lessons').update({ status: before.status }).eq('id', lessonId)

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

    // A new student's free trial (#946): logged free, nothing taken, no ledger row.
    const decision = await checkFreeTrial(client, { studentId, lessonId, date: String(before.date), time: String(before.time) })
    if (decision.trial) {
        const { error: freeError } = await client
            .from('lessons')
            .update({ credit_snapshot_before: previousCredits, credit_snapshot: previousCredits, free_reason: FREE_TRIAL_REASON })
            .eq('id', lessonId)
        if (freeError) {
            await undo()
            return { ok: false, error: `could not log the free trial: ${freeError.message}` }
        }
        await recordLessonEvent({
            kind: 'logged',
            actor: 'admin',
            studentId,
            lessonId,
            date: String(before.date),
            time: String(before.time),
            detail: { credits_before: previousCredits, credits_after: previousCredits, free: true, trial: true, quiet: true },
            context: { via: source === LATE_LOG_SOURCE ? 'email button' : undefined },
        })
        try {
            revalidatePath('/admin')
            revalidatePath('/student')
        } catch {
            // Outside a request (scripts): nothing to revalidate.
        }
        return { ok: true, previousCredits, newCredits: previousCredits, trial: true }
    }

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
    if (snapshotError) console.error('[late-lesson-log] snapshot not saved:', snapshotError.message)

    // The ledger trigger cannot see a source set over the REST API, so label
    // the row it just wrote (the credit check skips labelled changes).
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
        const { error: labelError } = await client.from('credit_transactions').update({ source }).eq('id', rows[0].id)
        if (labelError) console.error('[late-lesson-log] ledger label not saved:', labelError.message)
    }

    await recordLessonEvent({
        kind: 'logged',
        actor: 'admin',
        studentId,
        lessonId,
        date: String(before.date),
        time: String(before.time),
        detail: { credits_before: previousCredits, credits_after: newCredits, quiet: true },
        context: { via: source === LATE_LOG_SOURCE ? 'email button' : undefined },
    })

    try {
        revalidatePath('/admin')
        revalidatePath('/student')
    } catch {
        // Outside a request (scripts): nothing to revalidate.
    }
    return { ok: true, previousCredits, newCredits, trial: false }
}
