'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isValidEmail } from '@/lib/notification-email'
import { getImpersonationTarget } from '@/app/actions/impersonate'
import { toE164 } from '@/lib/phone'
import { smsConfigured } from '@/lib/sms'

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

export type TextSettings = {
    /** False until the studio's texting number is set up; the settings card stays hidden. */
    available: boolean
    smsPhone: string | null
    smsOptIn: boolean
}

/** This family's texting number and whether they've asked for texts. */
export async function getTextSettings(): Promise<TextSettings> {
    const off: TextSettings = { available: false, smsPhone: null, smsOptIn: false }
    if (!smsConfigured()) return off

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return off

    const { studentId } = await getImpersonationTarget()
    const { data } = await createAdminClient()
        .from('profiles')
        .select('*')
        .eq('id', studentId ?? user.id)
        .single()

    return {
        available: true,
        smsPhone: (data as any)?.sms_phone ?? null,
        smsOptIn: Boolean((data as any)?.sms_opt_in),
    }
}

/**
 * The family turns texts on or off for themselves. Turning them on is their
 * consent, so it's stamped with when and where it was given.
 */
export async function updateTextSettings(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { studentId } = await getImpersonationTarget()
    const selfId = studentId ?? user.id

    const raw = ((formData.get('smsPhone') as string) || '').trim()
    const phone = raw ? toE164(raw) : null
    const optIn = formData.get('smsOptIn') === 'true'

    if (raw && !phone) return { error: 'That number doesn\'t look right. Use 10 digits, or + and your country code.' }
    if (optIn && !phone) return { error: 'Add your mobile number to get texts.' }

    const client = createAdminClient()
    const { data: before } = await client.from('profiles').select('*').eq('id', selfId).single()
    if (!before || !['student', 'prospect'].includes((before as any).role)) return { error: 'Could not load your account' }

    const { error } = await client
        .from('profiles')
        .update({
            sms_phone: phone,
            sms_opt_in: optIn,
            ...(optIn && !(before as any).sms_opt_in
                ? { sms_opt_in_at: new Date().toISOString(), sms_opt_in_source: 'portal' }
                : {}),
        })
        .eq('id', selfId)

    if (error) {
        console.error('updateTextSettings error:', error)
        return { error: 'Could not save that. Please try again.' }
    }

    revalidatePath('/student/settings')
    return {
        success: true,
        message: optIn ? 'You\'ll get Lionel\'s messages by text too. Reply to a text to answer.' : 'Texts are off.',
    }
}
