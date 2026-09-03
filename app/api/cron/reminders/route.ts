import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import LessonReminderEmail from '@/components/emails/LessonReminderEmail'
import { differenceInMinutes, addDays, format } from 'date-fns'
import { dueNotice, neverNotified, NOTICE_FLAG_COLUMNS, type NoticeKey } from '@/lib/reminder-policy'
import { resolveNotificationEmail } from '@/lib/notification-email'
import { isAuthorizedCron } from '@/lib/cron-auth'
import {
    readHeartbeat, writeHeartbeat, sendCronAlert, pingDeadManSwitch,
    cronSource, ALERT_COOLDOWN_MINUTES,
} from '@/lib/cron-alerts'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic' // Ensure this route is not cached

// Scheduled every 10 minutes by both triggers. Notices are self-healing now, so
// a late tick recovers rather than loses a reminder, but a gap this large still
// means a trigger is unhealthy and worth reporting.
const EXPECTED_INTERVAL_MINUTES = 10
const LATE_THRESHOLD_MINUTES = 45
// Delivering a notice a few minutes past its trigger point is just the cron's
// resolution. Beyond this it was genuinely recovered from an outage.
const RECOVERY_THRESHOLD_MINUTES = 90

/** How to describe the lesson's timing, from the ACTUAL minutes remaining. */
function describeWhen(diffMinutes: number, timeLabel: string, dayLabel: string) {
    if (diffMinutes <= 25) return { phrase: 'about to begin', variant: '15m' as const }
    if (diffMinutes <= 720) return { phrase: `today at ${timeLabel}`, variant: '12h' as const }
    if (diffMinutes <= 1500) return { phrase: `tomorrow at ${timeLabel}`, variant: '24h' as const }
    return { phrase: `on ${dayLabel} at ${timeLabel}`, variant: '48h' as const }
}

