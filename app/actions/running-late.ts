'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
    getRunningLatePreviewCore,
    runningLateCore,
    type RunningLatePreview,
    type RunningLateResult,
} from '@/lib/core/running-late'

export type { RunningLatePreview, RunningLateResult }

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

/** Who "Running late" would go to, for the confirm step. Changes nothing. */
export async function getRunningLatePreview(lessonId: string): Promise<RunningLatePreview | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return getRunningLatePreviewCore(lessonId)
}

/** Sends "My apologies, running late, be on in N mins" to that one family. */
export async function sendRunningLate(lessonId: string, minutes: number, expectedMessage: string): Promise<RunningLateResult> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    const result = await runningLateCore({ adminId: admin, lessonId, minutes, expectedMessage })
    revalidatePath('/admin')
    return result
}
