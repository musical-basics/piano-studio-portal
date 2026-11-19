'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { checkFreeTrial } from '@/lib/free-trial'

/**
 * Whether the lesson in the admin log dialog is the student's free trial
 * (#946, lib/free-trial.ts), so the dialog can say it will be logged free.
 * `lessonId` is null for "log a past lesson". False when the caller is not
 * the admin or anything fails (the log itself decides again on save).
 */
export async function isFreeTrialLesson(studentId: string, lessonId: string | null, date: string, time: string): Promise<boolean> {
    if (await requireAdmin()) return false
    const decision = await checkFreeTrial(createAdminClient(), { studentId, lessonId, date, time })
    return decision.trial
}
