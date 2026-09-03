/**
 * Out-of-band lesson reminder send.
 *
 * The scheduled cron only fires inside narrow windows (see lib/reminder-policy.ts),
 * so when ticks get dropped a lesson can slip past its window and never get a
 * notice. This sends "your lesson starts in X" to every remaining lesson on a
 * given day, right now, regardless of window.
 *
 *   npx tsx scripts/send_reminders_now.ts                 # dry run, studio today
 *   npx tsx scripts/send_reminders_now.ts --date=2026-09-03 --send
 *
 * One email per recipient, never a BCC blast. Lessons that already started are
 * skipped. A lesson inside the 15m window is marked reminder_15m_sent so the
 * cron does not immediately send a near-duplicate; anything further out is left
 * unflagged so its normal join-now notice still goes at the usual time.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import LessonReminderEmail from '../components/emails/LessonReminderEmail'
import { resolveNotificationEmail } from '../lib/notification-email'
import { studioNow, studioToday } from '../lib/studio-timezone'

const args = process.argv.slice(2)
const SEND = args.includes('--send')
const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1]

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const resend = new Resend(process.env.RESEND_API_KEY)

/** "35 minutes" / "1 hour 35 minutes", rounded to 5 so the copy isn't absurdly precise. */
function durationLabel(minutes: number): string {
    const m5 = Math.max(5, Math.round(minutes / 5) * 5)
    const h = Math.floor(m5 / 60)
    const m = m5 % 60
    const parts: string[] = []
    if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`)
    if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
    return parts.join(' ')
}

async function main() {
    const date = dateArg || studioToday()
    const now = studioNow()

    const { data: lessons, error } = await supabase
        .from('lessons')
        .select('*, profiles(*)')
        .eq('date', date)
        .neq('status', 'cancelled')
        .order('time', { ascending: true })
    if (error) throw error

    // studioNow() is wall-clock-as-UTC, so read the clock back the same way.
    const nowLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    console.log(`\n${SEND ? 'SENDING' : 'DRY RUN'} — lessons on ${date}, studio now ${nowLabel}\n`)

    let sent = 0, skipped = 0, failed = 0
    for (const lesson of lessons || []) {
        const lessonTime = new Date(`${lesson.date}T${lesson.time}`)
        const diffMinutes = Math.round((lessonTime.getTime() - now.getTime()) / 60000)
        const timeLabel = lessonTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        const who = lesson.profiles?.name || lesson.student_id
        const recipient = resolveNotificationEmail(lesson.profiles)

        if (diffMinutes <= 0) {
            console.log(`  SKIP  ${lesson.time.slice(0, 5)} ${who} — already started (${-diffMinutes}m ago)`)
            skipped++; continue
        }
        if (!recipient) {
            console.log(`  SKIP  ${lesson.time.slice(0, 5)} ${who} — no email on file`)
            skipped++; continue
        }

        const imminent = diffMinutes < 60
        const variant = imminent ? '15m' as const : 'exact' as const
        const confirmNudge = !lesson.is_confirmed
        const classroomBase = process.env.NEXT_PUBLIC_CLASSROOM_URL || 'https://classroom.musicalbasics.com'
        const classroomLink = lesson.profiles?.public_id ? `${classroomBase}/${lesson.profiles.public_id}` : null
        const subject = imminent
            ? `Join now: your lesson starts at ${timeLabel}`
            : `Reminder: your lesson today at ${timeLabel}`

        console.log(`  SEND  ${lesson.time.slice(0, 5)} ${who} <${recipient}> in ${diffMinutes}m — ${variant}${confirmNudge ? ' +confirm' : ''}`)
        console.log(`        "${subject}"`)
        if (!SEND) continue

        const { error: emailError } = await resend.emails.send({
            from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
            to: recipient,
            subject,
            react: LessonReminderEmail({
                studentName: lesson.profiles?.name || 'Student',
                time: timeLabel,
                zoomLink: lesson.zoom_link,
                classroomLink,
                variant,
                exactDuration: durationLabel(diffMinutes),
                dayLabel: lessonTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                confirmNudge,
            }),
        })
        if (emailError) {
            console.error(`        FAILED: ${emailError.message}`)
            failed++; continue
        }
        sent++
        if (imminent) {
            await supabase.from('lessons').update({ reminder_15m_sent: true }).eq('id', lesson.id)
            console.log(`        marked reminder_15m_sent`)
        }
    }

    console.log(`\n${SEND ? 'Sent' : 'Would send'}: ${sent}, skipped: ${skipped}, failed: ${failed}\n`)
    if (!SEND) console.log('Re-run with --send to actually deliver.\n')
}

main().catch(e => { console.error(e); process.exit(1) })
