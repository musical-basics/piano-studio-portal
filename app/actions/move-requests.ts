'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImpersonationTarget } from '@/app/actions/impersonate'
import {
    approveMoveRequestCore,
    declineMoveRequestCore,
    fileMoveRequestCore,
    getMoveOptionsCore,
    withdrawMoveRequestCore,
    type MoveDecision,
    type MoveOptions,
} from '@/lib/core/move-requests'

export type { MoveDecision, MoveOptions }

// These run with the service key, so they check the caller themselves: a server
// action can be called by anyone who has its id.

type Caller = { userId: string; role: string | null }

async function caller(): Promise<Caller | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return { userId: user.id, role: (me?.role as string) ?? null }
}

/**
 * The free times for one lesson (#878). A family sees its own lessons; an admin
 * previewing a student sees theirs too (read only). Changes nothing.
 */
export async function getMoveOptions(lessonId: string): Promise<MoveOptions | { error: string }> {
    const me = await caller()
    if (!me) return { error: 'Please sign in again.' }
    let studentId = me.userId
    if (me.role === 'admin') {
        const { studentId: previewing } = await getImpersonationTarget()
        if (!previewing) return { error: 'Only the family can ask to move a lesson.' }
        studentId = previewing
    }
    return getMoveOptionsCore(createAdminClient(), studentId, lessonId)
}

/**
 * The family asks to move one of its own lessons to one of the offered times,
 * with an optional short note for Lionel (#1346).
 * Only the family itself: an admin (previewing a student or not) is refused.
 */
export async function requestLessonMove(lessonId: string, date: string, time: string, note?: string | null): Promise<{ success: true; toLabel: string } | { error: string }> {
    const me = await caller()
    if (!me) return { error: 'Please sign in again.' }
    if (me.role === 'admin') return { error: 'This is a preview: only the family can send a request.' }
    const result = await fileMoveRequestCore(createAdminClient(), { studentId: me.userId, lessonId, date, time, note })
    revalidatePath('/student')
    revalidatePath('/admin')
    return result
}

/** The family takes back its own pending request. */
export async function withdrawLessonMove(requestId: string): Promise<{ success: true } | { error: string }> {
    const me = await caller()
    if (!me) return { error: 'Please sign in again.' }
    if (me.role === 'admin') return { error: 'This is a preview: only the family can withdraw its request.' }
    const result = await withdrawMoveRequestCore(createAdminClient(), { studentId: me.userId, requestId })
    revalidatePath('/student')
    revalidatePath('/admin')
    return result
}

/** Admin: approve a family's request, which runs the usual reschedule. */
export async function approveMoveRequest(requestId: string): Promise<MoveDecision> {
    const me = await caller()
    if (!me || me.role !== 'admin') return { error: 'Only admins can do that' }
    const result = await approveMoveRequestCore({ client: createAdminClient(), adminId: me.userId, requestId, via: 'admin' })
    revalidatePath('/admin')
    revalidatePath('/student')
    return result
}

/** Admin: decline a family's request. Nothing is sent. */
export async function declineMoveRequest(requestId: string): Promise<MoveDecision> {
    const me = await caller()
    if (!me || me.role !== 'admin') return { error: 'Only admins can do that' }
    const result = await declineMoveRequestCore({ client: createAdminClient(), requestId, via: 'admin' })
    revalidatePath('/admin')
    revalidatePath('/student')
    return result
}
