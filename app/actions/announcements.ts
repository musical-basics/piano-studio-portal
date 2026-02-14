'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

/**
 * Send an announcement to selected students.
 * Creates DB records and sends email notifications.
 */
export async function sendAnnouncement(
    subject: string,
    body: string,
    studentIds: string[]
) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role, name, studio_name')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can send announcements' }
    }

    // 1. Create the Announcement Record
    const { data: announcement, error: annError } = await supabase
        .from('announcements')
        .insert({
            subject,
            body,
            teacher_id: user.id
        })
        .select()
        .single()

    if (annError) {
        console.error('Failed to create announcement:', annError)
        return { error: annError.message }
    }

    // 2. Create Recipient Links
    const recipientsData = studentIds.map(studentId => ({
        announcement_id: announcement.id,
        student_id: studentId
    }))

    const { error: linkError } = await supabase
        .from('announcement_recipients')
        .insert(recipientsData)

    if (linkError) {
        console.error('Failed to create recipient links:', linkError)
        return { error: linkError.message }
    }

    // 3. Send Emails (fire-and-forget)
    if (resend) {
        (async () => {
            try {
                const { data: students } = await supabase
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
 * Get the latest announcement for a specific student.
 */
export async function getLatestAnnouncement(studentId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('announcement_recipients')
        .select(`
            announcement_id,
            announcements (
                id,
                subject,
                body,
                created_at
            )
        `)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        console.error('Failed to fetch latest announcement:', error)
        return null
    }

    if (!data?.announcements) return null

    // Supabase returns the joined data as an object (single) since it's a FK
    const ann = data.announcements as any
    return {
        id: ann.id,
        subject: ann.subject,
        body: ann.body,
        created_at: ann.created_at
    }
}
