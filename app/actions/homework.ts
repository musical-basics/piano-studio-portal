'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setHomeworkTickCore } from '@/lib/core/homework'

/**
 * The family ticks (or unticks) one item of its current homework (#945).
 * Runs with the service key, so it checks the caller itself: only the signed-in
 * family, never an admin (previewing a student or not).
 */
export async function tickHomework(lessonId: string, index: number, text: string, checked: boolean): Promise<{ success: true } | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in again.' }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role === 'admin') return { error: 'This is a preview: only the family can tick its homework.' }
    const result = await setHomeworkTickCore(createAdminClient(), { studentId: user.id, lessonId, index, text, checked: Boolean(checked) })
    revalidatePath('/admin')
    return result
}
