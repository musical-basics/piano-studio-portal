'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { loadDayChanges } from '@/lib/core/day-changes'
import { studioToday } from '@/lib/studio-timezone'
import type { DayChange } from '@/lib/day-changes'

/** Admin: one studio day of lesson and credit changes, newest first (#1005). Read only. */
export async function getDayChanges(date?: string): Promise<{ date: string; changes: DayChange[] } | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : studioToday()
    try {
        return { date: day, changes: await loadDayChanges(createAdminClient(), day) }
    } catch (err: any) {
        console.error('[getDayChanges] failed:', err?.message)
        return { error: err?.message ?? 'Could not load the changes' }
    }
}
