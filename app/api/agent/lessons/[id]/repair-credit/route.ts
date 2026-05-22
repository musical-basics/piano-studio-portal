import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'

/**
 * POST /api/agent/lessons/:id/repair-credit
 *
 * Explicitly repairs a lesson that was completed without credit deduction
 * (e.g. via Zoom webhook before the fix, or any system path that bypassed
 * logLessonCore).
 *
 * Safe to call multiple times: if the lesson already has credit snapshots,
 * returns 200 with already_charged: true and makes no changes.
 *
 * Response:
 *   { repaired: true, previous_credits, new_credits }   — credit was deducted
 *   { already_charged: true }                           — no-op, snapshots present
 *   { error: string }                                   — failure
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { id } = await params
    if (!id) return agentError('Missing lesson id', 400)

    // Fetch current lesson state
    const { data: lesson, error: lessonFetchError } = await ctx.client
        .from('lessons')
        .select('student_id, status, credit_snapshot_before, credit_snapshot')
        .eq('id', id)
        .single()

    if (lessonFetchError || !lesson) {
        return agentError('Lesson not found', 404)
    }

    if (lesson.status !== 'completed') {
        return agentError(
            `Lesson status is '${lesson.status}'. repair-credit only applies to completed lessons.`,
            400,
        )
    }

    // Already charged — safe no-op
    const hasSnapshots =
        lesson.credit_snapshot_before !== null || lesson.credit_snapshot !== null
    if (hasSnapshots) {
        return agentOk({
            already_charged: true,
            credit_snapshot_before: lesson.credit_snapshot_before,
            credit_snapshot: lesson.credit_snapshot,
            message: 'Lesson already has credit snapshots. No action taken.',
        })
    }

    // Fetch current credits
    const { data: profile, error: profileError } = await ctx.client
        .from('profiles')
        .select('credits')
        .eq('id', lesson.student_id)
        .single()

    if (profileError || !profile) {
        return agentError('Failed to fetch student credits', 500)
    }

    const previousCredits = Number(profile.credits ?? 0)
    const newCredits = previousCredits - 1

    // Deduct credit
    const { error: creditError } = await ctx.client
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', lesson.student_id)

    if (creditError) {
        return agentError('Failed to deduct credit: ' + creditError.message, 500)
    }

    // Write credit snapshots + mark completed_source
    const { error: snapshotError } = await ctx.client
        .from('lessons')
        .update({
            credit_snapshot_before: previousCredits,
            credit_snapshot: newCredits,
            completed_source: 'system', // explicit repair
        })
        .eq('id', id)

    if (snapshotError) {
        // Credit was deducted but snapshot failed — log and surface as warning
        console.error('repair-credit: snapshot write failed after deduction:', snapshotError)
        return agentOk({
            repaired: true,
            credit_deducted: true,
            snapshot_warning: snapshotError.message,
            previous_credits: previousCredits,
            new_credits: newCredits,
            message: `Credit deducted (${previousCredits} -> ${newCredits}) but snapshot write failed. Check logs.`,
        })
    }

    return agentOk({
        repaired: true,
        previous_credits: previousCredits,
        new_credits: newCredits,
        message: `Credit repaired: ${previousCredits} -> ${newCredits}. Snapshots written.`,
    })
}
