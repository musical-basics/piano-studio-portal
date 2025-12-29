'use server'

import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import LessonReminderEmail from '@/components/emails/LessonReminderEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendManualReminder(lessonId: string, variant: '24h' | '2h' | '15m') {
    const supabase = await createClient()

    // 1. Fetch lesson details with Student Profile
    const { data: lesson, error } = await supabase
        .from('lessons')
        .select('*, student:profiles!student_id(*)') // Fetch linked student profile
        .eq('id', lessonId)
        .single()

    if (error || !lesson) return { error: 'Lesson not found' }

    // 2. Prepare Email Subject based on variant
    const subjects = {
        '24h': 'Reminder: Piano Lesson Tomorrow',
        '2h': 'Reminder: Lesson starts in 2 hours',
        '15m': 'Join Now: Piano Lesson Starting!'
    }

    try {
        // 3. Send Email
        await resend.emails.send({
            from: 'Piano Studio <lessons@musicalbasics.com>',
            to: lesson.student.email,
            subject: subjects[variant],
            react: LessonReminderEmail({
                studentName: lesson.student.name,
                time: new Date(`${lesson.date}T${lesson.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                zoomLink: lesson.zoom_link || lesson.student.zoom_link, // Fallback to student's default link
                variant: variant
            })
        })

        // 4. Update Database (so Cron job doesn't double-send)
        const column = variant === '24h' ? 'reminder_24h_sent' : variant === '2h' ? 'reminder_2h_sent' : 'reminder_15m_sent'
        await supabase.from('lessons').update({ [column]: true }).eq('id', lessonId)

        return { success: true, message: `Sent ${variant} reminder to ${lesson.student.name}` }
    } catch (err) {
        console.error(err)
        return { error: 'Failed to send email' }
    }
}
