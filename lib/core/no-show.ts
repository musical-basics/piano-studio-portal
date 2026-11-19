import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { UNLOGGED_STATUSES } from '@/lib/unlogged-lessons'

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
 */

export const NO_SHOW_NOTE = 'Marked as No-Show by teacher. Credit forfeited.'
export const NO_SHOW_LEDGER_SOURCE = 'no-show'

export type NoShowResult =
    | { ok: true; studentId: string; previousCredits: number; newCredits: number }
    | { ok: false; changed: true; status: string | null }
    | { ok: false; changed?: false; error: string }

export async function markNoShowCore(lessonId: string): Promise<NoShowResult> {
    const client = createAdminClient()
    const started = new Date()

    const { data: before, error: readError } = await client
        .from('lessons')
        .select('id, student_id, status, on_hold_reason')
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
        .update({ status: 'cancelled', notes: NO_SHOW_NOTE })
        .eq('id', lessonId)
        .in('status', UNLOGGED_STATUSES)
        .is('credit_snapshot', null)
        .select('id, student_id')
    if (claimError) return { ok: false, error: `lesson update failed: ${claimError.message}` }
    if (!claimed || claimed.length === 0) return { ok: false, changed: true, status: null }
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

    try {
        revalidatePath('/admin')
        revalidatePath('/student')
    } catch {
        // Outside a request (scripts): nothing to revalidate.
    }
    return { ok: true, studentId, previousCredits, newCredits }
}
