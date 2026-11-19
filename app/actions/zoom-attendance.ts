'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { loadAttendanceViews } from '@/lib/core/zoom-lesson-attendance'
import type { AttendanceView } from '@/lib/zoom-lesson-attendance'

/**
 * Admin: the saved Zoom attendance (#964, #965) for the lessons on screen, by
 * lesson id. The table is service-role only, so this is the only way to it.
 */
export async function getLessonAttendance(lessonIds: string[]): Promise<{ views: Record<string, AttendanceView> } | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) return { views: {} }
    try {
        return { views: await loadAttendanceViews(createAdminClient(), lessonIds.slice(0, 1000).map(String)) }
    } catch (err: any) {
        console.error('[getLessonAttendance] failed:', err?.message)
        return { error: err?.message ?? 'Could not load Zoom attendance' }
    }
}
