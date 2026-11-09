import { createClient } from '@/lib/supabase/server'

/**
 * For server actions that use the service key: they must check the caller
 * themselves, because a server action can be called by anyone who has its id,
 * not only from the admin pages. Previewing as a student still passes, since
 * the signed-in user is still the admin.
 *
 * Returns null for the admin, otherwise the error to send back.
 */
export async function requireAdmin(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Unauthorized'
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return me?.role === 'admin' ? null : 'Only admins can do that'
}
