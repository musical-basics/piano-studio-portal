'use server'

import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { describeTimeRemaining, manualReminderEmail } from '@/lib/family-emails'
import { differenceInMinutes, format } from 'date-fns'
import { resolveNotificationEmail } from '@/lib/notification-email'
import { STUDIO_TZ } from '@/lib/studio-timezone'
import { formatLessonTimeForFamily } from '@/lib/family-time'
import { familyLessonLinks } from '@/lib/lesson-venue'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendManualReminder(lessonId: string, variant: '24h' | '2h' | '15m' | 'exact') {
    console.log(`[ManualReminder] Starting ${variant} reminder for lesson ${lessonId}`)
    const supabase = await createClient()

    // 1. Fetch lesson details with Student Profile
    const { data: lesson, error } = await supabase
        .from('lessons')
        .select('*, student:profiles!student_id(*)') // Fetch linked student profile
        .eq('id', lessonId)
        .single()

    if (error || !lesson) {
        console.error('[ManualReminder] Fetch error:', error)
        return { error: 'Lesson not found' }
    }

    // Calculate exact time remaining (Shifted Reference Frame)
    // We treat both dates as "Wall Clock Time" in the Studio's Timezone (STUDIO_TZ)
    // regardless of the server's actual timezone (UTC).

    // 1. Lesson Date (Already in Wall Clock Time from DB)
    const lessonDate = new Date(`${lesson.date}T${lesson.time}`)

    // 2. Current Time (Shifted to LA Wall Clock Time)
    // toLocaleString returns "M/D/YYYY, HH:MM:SS" in the specified timezone
    const nowInStudioTimeStr = new Date().toLocaleString('en-US', { timeZone: STUDIO_TZ })
    const now = new Date(nowInStudioTimeStr)

    // Calculate total minutes difference
    const totalMinutes = differenceInMinutes(lessonDate, now)
    const durationString = describeTimeRemaining(totalMinutes)

    try {
        // 3. Send Email
        console.log('[ManualReminder] Sending email to', lesson.student.email)

        // Fetch Studio Name from Admin Profile (Current User)
        // We can safely use auth.getUser() here because this is a Server Action called by a logged-in admin
        const { data: { user } } = await supabase.auth.getUser()
        let studioName = 'Lionel Yu Piano Studio'

        if (user) {
            const { data: adminProfile } = await supabase
                .from('profiles')
                .select('studio_name')
                .eq('id', user.id)
                .single()
            if (adminProfile?.studio_name) {
                studioName = adminProfile.studio_name
            }
        }

        // A classroom student (#980) gets the classroom link instead of Zoom.
        const links = familyLessonLinks(lesson.student, lesson.zoom_link || lesson.student.zoom_link) // Fallback to student's default link

        // Subject and body from lib/family-emails.ts (shared with /admin/emails).
        const email = manualReminderEmail({
            variant,
            durationString,
            studentName: lesson.student.name,
            // "5:30pm EST (2:30pm your time)" when the family's zone is set (Lionel's #729).
            timeLabel: formatLessonTimeForFamily(lesson.date, lesson.time, lesson.student.timezone),
            links,
        })

        const { data: emailData, error: emailError } = await resend.emails.send({
            from: `${studioName} <notifications@updates.musicalbasics.com>`,
            to: resolveNotificationEmail(lesson.student) as string,
            subject: email.subject,
            react: email.react,
        })

        if (emailError) {
            console.error('[ManualReminder] Resend API Error:', emailError)
            return { error: `Failed to send email: ${emailError.message}` }
        }

        console.log('[ManualReminder] Email sent successfully:', emailData)

        // 4. Update Database (so Cron job doesn't double-send)
        if (variant !== 'exact') {
            const column = variant === '24h' ? 'reminder_24h_sent' : variant === '2h' ? 'reminder_2h_sent' : 'reminder_15m_sent'
            const { error: updateError } = await supabase.from('lessons').update({ [column]: true }).eq('id', lessonId)

            if (updateError) {
                console.error('[ManualReminder] Database update failed (RLS likely):', updateError)
            } else {
                console.log('[ManualReminder] Database updated successfully')
            }
        }

        return { success: true, message: `Sent ${variant} reminder to ${lesson.student.name}` }
    } catch (err) {
        console.error('[ManualReminder] Unexpected error:', err)
        return { error: 'An unexpected error occurred' }
    }
}
