'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImpersonationTarget } from '@/app/actions/impersonate'
import { claimMakeupSlotCore, getMakeupOptionsCore, type MoveOptions } from '@/lib/core/move-requests'
import { FAMILY_MAKEUP_PICKER_ON } from '@/lib/studio-policy'

export type { MoveOptions }

/**
 * The family make-up picker (#927): the family moves its own lesson to one of
 * Lionel's free times in the next two weeks, straight away. The slots come from
 * the same finder as "Request a different time" (#878), and a claim is the
 * usual reschedule (rescheduleLessonCore: Zoom, calendar, the usual email),
 * see lib/core/move-requests.ts. Both refuse while FAMILY_MAKEUP_PICKER_ON is
 * off (lib/studio-policy.ts).
 *
 * These run with the service key, so they check the caller themselves: a
 * server action can be called by anyone who has its id.
 */

const OFF = 'Picking a new time yourself is not available right now. Use "Request a different time", or message your teacher.'

type Caller = { userId: string; role: string | null }

async function caller(): Promise<Caller | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return { userId: user.id, role: (me?.role as string) ?? null }
}

/** The free times for one lesson. An admin previewing a student sees theirs (read only). Changes nothing. */
export async function getMakeupOptions(lessonId: string): Promise<MoveOptions | { error: string }> {
    if (!FAMILY_MAKEUP_PICKER_ON) return { error: OFF }
    const me = await caller()
    if (!me) return { error: 'Please sign in again.' }
    let studentId = me.userId
    if (me.role === 'admin') {
        const { studentId: previewing } = await getImpersonationTarget()
        if (!previewing) return { error: 'Only the family can pick a new time.' }
        studentId = previewing
    }
    return getMakeupOptionsCore(createAdminClient(), studentId, lessonId)
}

/**
 * Moves the signed-in family's own lesson to one of the offered times.
 * `slotId` is "YYYY-MM-DD_HH:MM" (studio time). Only the family itself: an
 * admin, previewing a student or not, is refused.
 */
export async function claimMakeupSlot(slotId: string, lessonId: string): Promise<{ success: true; message: string } | { error: string }> {
    if (!FAMILY_MAKEUP_PICKER_ON) return { error: OFF }
    const me = await caller()
    if (!me) return { error: 'Please sign in again.' }
    if (me.role === 'admin') return { error: 'This is a preview: only the family can move its lesson.' }
    const [date, time] = String(slotId).split('_')
    const result = await claimMakeupSlotCore(createAdminClient(), { studentId: me.userId, lessonId, date: date || '', time: time || '' })
    revalidatePath('/student')
    revalidatePath('/admin')
    if ('error' in result) return result
    return { success: true, message: `Your lesson is now on ${result.toLabel}. You'll get the usual "Lesson Rescheduled" email.` }
}
