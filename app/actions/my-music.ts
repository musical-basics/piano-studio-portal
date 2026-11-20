'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImpersonationTarget } from '@/app/actions/impersonate'
import { loadFamilyMusic, type FamilyMusic } from '@/lib/core/my-music'

/**
 * The family portal's "My music" tab (#1083): every piece of sheet music
 * Lionel has sent this student, newest first.
 *
 * Reads with the service key, so it checks the caller itself (a server action
 * can be called by anyone who has its id): the signed-in student gets their
 * own list; an admin previewing a student (impersonation cookie) gets that
 * student's. Storage buckets are public, so the stored links open as they are.
 */
export async function getMyMusic(): Promise<FamilyMusic | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in again.' }

    let studentId: string
    const { studentId: previewing } = await getImpersonationTarget()
    if (previewing) {
        studentId = previewing
    } else {
        const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (me?.role !== 'student') return { error: 'Only students have a music list.' }
        studentId = user.id
    }

    try {
        return await loadFamilyMusic(createAdminClient(), studentId)
    } catch (err) {
        console.error('getMyMusic failed:', err)
        return { error: 'Could not load your music. Please try again.' }
    }
}
