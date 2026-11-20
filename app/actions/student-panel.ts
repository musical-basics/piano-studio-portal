'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { loadStudentPanel, type StudentPanelData } from '@/lib/core/student-panel'

/** Admin: one student's side panel (#1087): lessons, lessons left, last messages, recent changes. Read only. */
export async function getStudentPanel(studentId: string): Promise<StudentPanelData | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    try {
        return await loadStudentPanel(createAdminClient(), String(studentId ?? ''))
    } catch (err: any) {
        console.error('[getStudentPanel] failed:', err?.message)
        return { error: err?.message ?? 'Could not load this student' }
    }
}
