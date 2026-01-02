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

    console.log(`[Cron] Checking reminders at ${now.toISOString()}`)

    // 1. Check for 24-Hour Reminders
    const tomorrowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)

    const { data: reminders24h, error: error24h } = await supabase
        .from('lessons')
        .select('*, profiles(email, name)')
        .gt('start_time', tomorrowStart.toISOString())
        .lt('start_time', tomorrowEnd.toISOString())
        .eq('reminder_24h_sent', false)

    if (error24h) console.error('[Cron] Error fetching 24h reminders:', error24h)
    console.log(`[Cron] Found ${reminders24h?.length || 0} potential 24h reminders`)

    if (reminders24h) {
        for (const lesson of reminders24h) {
            if (!lesson.profiles?.email) continue

            console.log(`[Cron] Sending 24h reminder to ${lesson.profiles.email}`)
            const { error: emailError } = await resend.emails.send({
                from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                to: lesson.profiles.email,
                subject: 'Reminder: Lesson Tomorrow',
                react: LessonReminderEmail({
                    studentName: lesson.profiles.name || 'Student',
                    time: new Date(lesson.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    zoomLink: lesson.zoom_link,
                    variant: '24h'
                })
            })
            if (emailError) console.error(`[Cron] Failed to send 24h email to ${lesson.profiles.email}:`, emailError)

            await supabase.from('lessons').update({ reminder_24h_sent: true }).eq('id', lesson.id)
        }
    }

    // 2. Check for 2-Hour Reminders
    const twoHourStart = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const twoHourEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000)

    const { data: reminders2h, error: error2h } = await supabase
        .from('lessons')
        .select('*, profiles(email, name)')
        .gt('start_time', twoHourStart.toISOString())
        .lt('start_time', twoHourEnd.toISOString())
        .eq('reminder_2h_sent', false)

    if (error2h) console.error('[Cron] Error fetching 2h reminders:', error2h)
    console.log(`[Cron] Found ${reminders2h?.length || 0} potential 2h reminders`)

    if (reminders2h) {
        for (const lesson of reminders2h) {
            if (!lesson.profiles?.email) continue

            console.log(`[Cron] Sending 2h reminder to ${lesson.profiles.email}`)
            const { error: emailError } = await resend.emails.send({
                from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                to: lesson.profiles.email,
                subject: 'Lesson in 2 Hours',
                react: LessonReminderEmail({
                    studentName: lesson.profiles.name || 'Student',
                    time: new Date(lesson.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    zoomLink: lesson.zoom_link,
                    variant: '2h'
                })
            })

            if (emailError) console.error(`[Cron] Failed to send 2h email to ${lesson.profiles.email}:`, emailError)

            await supabase.from('lessons').update({ reminder_2h_sent: true }).eq('id', lesson.id)
        }
    }

    // 3. Check for 15-Minute (Urgent) Reminders
    const fifteenMinStart = new Date(now.getTime())
    const fifteenMinEnd = new Date(now.getTime() + 20 * 60 * 1000)

    const { data: reminders15m, error: error15m } = await supabase
        .from('lessons')
        .select('*, profiles(email, name)')
        .gt('start_time', fifteenMinStart.toISOString())
        .lt('start_time', fifteenMinEnd.toISOString())
        .eq('reminder_15m_sent', false)

    if (error15m) console.error('[Cron] Error fetching 15m reminders:', error15m)
    console.log(`[Cron] Found ${reminders15m?.length || 0} potential 15m reminders`)

    if (reminders15m) {
        for (const lesson of reminders15m) {
            if (!lesson.profiles?.email) continue

            console.log(`[Cron] Sending 15m reminder to ${lesson.profiles.email}`)
            const { error: emailError } = await resend.emails.send({
                from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                to: lesson.profiles.email,
                subject: 'Lesson Starting Soon!',
                react: LessonReminderEmail({
                    studentName: lesson.profiles.name || 'Student',
                    time: new Date(lesson.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    zoomLink: lesson.zoom_link,
                    variant: '15m'
                })
            })

            if (emailError) console.error(`[Cron] Failed to send 15m email to ${lesson.profiles.email}:`, emailError)

            await supabase.from('lessons').update({ reminder_15m_sent: true }).eq('id', lesson.id)
        }
    }

    console.log('[Cron] Finished check')
    return NextResponse.json({ success: true, checked: now.toISOString() })
}