export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const source = cronSource(request)

    // 1. Establish Reference Time (Studio Time - America/Los_Angeles)
    // We treat 'now' as the Wall Clock time in the studio.
    const nowInStudioTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
    const now = new Date(nowInStudioTimeStr)

    console.log(`[Cron] Checking reminders at ${now.toISOString()} (Studio Time), trigger=${source}`)

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
        await writeHeartbeat(supabase, 'reminders', { alerted: true, source })
        await pingDeadManSwitch(false)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Cron] Found ${lessons?.length || 0} active lessons for ${todayStr} .. ${horizonStr}`)

    // Confirmation-aware notice schedule:
    //   unconfirmed lessons -> 48h, 24h, 12h, 15m (each asks the student to confirm)
    //   confirmed lessons   -> 24h, 15m
    const sentCounts: Record<NoticeKey, number> = { '48h': 0, '24h': 0, '12h': 0, '15m': 0 }
    const unnotified: string[] = []
    const sendFailures: string[] = []
    const recovered: string[] = []

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

            // The one way a reminder can still be lost outright: the scheduler was
            // down for the lesson's whole lead time and it began unannounced. Only
            // report lessons that started since the previous tick, so this alerts
            // once rather than on every run for the rest of the day.
            if (previousNow && diffMinutes <= 0 && lessonTime > previousNow && neverNotified(sentFlags)) {
                unnotified.push(`${who} — ${dayLabel} at ${timeLabel} — lesson began with no reminder ever sent`)
            }

            const decision = dueNotice(diffMinutes, isConfirmed, sentFlags)
            if (!decision) continue

            const { notice, superseded, lateByMinutes } = decision
            const confirmNudge = !isConfirmed
            const classroomBase = process.env.NEXT_PUBLIC_CLASSROOM_URL || 'https://classroom.musicalbasics.com'
            const classroomLink = lesson.profiles.public_id ? `${classroomBase}/${lesson.profiles.public_id}` : null

            // Wording follows the real time remaining, not the notice key: a
            // recovered 24h notice must not tell someone "see you tomorrow"
            // about a lesson starting in an hour.
            const { phrase, variant } = describeWhen(diffMinutes, timeLabel, dayLabel)
            const subject = diffMinutes <= 25
                ? 'Lesson Starting Soon!'
                : confirmNudge
                    ? `Please confirm your lesson ${phrase}`
                    : `Reminder: your lesson ${phrase}`

            const recipientEmail = resolveNotificationEmail(lesson.profiles)
            if (!recipientEmail) {
                console.log(`[Cron] Skipping ${notice} notice: no email on file for ${who}`)
                continue
            }

            console.log(
                `[Cron] Sending ${notice} notice as ${variant} (${confirmNudge ? 'unconfirmed' : 'confirmed'}) ` +
                `to ${recipientEmail} (Diff: ${diffMinutes}m, late: ${lateByMinutes}m` +
                `${superseded.length ? `, supersedes ${superseded.join('+')}` : ''})`
            )
            const { error: emailError } = await resend.emails.send({
                from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                to: recipientEmail,
                subject,
                react: LessonReminderEmail({
                    studentName: lesson.profiles.name || 'Student',
                    time: timeLabel,
                    zoomLink: lesson.zoom_link,
                    classroomLink,
                    variant,
                    dayLabel,
                    confirmNudge,
                    whenPhrase: phrase,
                }),
            })

            if (!emailError) {
                // Mark the delivered notice AND everything it overtook, so a
                // stale notice can't fire out of order on a later tick.
                const flags = Object.fromEntries(
                    [notice, ...superseded].map(key => [NOTICE_FLAG_COLUMNS[key], true])
                )
                await supabase.from('lessons').update(flags).eq('id', lesson.id)
                sentCounts[notice]++
                if (lateByMinutes > RECOVERY_THRESHOLD_MINUTES) {
                    recovered.push(`${who} — ${dayLabel} at ${timeLabel} — ${notice} notice recovered ${lateByMinutes}m late`)
                }
            } else {
                console.error(`[Cron] Failed to send ${notice} email:`, emailError)
                sendFailures.push(`${who} — ${dayLabel} at ${timeLabel} — ${notice} notice rejected: ${emailError.message}`)
            }
        }
    }

    // Raise anything that means a student did not get told about their lesson.
    // Discrete events (a lesson that began unannounced, a rejected send) always
    // alert; a merely late tick is rate-limited so throttling can't flood.
    const isLate = gapMinutes !== null && gapMinutes > LATE_THRESHOLD_MINUTES
    const cooledDown = !heartbeat.lastAlertAt ||
        (Date.now() - heartbeat.lastAlertAt.getTime()) / 60000 >= ALERT_COOLDOWN_MINUTES
    const hasEvents = unnotified.length > 0 || sendFailures.length > 0

    let alerted = false
    if (hasEvents || (isLate && cooledDown)) {
        const lines: string[] = []
        if (isLate) {
            lines.push(
                `The reminder cron last ran <strong>${gapMinutes} minutes ago</strong> ` +
                `(scheduled every ${EXPECTED_INTERVAL_MINUTES}, this tick came from <strong>${source}</strong>). ` +
                `Notices self-heal, so reminders are being recovered rather than lost, but a trigger is unhealthy.`
            )
        }
        if (unnotified.length) {
            lines.push(`<strong>${unnotified.length} lesson(s) began with no reminder at all:</strong>`)
            lines.push(...unnotified)
        }
        if (sendFailures.length) {
            lines.push(`<strong>${sendFailures.length} email(s) rejected by Resend:</strong>`)
            lines.push(...sendFailures)
        }
        if (recovered.length) {
            lines.push(`<strong>${recovered.length} notice(s) sent late (recovered, not lost):</strong>`)
            lines.push(...recovered)
        }
        const subject = sendFailures.length
            ? `⚠️ ${sendFailures.length} lesson reminder(s) failed to send`
            : unnotified.length
                ? `🚨 ${unnotified.length} lesson(s) started with no reminder sent`
                : `⚠️ Lesson reminder cron is running late (${gapMinutes}m gap)`
        alerted = await sendCronAlert(supabase, { subject, lines })
    }

    await writeHeartbeat(supabase, 'reminders', { alerted, source })
    await pingDeadManSwitch(true)

    console.log(
        `[Cron] Finished. Sent: 48h(${sentCounts['48h']}), 24h(${sentCounts['24h']}), ` +
        `12h(${sentCounts['12h']}), 15m(${sentCounts['15m']}); trigger=${source}, gap=${gapMinutes ?? 'n/a'}m, ` +
        `unnotified=${unnotified.length}, recovered=${recovered.length}, failed=${sendFailures.length}`
    )
    return NextResponse.json({
        success: true,
        checked: now.toISOString(),
        trigger: source,
        stats: sentCounts,
        gapMinutes,
        unnotified: unnotified.length,
        recovered: recovered.length,
        failed: sendFailures.length,
    })
}
