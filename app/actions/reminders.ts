'use server'

import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import LessonReminderEmail from '@/components/emails/LessonReminderEmail'
import { differenceInMinutes, format } from 'date-fns'

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
    // We treat both dates as "Wall Clock Time" in the Studio's Timezone (America/Los_Angeles)
    // regardless of the server's actual timezone (UTC).

    // 1. Lesson Date (Already in Wall Clock Time from DB)
    const lessonDate = new Date(`${lesson.date}T${lesson.time}`)

    // 2. Current Time (Shifted to LA Wall Clock Time)
    // toLocaleString returns "M/D/YYYY, HH:MM:SS" in the specified timezone
    const nowInStudioTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    const now = new Date(nowInStudioTimeStr)

    // Calculate total minutes difference
    const totalMinutes = differenceInMinutes(lessonDate, now)
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60

    let durationString = ""
    if (hours > 0) durationString += `${hours} hour${hours > 1 ? 's' : ''}`
    if (hours > 0 && mins > 0) durationString += " and "
    if (mins > 0) durationString += `${mins} minute${mins > 1 ? 's' : ''}`
    if (totalMinutes <= 0) durationString = "just a few moments"

    // 2. Prepare Email Subject based on variant
    const subjects = {
        '24h': 'Reminder: Piano Lesson Tomorrow',
        '2h': 'Reminder: Lesson starts in 2 hours',
        '15m': 'Join Now: Piano Lesson Starting!',
        'exact': `Lesson coming up in exactly ${durationString}`
    }

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

        const classroomBase = process.env.NEXT_PUBLIC_CLASSROOM_URL || 'https://classroom.musicalbasics.com'
        const classroomLink = lesson.student.public_id ? `${classroomBase}/${lesson.student.public_id}` : null

        const { data: emailData, error: emailError } = await resend.emails.send({
            from: `${studioName} <notifications@updates.musicalbasics.com>`,
            to: lesson.student.email,
            subject: subjects[variant],
            react: LessonReminderEmail({
                studentName: lesson.student.name,
                time: new Date(`${lesson.date}T${lesson.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                zoomLink: lesson.zoom_link || lesson.student.zoom_link, // Fallback to student's default link
                classroomLink,
                variant: variant === 'exact' ? 'exact' : variant,
                exactDuration: durationString
            })
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
