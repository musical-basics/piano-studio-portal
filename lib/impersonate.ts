/**
 * Server-side helper to resolve the "effective" user ID for student-facing actions.
 *
 * When an admin has set the studio_impersonate cookie, student-facing server actions
 * should load data for the impersonated student, not for the admin's own account.
 *
 * Usage in any 'use server' action:
 *
 *   import { resolveEffectiveUserId } from '@/lib/impersonate'
 *   const effectiveUserId = await resolveEffectiveUserId(supabase, user.id)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const IMPERSONATE_COOKIE = 'studio_impersonate'

export async function resolveEffectiveUserId(
    supabase: SupabaseClient,
    callerId: string
): Promise<string> {
    try {
        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        const impersonatingId = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null

        if (!impersonatingId) return callerId

        // Verify caller is an admin before honouring the cookie
        const { data: callerProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', callerId)
            .single()

        if (callerProfile?.role === 'admin') {
            return impersonatingId
        }
    } catch {
        // If cookies() fails (e.g. during static generation) fall back to caller
    }

    return callerId
}
