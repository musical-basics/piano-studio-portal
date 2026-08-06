'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// Token-based announcement-email opt-out (linked from email footers).
// Only affects announcement emails (recital invites etc.); lesson emails
// are transactional and unaffected.

export async function getUnsubscribeContext(publicId: string) {
    const supabase = createAdminClient()
    const { data: profile } = await supabase
        .from('profiles')
        .select('name, email, announcement_emails_opt_out')
        .eq('public_id', publicId)
        .maybeSingle()
    if (!profile) return { error: 'Invalid link' }
    return {
        name: profile.name || profile.email || 'there',
        optedOut: Boolean(profile.announcement_emails_opt_out),
    }
}

export async function setAnnouncementOptOut(publicId: string, optOut: boolean) {
    const supabase = createAdminClient()
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('public_id', publicId)
        .maybeSingle()
    if (!profile) return { error: 'Invalid link' }

    const { error } = await supabase
        .from('profiles')
        .update({ announcement_emails_opt_out: optOut })
        .eq('id', profile.id)
    if (error) return { error: 'Failed to update your preference. Please try again.' }
    return { success: true }
}
