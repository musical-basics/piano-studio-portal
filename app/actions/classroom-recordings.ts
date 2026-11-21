'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/require-admin'
import {
    attachRecordingToLessonByHand,
    deleteNoShowRecording,
    type AdminRecordingRow,
} from '@/lib/classroom-recordings'

// The list itself is the Recordings view's (app/actions/admin-recordings.ts, #1916).
export type { AdminRecordingRow }

/** One-click attach: sets the lesson's video only (no logging, no credits, no email). */
export async function attachClassroomRecording(recordingId: string, lessonId: string) {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    const result = await attachRecordingToLessonByHand(recordingId, lessonId)
    if ('success' in result) {
        revalidatePath('/admin')
        revalidatePath('/student')
    }
    return result
}

/** One-tap Delete for a test or no-show recording (#1096): under 5 minutes, on no lesson. Removes the file and the row. */
export async function deleteClassroomRecording(recordingId: string) {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    const result = await deleteNoShowRecording(recordingId)
    if ('success' in result) revalidatePath('/admin')
    return result
}
