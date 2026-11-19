'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImpersonationTarget } from '@/app/actions/impersonate'

/**
 * #876: the family ticks "lessons may be recorded for our own review" once in the
 * student portal. Saves the date on their profile, only the first time. An admin
 * previewing a student sees the notice but never agrees on the family's behalf.
 */
export async function agreeRecordingConsent(): Promise<{ ok: true; preview?: boolean } | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in again.' }

    const { studentId } = await getImpersonationTarget()
    if (studentId) return { ok: true, preview: true }

    const admin = createAdminClient()
    const { error } = await admin
        .from('profiles')
        .update({ recording_consent_at: new Date().toISOString() })
        .eq('id', user.id)
        .in('role', ['student', 'prospect'])
        .is('recording_consent_at', null)
    if (error) {
        console.error('[recording-consent] could not save:', error.message)
        return { error: 'Could not save that, please try again.' }
    }
    return { ok: true }
}
