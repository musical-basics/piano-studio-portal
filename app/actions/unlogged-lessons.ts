'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    logUnloggedLessonForAdmin,
    removeUnloggedLessonForAdmin,
    setLessonHold,
    type AdminUnloggedLesson,
    type ExpectedLesson,
    type UnloggedActionResult,
} from '@/lib/admin-unlogged-lessons'

export type { AdminUnloggedLesson, UnloggedActionResult }

// These run with the service key, so they check the caller themselves: a server
// action can be called by anyone who has its id.
async function adminId(): Promise<string | { ok: false; text: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, text: 'Unauthorized' }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return { ok: false, text: 'Only admins can do that' }
    return user.id
}

/** "Log it" from the badge's list (#760). */
export async function logUnloggedLesson(
    expected: ExpectedLesson,
    notes: string,
    homework: string,
): Promise<UnloggedActionResult> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return logUnloggedLessonForAdmin(createAdminClient(), admin, expected, { notes, homework })
}

/** "Didn't happen" from the badge's list (#760). */
export async function removeUnloggedLesson(expected: ExpectedLesson): Promise<UnloggedActionResult> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return removeUnloggedLessonForAdmin(createAdminClient(), expected)
}

/** #989: put a lesson on hold with a reason (out of the count and the emails). */
export async function holdUnloggedLesson(lessonId: string, reason: string): Promise<UnloggedActionResult> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return setLessonHold(createAdminClient(), lessonId, reason)
}

/** #989: release a held lesson back to the unlogged list. */
export async function releaseHeldLesson(lessonId: string): Promise<UnloggedActionResult> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return setLessonHold(createAdminClient(), lessonId, null)
}
