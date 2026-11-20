'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { classroomAttendanceByLesson, type LessonSlot } from '@/lib/core/classroom-lesson-attendance'
import type { ClassroomAttendance } from '@/lib/classroom-lesson-attendance'

/**
 * Admin (#1103): who was in the classroom room for the lessons on screen, by
 * lesson id, from the classroom's attendance record (service role only, so
 * this is the only way to it). Only lessons that have started and have
 * something to show are in the answer.
 */
export async function getClassroomAttendance(lessonIds: string[]): Promise<{ views: Record<string, ClassroomAttendance> } | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) return { views: {} }
    try {
        const client = createAdminClient()
        const ids = [...new Set(lessonIds.slice(0, 1000).map(String))]
        const slots: LessonSlot[] = []
        for (let i = 0; i < ids.length; i += 200) {
            const { data, error } = await client
                .from('lessons')
                .select('id, student_id, date, time, duration')
                .in('id', ids.slice(i, i + 200))
            if (error) throw new Error(`lessons query failed: ${error.message}`)
            for (const l of data || []) {
                slots.push({ id: l.id, studentId: l.student_id, date: l.date, time: String(l.time).slice(0, 5), duration: l.duration || 60 })
            }
        }
        const found = await classroomAttendanceByLesson(client, slots)
        const views: Record<string, ClassroomAttendance> = {}
        for (const [id, got] of found) if (got.attendance) views[id] = got.attendance
        return { views }
    } catch (err: any) {
        console.error('[getClassroomAttendance] failed:', err?.message)
        return { error: err?.message ?? 'Could not load classroom attendance' }
    }
}
