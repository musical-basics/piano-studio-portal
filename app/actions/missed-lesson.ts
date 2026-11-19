'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
    getMissedLessonMakeupSlotsCore,
    getMissedLessonPreviewCore,
    missedLessonCore,
    type FreeSlot,
    type MissedLessonPreview,
    type MissedLessonResult,
} from '@/lib/core/missed-lesson'

export type { FreeSlot, MissedLessonPreview, MissedLessonResult }

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

/** What "I missed this" will do for a lesson, for the confirm dialog. Changes nothing. */
export async function getMissedLessonPreview(lessonId: string): Promise<MissedLessonPreview | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return getMissedLessonPreviewCore(lessonId)
}

/** Free slots in the next 7 days for a make-up of this lesson (#789). Changes nothing. */
export async function getMissedLessonMakeupSlots(lessonId: string): Promise<{ slots: FreeSlot[]; duration: number } | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return getMissedLessonMakeupSlotsCore(lessonId)
}

/**
 * The teacher missed this lesson: one apology, lesson removed, plus the $15
 * Account Credit and/or a make-up lesson (at least one). With no options it
 * does what it always did: the $15 only.
 */
export async function markLessonMissed(
    lessonId: string,
    expectedMessage: string,
    options?: { credit: boolean; makeup: { date: string; time: string } | null },
): Promise<MissedLessonResult> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    const result = await missedLessonCore({
        adminId: admin,
        lessonId,
        expectedMessage,
        credit: options ? options.credit : true,
        makeup: options ? options.makeup : null,
    })
    revalidatePath('/admin')
    revalidatePath('/student')
    return result
}
