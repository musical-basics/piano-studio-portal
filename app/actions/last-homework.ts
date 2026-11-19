'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { findLastHomework, type LastHomework } from '@/lib/last-homework'

/**
 * Last lesson's homework for the admin log dialogs (#943), to pre-fill their
 * Homework box. Runs with the service key, so it checks the caller first.
 * Null when there is none, the caller is not the admin, or the lookup fails
 * (the box then simply starts empty, as before).
 */
export async function getLastHomework(studentId: string, date: string, time: string): Promise<LastHomework | null> {
    if (await requireAdmin()) return null
    try {
        return await findLastHomework(createAdminClient(), studentId, { date, time })
    } catch (e) {
        console.error('[getLastHomework] failed:', e instanceof Error ? e.message : e)
        return null
    }
}
