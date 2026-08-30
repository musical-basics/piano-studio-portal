import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import LessonReminderEmail from '@/components/emails/LessonReminderEmail'
import { differenceInMinutes, addDays, format } from 'date-fns'
import { dueNotice, NOTICE_FLAG_COLUMNS, type NoticeKey } from '@/lib/reminder-policy'
import { resolveNotificationEmail } from '@/lib/notification-email'

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

    // 2. Fetch Relevant Lessons (today through +2 days, to cover the 48h notice)
    const todayStr = format(now, 'yyyy-MM-dd')
    const horizonStr = format(addDays(now, 2), 'yyyy-MM-dd')

    const { data: lessons, error } = await supabase
        .from('lessons')
        // Whole profile row so the student's notification-email override is available.
        .select('*, profiles(*)')
        .gte('date', todayStr)
        .lte('date', horizonStr)
        .neq('status', 'cancelled') // Don't remind cancelled lessons

    if (error) {
        console.error('[Cron] Error fetching lessons:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Cron] Found ${lessons?.length || 0} active lessons for ${todayStr} .. ${horizonStr}`)

    // Confirmation-aware notice schedule:
    //   unconfirmed lessons -> 48h, 24h, 12h, 15m (each asks the student to confirm)
    //   confirmed lessons   -> 24h, 15m
    const sentCounts: Record<NoticeKey, number> = { '48h': 0, '24h': 0, '12h': 0, '15m': 0 }

    if (lessons) {
        for (const lesson of lessons) {
            if (!resolveNotificationEmail(lesson.profiles)) continue

            // Construct Lesson Wall Clock Time
            const lessonTime = new Date(`${lesson.date}T${lesson.time}`)
            const diffMinutes = differenceInMinutes(lessonTime, now)

            const isConfirmed = Boolean(lesson.is_confirmed)
            const notice = dueNotice(diffMinutes, isConfirmed, {
                '48h': Boolean(lesson.reminder_48h_sent),
                '24h': Boolean(lesson.reminder_24h_sent),
                '12h': Boolean(lesson.reminder_12h_sent),
                '15m': Boolean(lesson.reminder_15m_sent),
            })
            if (!notice) continue

            const timeLabel = lessonTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            const dayLabel = new Date(`${lesson.date}T00:00:00`).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
            })
            const confirmNudge = !isConfirmed
            const classroomBase = process.env.NEXT_PUBLIC_CLASSROOM_URL || 'https://classroom.musicalbasics.com'
            const classroomLink = lesson.profiles.public_id ? `${classroomBase}/${lesson.profiles.public_id}` : null

            const subjects: Record<NoticeKey, string> = {
                '48h': `Please confirm your lesson on ${dayLabel} (${timeLabel})`,
                '24h': confirmNudge ? `Please confirm your lesson tomorrow at ${timeLabel}` : 'Reminder: Lesson Tomorrow',
                '12h': `Please confirm your lesson today at ${timeLabel}`,
                '15m': 'Lesson Starting Soon!',
            }

            const recipientEmail = resolveNotificationEmail(lesson.profiles)
            if (!recipientEmail) {
                console.log(`[Cron] Skipping ${notice} notice: no email on file for ${lesson.profiles?.name || lesson.student_id}`)
                continue
            }

            console.log(`[Cron] Sending ${notice} notice (${confirmNudge ? 'unconfirmed' : 'confirmed'}) to ${recipientEmail} (Diff: ${diffMinutes}m)`)
            const { error: emailError } = await resend.emails.send({
                from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                to: recipientEmail,
                subject: subjects[notice],
                react: LessonReminderEmail({
                    studentName: lesson.profiles.name || 'Student',
                    time: timeLabel,
                    zoomLink: lesson.zoom_link,
                    classroomLink,
                    variant: notice,
                    dayLabel,
                    confirmNudge,
                }),
            })

            if (!emailError) {
                await supabase.from('lessons').update({ [NOTICE_FLAG_COLUMNS[notice]]: true }).eq('id', lesson.id)
                sentCounts[notice]++
            } else {
                console.error(`[Cron] Failed to send ${notice} email:`, emailError)
            }
        }
    }

    console.log(`[Cron] Finished. Sent: 48h(${sentCounts['48h']}), 24h(${sentCounts['24h']}), 12h(${sentCounts['12h']}), 15m(${sentCounts['15m']})`)
    return NextResponse.json({
        success: true,
        checked: now.toISOString(),
        stats: sentCounts,
    })
}
