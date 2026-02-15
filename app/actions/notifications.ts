'use server'

import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

/**
 * Notify the admin when a student joins Classroom or Zoom from their student page.
 * Fire-and-forget — callers don't need to await this.
 */
export async function notifyStudentJoined(type: 'classroom' | 'zoom') {
    const supabase = await createClient()

    // 1. Authenticate the student
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // 2. Fetch student name
    const { data: student } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single()

    const studentName = student?.name || 'A student'

    // 3. Find admin email
    const { data: admin } = await supabase
        .from('profiles')
        .select('email, studio_name')
        .eq('role', 'admin')
        .limit(1)
        .single()

    if (!admin?.email) {
        console.error('[notifyStudentJoined] No admin email found')
        return { error: 'No admin email found' }
    }

    // 4. Format the current time for the email body
    const now = new Date()
    const formattedTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Los_Angeles',
    })
    const formattedDate = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Los_Angeles',
    })

    const label = type === 'classroom' ? 'Classroom' : 'Zoom'

    // 5. Send email
    if (!resend) {
        console.log(`[notifyStudentJoined] Resend not configured. ${studentName} joined ${label}.`)
        return { success: true }
    }

    try {
        const studioName = admin.studio_name || 'Lionel Yu Piano Studio'

        await resend.emails.send({
            from: `${studioName} <notifications@updates.musicalbasics.com>`,
            to: admin.email,
            subject: `${studentName} just joined ${label}`,
            html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
                    <h2 style="font-size: 20px; margin: 0 0 16px; color: #1a1a1a;">
                        🎹 Student Joined ${label}
                    </h2>
                    <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0;">
                        <strong>${studentName}</strong> joined the <strong>${label}</strong> at ${formattedTime} on ${formattedDate}.
                    </p>
                </div>
            `,
        })

        console.log(`[notifyStudentJoined] Email sent: ${studentName} joined ${label}`)
        return { success: true }
    } catch (err) {
        console.error('[notifyStudentJoined] Failed to send email:', err)
        return { error: 'Failed to send notification' }
    }
}
