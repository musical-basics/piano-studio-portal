'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const IMPERSONATE_COOKIE = 'studio_impersonate'

/**
 * Admin-only: set a cookie so /student renders as the given student.
 */
export async function impersonateStudent(studentId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') return { error: 'Admins only' }

    const cookieStore = await cookies()
    cookieStore.set(IMPERSONATE_COOKIE, studentId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // Session cookie — clears when browser closes, or explicitly cleared
    })

    redirect('/student')
}

/**
 * Clear the impersonation cookie and return to /admin.
 */
export async function stopImpersonating() {
    const cookieStore = await cookies()
    cookieStore.delete(IMPERSONATE_COOKIE)
    redirect('/admin')
}

/**
 * Read the current impersonation target (server-side only).
 * Returns null if no impersonation is active or the caller is not admin.
 */
export async function getImpersonationTarget(): Promise<{ studentId: string | null; adminId: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { studentId: null, adminId: null }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') return { studentId: null, adminId: null }

    const cookieStore = await cookies()
    const studentId = cookieStore.get(IMPERSONATE_COOKIE)?.value ?? null

    return { studentId, adminId: user.id }
}
