import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import LessonReminderEmail from '@/components/emails/LessonReminderEmail'
import { differenceInMinutes, addDays, format } from 'date-fns'
import { dueNotice, closedWindows, NOTICE_FLAG_COLUMNS, type NoticeKey } from '@/lib/reminder-policy'
import { resolveNotificationEmail } from '@/lib/notification-email'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { readHeartbeat, writeHeartbeat, sendCronAlert, ALERT_COOLDOWN_MINUTES } from '@/lib/cron-alerts'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic' // Ensure this route is not cached

// Scheduled every 10 minutes. Anything beyond this is a dropped tick, and since
// notice windows are only 25-60 minutes wide, dropped ticks silently lose
// reminders. Alert rather than let it go unnoticed.
const EXPECTED_INTERVAL_MINUTES = 10
const LATE_THRESHOLD_MINUTES = 45

export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Establish Reference Time (Studio Time - America/Los_Angeles)
    // We treat 'now' as the Wall Clock time in the studio.
    const nowInStudioTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    const now = new Date(nowInStudioTimeStr)

    console.log(`[Cron] Checking reminders at ${now.toISOString()} (Studio Time)`)

    // How long since the previous tick? Measured on real UTC instants, then
    // projected onto the wall-clock axis so it can be compared with lesson times.
    const heartbeat = await readHeartbeat(supabase, 'reminders')
    const gapMinutes = heartbeat.lastRunAt
        ? Math.round((Date.now() - heartbeat.lastRunAt.getTime()) / 60000)
        : null
    const previousNow = gapMinutes === null ? null : new Date(now.getTime() - gapMinutes * 60000)

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
        await sendCronAlert(supabase, {
            subject: '⚠️ Lesson reminders failed: could not read lessons',
            lines: [`Supabase error: ${error.message}`, 'No reminders were sent on this run.'],
        })
        await writeHeartbeat(supabase, 'reminders', true)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Cron] Found ${lessons?.length || 0} active lessons for ${todayStr} .. ${horizonStr}`)

    // Confirmation-aware notice schedule:
    //   unconfirmed lessons -> 48h, 24h, 12h, 15m (each asks the student to confirm)
    //   confirmed lessons   -> 24h, 15m
    const sentCounts: Record<NoticeKey, number> = { '48h': 0, '24h': 0, '12h': 0, '15m': 0 }
    const missedNotices: string[] = []
    const sendFailures: string[] = []

    if (lessons) {
        for (const lesson of lessons) {
            if (!resolveNotificationEmail(lesson.profiles)) continue

            // Construct Lesson Wall Clock Time
            const lessonTime = new Date(`${lesson.date}T${lesson.time}`)
            const diffMinutes = differenceInMinutes(lessonTime, now)

            const isConfirmed = Boolean(lesson.is_confirmed)
            const sentFlags = {
                '48h': Boolean(lesson.reminder_48h_sent),
                '24h': Boolean(lesson.reminder_24h_sent),
                '12h': Boolean(lesson.reminder_12h_sent),
                '15m': Boolean(lesson.reminder_15m_sent),
            }

            const timeLabel = lessonTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            const dayLabel = new Date(`${lesson.date}T00:00:00`).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
            })
            const who = lesson.profiles?.name || lesson.student_id

            // Any window that closed unserved during the gap since the last tick.
            // Each window closes exactly once, so this reports a given lesson's
            // missed notice a single time rather than on every subsequent run.
            if (previousNow) {
                for (const key of closedWindows(lessonTime, previousNow, now, isConfirmed, sentFlags)) {
                    missedNotices.push(`${who} — ${dayLabel} at ${timeLabel} — ${key} notice never sent`)
                }
            }

            const notice = dueNotice(diffMinutes, isConfirmed, sentFlags)
            if (!notice) continue

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
                console.log(`[Cron] Skipping ${notice} notice: no email on file for ${who}`)
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
                sendFailures.push(`${who} — ${dayLabel} at ${timeLabel} — ${notice} notice rejected: ${emailError.message}`)
            }
        }
    }

    // Raise anything that means a student did not get told about their lesson.
    // Discrete events (a missed window, a rejected send) always alert; a merely
    // late tick is rate-limited so sustained throttling doesn't flood the inbox.
    const isLate = gapMinutes !== null && gapMinutes > LATE_THRESHOLD_MINUTES
    const cooledDown = !heartbeat.lastAlertAt ||
        (Date.now() - heartbeat.lastAlertAt.getTime()) / 60000 >= ALERT_COOLDOWN_MINUTES
    const hasEvents = missedNotices.length > 0 || sendFailures.length > 0

    let alerted = false
    if (hasEvents || (isLate && cooledDown)) {
        const lines: string[] = []
        if (isLate) {
            lines.push(
                `The reminder cron last ran <strong>${gapMinutes} minutes ago</strong> ` +
                `(scheduled every ${EXPECTED_INTERVAL_MINUTES}). Notice windows are only ` +
                `25-60 minutes wide, so gaps this size drop reminders.`
            )
        }
        if (missedNotices.length) {
            lines.push(`<strong>${missedNotices.length} notice(s) missed their window:</strong>`)
            lines.push(...missedNotices)
        }
        if (sendFailures.length) {
            lines.push(`<strong>${sendFailures.length} email(s) rejected by Resend:</strong>`)
            lines.push(...sendFailures)
        }
        const subject = sendFailures.length
            ? `⚠️ ${sendFailures.length} lesson reminder(s) failed to send`
            : missedNotices.length
                ? `⚠️ ${missedNotices.length} lesson reminder(s) missed their window`
                : `⚠️ Lesson reminder cron is running late (${gapMinutes}m gap)`
        alerted = await sendCronAlert(supabase, { subject, lines })
    }

    await writeHeartbeat(supabase, 'reminders', alerted)

    console.log(`[Cron] Finished. Sent: 48h(${sentCounts['48h']}), 24h(${sentCounts['24h']}), 12h(${sentCounts['12h']}), 15m(${sentCounts['15m']}); gap=${gapMinutes ?? 'n/a'}m, missed=${missedNotices.length}, failed=${sendFailures.length}`)
    return NextResponse.json({
        success: true,
        checked: now.toISOString(),
        stats: sentCounts,
        gapMinutes,
        missed: missedNotices.length,
        failed: sendFailures.length,
    })
}
