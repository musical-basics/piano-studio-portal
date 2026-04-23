import { revalidatePath } from 'next/cache'
import type { DbClient } from '@/lib/supabase/admin'

export type StudentStatus = 'active' | 'inactive'

export const ALLOWED_STUDENT_STATUSES: readonly StudentStatus[] = ['active', 'inactive'] as const

export type UpdateStudentStatusResult =
    | { student: Record<string, any> }
    | { error: string }

export async function updateStudentStatusCore(
    client: DbClient,
    studentId: string,
    status: StudentStatus,
): Promise<UpdateStudentStatusResult> {
    if (!ALLOWED_STUDENT_STATUSES.includes(status)) {
        return { error: `status must be one of: ${ALLOWED_STUDENT_STATUSES.join(', ')}` }
    }

    const { data, error } = await client
        .from('profiles')
        .update({ status })
        .eq('id', studentId)
        .eq('role', 'student')
        .select()
        .single()

    if (error) {
        if (error.code === 'PGRST116') {
            return { error: 'Student not found' }
        }
        console.error('updateStudentStatusCore error:', error)
        return { error: error.message }
    }
    if (!data) return { error: 'Student not found' }

    revalidatePath('/admin')
    return { student: data }
}

export type AdjustCreditsArgs =
    | { mode: 'delta'; amount: number }
    | { mode: 'set'; amount: number }

export type AdjustCreditsResult =
    | {
          student: Record<string, any>
          previous_credits: number
          new_credits: number
      }
    | { error: string }

/**
 * Adjust a single student's credits.
 *
 * - mode=delta: new_credits = current + amount  (amount may be negative)
 * - mode=set:   new_credits = amount
 *
 * Only touches `credits`; `credits_total` (lifetime purchased) is left alone.
 * Rejects calls that would drive credits below 0.
 *
 * NB: delta mode is not idempotent on retry. Prefer `set` when idempotency
 * matters (e.g. on an unreliable network).
 */
export async function adjustStudentCreditsCore(
    client: DbClient,
    studentId: string,
    args: AdjustCreditsArgs,
): Promise<AdjustCreditsResult> {
    if (!Number.isInteger(args.amount)) {
        return { error: 'amount must be an integer' }
    }
    if (args.mode === 'delta' && args.amount === 0) {
        return { error: 'delta must be non-zero' }
    }
    if (args.mode === 'set' && args.amount < 0) {
        return { error: 'set value must be >= 0' }
    }

    const { data: student, error: fetchError } = await client
        .from('profiles')
        .select('id, credits')
        .eq('id', studentId)
        .eq('role', 'student')
        .single()

    if (fetchError || !student) {
        return { error: 'Student not found' }
    }

    const previous = (student as any).credits as number
    const next = args.mode === 'delta' ? previous + args.amount : args.amount

    if (next < 0) {
        return { error: `adjustment would take credits to ${next}; minimum is 0` }
    }

    const { data: updated, error: updateError } = await client
        .from('profiles')
        .update({ credits: next })
        .eq('id', studentId)
        .eq('role', 'student')
        .select()
        .single()

    if (updateError) {
        console.error('adjustStudentCreditsCore update error:', updateError)
        return { error: updateError.message }
    }
    if (!updated) return { error: 'Student not found after update' }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        student: updated,
        previous_credits: previous,
        new_credits: next,
    }
}
