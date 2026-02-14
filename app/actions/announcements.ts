'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

function getAdminSupabase() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

/**
 * Save or update a draft announcement (no emails sent).
 */
export async function saveAnnouncementDraft(
    subject: string,
    body: string,
    studentIds: string[],
    existingId?: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const adminDb = getAdminSupabase()

    const { data: profile } = await adminDb
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    if (profile?.role !== 'admin') return { error: 'Only admins can save drafts' }

    let announcementId = existingId

    if (existingId) {
        // Update existing draft
        const { error } = await adminDb
            .from('announcements')
            .update({ subject, body })
            .eq('id', existingId)
            .eq('status', 'draft')

        if (error) return { error: error.message }

        // Re-sync recipients: delete old, insert new
        await adminDb
            .from('announcement_recipients')
            .delete()
            .eq('announcement_id', existingId)
    } else {
        // Create new draft
        const { data: newAnn, error } = await adminDb
            .from('announcements')
            .insert({ subject, body, teacher_id: user.id, status: 'draft' })
            .select('id')
            .single()

        if (error || !newAnn) return { error: error?.message || 'Failed to create draft' }
        announcementId = newAnn.id
    }

    // Insert recipient links
    if (studentIds.length > 0 && announcementId) {
        await adminDb
            .from('announcement_recipients')
            .insert(studentIds.map(sid => ({
                announcement_id: announcementId,
                student_id: sid
            })))
    }

    revalidatePath('/admin')
    return { success: true, id: announcementId, message: 'Draft saved.' }
}

/**
 * Send an announcement. Creates or updates the record, sets status='sent', triggers emails.
 */
export async function sendAnnouncement(
    subject: string,
    body: string,
    studentIds: string[],
    existingId?: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const adminDb = getAdminSupabase()

    const { data: adminProfile } = await adminDb
        .from('profiles')
        .select('role, name, studio_name')
        .eq('id', user.id)
        .single()
    if (adminProfile?.role !== 'admin') return { error: 'Only admins can send announcements' }

    let announcementId = existingId

    if (existingId) {
        // Update and mark as sent
        const { error } = await adminDb
            .from('announcements')
            .update({ subject, body, status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', existingId)

        if (error) return { error: error.message }

        // Re-sync recipients
        await adminDb
            .from('announcement_recipients')
            .delete()
            .eq('announcement_id', existingId)
    } else {
        // Create as sent
        const { data: newAnn, error } = await adminDb
            .from('announcements')
            .insert({
                subject, body,
                teacher_id: user.id,
                status: 'sent',
                sent_at: new Date().toISOString()
            })
            .select('id')
            .single()

        if (error || !newAnn) return { error: error?.message || 'Failed to create announcement' }
        announcementId = newAnn.id
    }

    // Insert recipient links
    if (studentIds.length > 0 && announcementId) {
        await adminDb
            .from('announcement_recipients')
            .insert(studentIds.map(sid => ({
                announcement_id: announcementId,
                student_id: sid
            })))
    }

    // Send emails (fire-and-forget)
    if (resend && studentIds.length > 0) {
        (async () => {
            try {
                const { data: students } = await adminDb
                    .from('profiles')
                    .select('email, name')
                    .in('id', studentIds)

                if (students && students.length > 0) {
                    const emails = students.map(s => s.email).filter(Boolean) as string[]
                    if (emails.length > 0) {
                        const studioName = adminProfile?.studio_name || 'Lionel Yu Piano Studio'
                        const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'

                        await resend.emails.send({
                            from: `${studioName} <notifications@updates.musicalbasics.com>`,
                            to: emails,
                            subject: `📢 ${subject}`,
                            html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                                <h2 style="color: #333;">📢 ${subject}</h2>
                                <p style="color: #555; white-space: pre-wrap; line-height: 1.6;">${body}</p>
                                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                                <p style="color: #999; font-size: 14px;">
                                    View in your portal: <a href="${portalUrl}/student" style="color: #4f46e5;">Student Dashboard</a>
                                </p>
                            </div>`
                        })
                        console.log(`[Announcement] Email sent to ${emails.length} students`)
                    }
                }
            } catch (emailError) {
                console.error('[Announcement] Email failed (non-blocking):', emailError)
            }
        })()
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true,
        message: `Announcement sent to ${studentIds.length} student${studentIds.length === 1 ? '' : 's'}.`
    }
}

/**
 * Get all announcements (drafts + sent) for the admin history list.
 */
export async function getAnnouncements() {
    const adminDb = getAdminSupabase()

    const { data, error } = await adminDb
        .from('announcements')
        .select(`
            id, subject, body, status, created_at, sent_at,
            announcement_recipients ( student_id )
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Failed to fetch announcements:', error)
        return []
    }

    return (data || []).map(a => ({
        id: a.id,
        subject: a.subject,
        body: a.body,
        status: a.status as 'draft' | 'sent',
        created_at: a.created_at,
        sent_at: a.sent_at,
        recipient_count: (a.announcement_recipients as any[])?.length || 0,
        recipient_ids: (a.announcement_recipients as any[])?.map((r: any) => r.student_id) || []
    }))
}

/**
 * Delete a draft announcement.
 */
export async function deleteAnnouncementDraft(announcementId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const adminDb = getAdminSupabase()

    const { error } = await adminDb
        .from('announcements')
        .delete()
        .eq('id', announcementId)
        .eq('status', 'draft')

    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
}

/**
 * Get the latest SENT announcement for a specific student (student dashboard).
 */
export async function getLatestAnnouncement(studentId: string) {
    const adminDb = getAdminSupabase()

    const { data, error } = await adminDb
        .from('announcement_recipients')
        .select(`
            announcement_id,
            announcements (
                id, subject, body, created_at, status
            )
        `)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Failed to fetch latest announcement:', error)
        return null
    }

    // Find the most recent SENT announcement
    const sent = (data || []).find(d => {
        const ann = d.announcements as any
        return ann?.status === 'sent'
    })

    if (!sent?.announcements) return null

    const ann = sent.announcements as any
    return {
        id: ann.id,
        subject: ann.subject,
        body: ann.body,
        created_at: ann.created_at
    }
}
