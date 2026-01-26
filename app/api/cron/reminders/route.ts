import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import LessonReminderEmail from '@/components/emails/LessonReminderEmail'
import { differenceInMinutes, addDays, format } from 'date-fns'

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

    // 1. Establish Reference Time (Studio Time - America/Los_Angeles)
    // We treat 'now' as the Wall Clock time in the studio.
    const nowInStudioTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    const now = new Date(nowInStudioTimeStr)

    console.log(`[Cron] Checking reminders at ${now.toISOString()} (Studio Time)`)

    // 2. Fetch Relevant Lessons (Today and Tomorrow)
    // We only need to look at lessons happening today or tomorrow to cover 15m, 2h, and 24h windows.
    const todayStr = format(now, 'yyyy-MM-dd')
    const tomorrowStr = format(addDays(now, 1), 'yyyy-MM-dd')

    const { data: lessons, error } = await supabase
        .from('lessons')
        .select('*, profiles(email, name)')
        .in('date', [todayStr, tomorrowStr])
        .neq('status', 'cancelled') // Don't remind cancelled lessons

    if (error) {
        console.error('[Cron] Error fetching lessons:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Cron] Found ${lessons?.length || 0} active lessons for ${todayStr} and ${tomorrowStr}`)

    let sent24h = 0
    let sent2h = 0
    let sent15m = 0

    if (lessons) {
        for (const lesson of lessons) {
            if (!lesson.profiles?.email) continue

            // Construct Lesson Wall Clock Time
            const lessonTime = new Date(`${lesson.date}T${lesson.time}`)
            const diffMinutes = differenceInMinutes(lessonTime, now)

            // --- 24 Hour Reminder ---
            // Window: 24h to 25h (1440 mins to 1500 mins)
            if (diffMinutes >= 1440 && diffMinutes < 1500 && !lesson.reminder_24h_sent) {
                console.log(`[Cron] Sending 24h reminder to ${lesson.profiles.email} (Diff: ${diffMinutes}m)`)
                const { error: emailError } = await resend.emails.send({
                    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                    to: lesson.profiles.email,
                    subject: 'Reminder: Lesson Tomorrow',
                    react: LessonReminderEmail({
                        studentName: lesson.profiles.name || 'Student',
                        time: new Date(`${lesson.date}T${lesson.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                        zoomLink: lesson.zoom_link,
                        variant: '24h'
                    })
                })

                if (!emailError) {
                    await supabase.from('lessons').update({ reminder_24h_sent: true }).eq('id', lesson.id)
                    sent24h++
                } else {
                    console.error(`[Cron] Failed to send 24h email:`, emailError)
                }
            }

            // --- 2 Hour Reminder ---
            // Window: 2h to 3h (120 mins to 180 mins)
            if (diffMinutes >= 120 && diffMinutes < 180 && !lesson.reminder_2h_sent) {
                console.log(`[Cron] Sending 2h reminder to ${lesson.profiles.email} (Diff: ${diffMinutes}m)`)
                const { error: emailError } = await resend.emails.send({
                    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                    to: lesson.profiles.email,
                    subject: 'Lesson in 2 Hours',
                    react: LessonReminderEmail({
                        studentName: lesson.profiles.name || 'Student',
                        time: new Date(`${lesson.date}T${lesson.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                        zoomLink: lesson.zoom_link,
                        variant: '2h'
                    })
                })

                if (!emailError) {
                    await supabase.from('lessons').update({ reminder_2h_sent: true }).eq('id', lesson.id)
                    sent2h++
                } else {
                    console.error(`[Cron] Failed to send 2h email:`, emailError)
                }
            }

            // --- 15 Minute Reminder ---
            // Window: 0 to 20 mins
            if (diffMinutes >= 0 && diffMinutes < 20 && !lesson.reminder_15m_sent) {
                console.log(`[Cron] Sending 15m reminder to ${lesson.profiles.email} (Diff: ${diffMinutes}m)`)
                const { error: emailError } = await resend.emails.send({
                    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                    to: lesson.profiles.email,
                    subject: 'Lesson Starting Soon!',
                    react: LessonReminderEmail({
                        studentName: lesson.profiles.name || 'Student',
                        time: new Date(`${lesson.date}T${lesson.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                        zoomLink: lesson.zoom_link,
                        variant: '15m'
                    })
                })

                if (!emailError) {
                    await supabase.from('lessons').update({ reminder_15m_sent: true }).eq('id', lesson.id)
                    sent15m++
                } else {
                    console.error(`[Cron] Failed to send 15m email:`, emailError)
                }
            }
        }
    }

    console.log(`[Cron] Finished. Sent: 24h(${sent24h}), 2h(${sent2h}), 15m(${sent15m})`)
    return NextResponse.json({
        success: true,
        checked: now.toISOString(),
        stats: { sent24h, sent2h, sent15m }
    })
}
