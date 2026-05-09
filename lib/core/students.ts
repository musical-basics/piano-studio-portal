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

const DAYS_OF_WEEK = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
] as const

type DayOfWeek = (typeof DAYS_OF_WEEK)[number]

export type WeeklySettingsInput = {
    lesson_day?: string | null
    lesson_time?: string | null
    lesson_duration?: number | null
    timezone?: string | null
    status?: string | null
}

export type UpdateStudentSettingsResult =
    | { student: Record<string, any> }
    | { error: string }

function isValidIanaTimezone(tz: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz })
        return true
    } catch {
        return false
    }
}

function normalizeDay(input: string): DayOfWeek | null {
    const trimmed = input.trim()
    if (!trimmed) return null
    const cap = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
    return (DAYS_OF_WEEK as readonly string[]).includes(cap) ? (cap as DayOfWeek) : null
}

/**
 * Update a student's regular weekly lesson settings (the source-of-truth fields
 * on `profiles` that the admin UI exposes in the "edit student" modal). All
 * fields are optional; only provided fields are updated.
 *
 * Does NOT touch existing scheduled lessons — this only changes the default
 * weekly template used when generating future lessons.
 */
export async function updateStudentSettingsCore(
    client: DbClient,
    studentId: string,
    input: WeeklySettingsInput,
): Promise<UpdateStudentSettingsResult> {
    const update: Record<string, any> = {}

    if (input.lesson_day !== undefined) {
        if (input.lesson_day === null || input.lesson_day === '') {
            update.lesson_day = null
        } else if (typeof input.lesson_day !== 'string') {
            return { error: 'lesson_day must be a string day name (e.g. "Thursday")' }
        } else {
            const day = normalizeDay(input.lesson_day)
            if (!day) {
                return {
                    error: `lesson_day must be one of: ${DAYS_OF_WEEK.join(', ')}`,
                }
            }
            update.lesson_day = day
        }
    }

    if (input.lesson_time !== undefined) {
        if (input.lesson_time === null || input.lesson_time === '') {
            update.lesson_time = null
        } else if (typeof input.lesson_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.lesson_time)) {
            return { error: 'lesson_time must be in 24-hour HH:MM format (e.g. "18:00")' }
        } else {
            update.lesson_time = input.lesson_time
        }
    }

    if (input.lesson_duration !== undefined) {
        if (input.lesson_duration === null) {
            update.lesson_duration = null
        } else if (
            typeof input.lesson_duration !== 'number' ||
            !Number.isInteger(input.lesson_duration) ||
            input.lesson_duration <= 0
        ) {
            return { error: 'lesson_duration must be a positive integer (minutes)' }
        } else {
            update.lesson_duration = input.lesson_duration
        }
    }

    if (input.timezone !== undefined) {
        if (input.timezone === null || input.timezone === '') {
            update.timezone = null
        } else if (typeof input.timezone !== 'string' || !isValidIanaTimezone(input.timezone)) {
            return { error: 'timezone must be a valid IANA timezone (e.g. "America/Los_Angeles")' }
        } else {
            update.timezone = input.timezone
        }
    }

    if (input.status !== undefined) {
        if (!ALLOWED_STUDENT_STATUSES.includes(input.status as StudentStatus)) {
            return {
                error: `status must be one of: ${ALLOWED_STUDENT_STATUSES.join(', ')}`,
            }
        }
        update.status = input.status
    }

    if (Object.keys(update).length === 0) {
        return {
            error: 'No updatable fields provided. Allowed: lesson_day, lesson_time, lesson_duration, timezone, status',
        }
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await client
        .from('profiles')
        .update(update)
        .eq('id', studentId)
        .eq('role', 'student')
        .select()
        .single()

    if (error) {
        if (error.code === 'PGRST116') {
            return { error: 'Student not found' }
        }
        console.error('updateStudentSettingsCore error:', error)
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
