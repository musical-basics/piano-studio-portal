'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/require-admin'
import {
    attachRecordingToLessonByHand,
    deleteNoShowRecording,
    listClassroomRecordingsForAdmin,
    type AdminRecordingRow,
} from '@/lib/classroom-recordings'

export type { AdminRecordingRow }

/** Admin "Classroom recordings" tab: every recording, newest first, with where it went. */
export async function getClassroomRecordings(): Promise<{ rows: AdminRecordingRow[] } | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    try {
        return { rows: await listClassroomRecordingsForAdmin() }
    } catch (err: any) {
        return { error: err?.message || 'Could not load the recordings' }
    }
}

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
