'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isValidEmail } from '@/lib/notification-email'
import { getImpersonationTarget } from '@/app/actions/impersonate'

export async function updatePassword(formData: FormData) {
    const supabase = await createClient()

    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (!password || !confirmPassword) {
        return { error: 'Password is required' }
    }

    if (password !== confirmPassword) {
        return { error: 'Passwords do not match' }
    }

    if (password.length < 6) {
        return { error: 'Password must be at least 6 characters' }
    }

    // Update the currently logged-in user
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/student/settings')
    return { success: true, message: 'Password updated successfully' }
}

/**
 * Where this student's notifications should be delivered.
 *
 * Returns both the login email (which is the auth identity and can't be changed
 * here) and the delivery override, so the settings form can show what is
 * actually being used today.
 */
export async function getNotificationEmail(): Promise<{
    loginEmail: string | null
    notificationEmail: string | null
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { loginEmail: null, notificationEmail: null, error: 'Unauthorized' }

    const { studentId } = await getImpersonationTarget()
    const selfId = studentId ?? user.id

    // `*` rather than a column list: the override is a newer column, and a stale
    // schema shouldn't turn the whole settings page into an error.
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', selfId)
        .single()

    if (error || !data) {
        return { loginEmail: null, notificationEmail: null, error: 'Could not load your account' }
    }

    return {
        loginEmail: data.email ?? null,
        notificationEmail: (data as any).notification_email ?? null,
    }
}

/**
 * Point notifications at a different inbox.
 *
 * This is delivery-only: `profiles.email` stays the login identity (it mirrors
 * the Supabase auth user), so signing in is unaffected. Students whose account
 * was created with a parent's address use this to route lesson and message
 * notifications to themselves.
 *
 * Submitting an empty value clears the override and falls back to the login email.
 */
export async function updateNotificationEmail(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { studentId } = await getImpersonationTarget()
    const selfId = studentId ?? user.id

    const raw = ((formData.get('notificationEmail') as string) || '').trim()

    if (raw && !isValidEmail(raw)) {
        return { error: 'That does not look like a valid email address' }
    }

    // Service-role client so an admin previewing a student writes to the
    // student's row rather than their own; the id above is the authorization.
    const client = studentId ? createAdminClient() : supabase

    const { error } = await client
        .from('profiles')
        .update({ notification_email: raw || null })
        .eq('id', selfId)

    if (error) {
        console.error('updateNotificationEmail error:', error)
        return { error: 'Could not save that email. Please try again.' }
    }

    revalidatePath('/student/settings')
    revalidatePath('/student')

    return {
        success: true,
        message: raw
            ? `Notifications will now go to ${raw}`
            : 'Notifications will go back to your login email',
    }
}
