'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
    getUndoLogPreviewCore,
    undoLessonLogCore,
    type UndoLogMode,
    type UndoLogPreview,
    type UndoLogResult,
} from '@/lib/core/undo-log'

export type { UndoLogMode, UndoLogPreview, UndoLogResult }

// These run with the service key, so they check the caller themselves: a server
// action can be called by anyone who has its id.
async function adminId(): Promise<string | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return { error: 'Only admins can do that' }
    return user.id
}

/** What "Undo log" would do for a logged lesson, for the confirm dialog. Changes nothing. */
export async function getUndoLogPreview(lessonId: string): Promise<UndoLogPreview | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return getUndoLogPreviewCore(lessonId)
}

/** Gives back the credit a log took, with a reason; family message only when asked (#794). */
export async function undoLessonLog(
    lessonId: string,
    options: { reason: string; mode: UndoLogMode; sendFamilyMessage: boolean; expectedMessage?: string },
): Promise<UndoLogResult> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    const result = await undoLessonLogCore({ adminId: admin, lessonId, ...options })
    revalidatePath('/admin')
    revalidatePath('/student')
    return result
}
