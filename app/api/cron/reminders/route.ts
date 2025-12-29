import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import LessonReminderEmail from '@/components/emails/LessonReminderEmail'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic' // Ensure this route is not cached

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('key') !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // 1. Check for 24-Hour Reminders
    const tomorrowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)

    const { data: reminders24h } = await supabase
        .from('lessons')
        .select('*, profiles(email, name)')
        .gt('start_time', tomorrowStart.toISOString())
        .lt('start_time', tomorrowEnd.toISOString())
        .eq('reminder_24h_sent', false)

    if (reminders24h) {
        for (const lesson of reminders24h) {
            if (!lesson.profiles?.email) continue

            await resend.emails.send({
                from: 'Piano Studio <lessons@musicalbasics.com>',
                to: lesson.profiles.email,
                subject: 'Reminder: Lesson Tomorrow',
                react: LessonReminderEmail({
                    studentName: lesson.profiles.name || 'Student',
                    time: new Date(lesson.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    variant: '24h'
                })
            })
            await supabase.from('lessons').update({ reminder_24h_sent: true }).eq('id', lesson.id)
        }
    }

    // 2. Check for 2-Hour Reminders
    const twoHourStart = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const twoHourEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000)

    const { data: reminders2h } = await supabase
        .from('lessons')
        .select('*, profiles(email, name)')
        .gt('start_time', twoHourStart.toISOString())
        .lt('start_time', twoHourEnd.toISOString())
        .eq('reminder_2h_sent', false)
    // Removed dependency on reminder_24h_sent to allow reminders for short-notice bookings

    if (reminders2h) {
        for (const lesson of reminders2h) {
            if (!lesson.profiles?.email) continue

            await resend.emails.send({
                from: 'Piano Studio <lessons@musicalbasics.com>',
                to: lesson.profiles.email,
                subject: 'Lesson in 2 Hours',
                react: LessonReminderEmail({
                    studentName: lesson.profiles.name || 'Student',
                    time: new Date(lesson.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    variant: '2h'
                })
            })
            await supabase.from('lessons').update({ reminder_2h_sent: true }).eq('id', lesson.id)
        }
    }

    // 3. Check for 15-Minute (Urgent) Reminders
    const fifteenMinStart = new Date(now.getTime())
    const fifteenMinEnd = new Date(now.getTime() + 20 * 60 * 1000)

    const { data: reminders15m } = await supabase
        .from('lessons')
        .select('*, profiles(email, name)')
        .gt('start_time', fifteenMinStart.toISOString())
        .lt('start_time', fifteenMinEnd.toISOString())
        .eq('reminder_15m_sent', false)

    if (reminders15m) {
        for (const lesson of reminders15m) {
            if (!lesson.profiles?.email) continue

            await resend.emails.send({
                from: 'Piano Studio <lessons@musicalbasics.com>',
                to: lesson.profiles.email,
                subject: 'Lesson Starting Soon!',
                react: LessonReminderEmail({
                    studentName: lesson.profiles.name || 'Student',
                    time: new Date(lesson.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    zoomLink: lesson.zoom_link,
                    variant: '15m'
                })
            })
            await supabase.from('lessons').update({ reminder_15m_sent: true }).eq('id', lesson.id)
        }
    }

    return NextResponse.json({ success: true, checked: now.toISOString() })
}
