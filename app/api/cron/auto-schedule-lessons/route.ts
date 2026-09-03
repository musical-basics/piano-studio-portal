import { NextResponse } from 'next/server'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { autoScheduleStandingLessonsCore } from '@/lib/core/lessons'
import { studioToday } from '@/lib/studio-timezone'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { readHeartbeat, sendCronAlert, writeHeartbeat, ALERT_COOLDOWN_MINUTES } from '@/lib/cron-alerts'

export const dynamic = 'force-dynamic'
// Each booking creates a Google Calendar event + Zoom meeting + email; allow
// headroom for a full week of students.
export const maxDuration = 300

function shiftDateStr(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Books every active student's standing weekly slots for the rolling next week
// (tomorrow through +7 days, studio time). Idempotent: dates that already have
// a lesson, carry an active skip/cancel/reschedule flag, or were previously
// cancelled by the student are left alone, so running daily just tops up the
// week as it rolls forward.
// The reminders cron runs every 10 minutes. If its heartbeat is older than this,
// the scheduler itself is down (or being throttled hard) and students are
// silently missing lesson notices.
const REMINDERS_STALE_AFTER_MINUTES = 120

async function checkRemindersHeartbeat(client: DbClient): Promise<void> {
    try {
        const { lastRunAt, lastAlertAt, available } = await readHeartbeat(client, 'reminders')
        // Can't tell a dead cron from an unmigrated table, so stay quiet.
        if (!available) return
        const staleMinutes = lastRunAt
            ? Math.round((Date.now() - lastRunAt.getTime()) / 60000)
            : null
        if (staleMinutes !== null && staleMinutes < REMINDERS_STALE_AFTER_MINUTES) return

        const cooledDown = !lastAlertAt ||
            (Date.now() - lastAlertAt.getTime()) / 60000 >= ALERT_COOLDOWN_MINUTES
        if (!cooledDown) return

        const alerted = await sendCronAlert(client, {
            subject: '🚨 Lesson reminder cron has stopped running',
            lines: [
                lastRunAt
                    ? `Last successful run: <strong>${lastRunAt.toISOString()}</strong> (${staleMinutes} minutes ago).`
                    : 'No reminder run has ever been recorded.',
                'It is scheduled every 10 minutes by both Vercel Cron and GitHub Actions.',
                'Lesson reminders are almost certainly not reaching students right now.',
            ],
        })
        if (alerted) await writeHeartbeat(client, 'reminders-watchdog', true)
    } catch (e) {
        console.error('[Cron/auto-schedule-lessons] heartbeat watchdog failed (non-blocking):', e)
    }
}

export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = createAdminClient()
    const { data: admin } = await client
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .single()
    if (!admin) {
        return NextResponse.json({ error: 'No admin profile found' }, { status: 500 })
    }

    // Watchdog: a dead reminders cron cannot report itself, so this daily run
    // (a separate trigger) checks its heartbeat and raises the alarm.
    await checkRemindersHeartbeat(client)

    const today = studioToday()
    const fromDate = shiftDateStr(today, 1)
    const toDate = shiftDateStr(today, 7)

    console.log(`[Cron/auto-schedule-lessons] Booking standing slots ${fromDate} .. ${toDate}`)
    try {
        const summary = await autoScheduleStandingLessonsCore({
            client,
            adminId: admin.id,
            fromDate,
            toDate,
        })
        console.log(
            `[Cron/auto-schedule-lessons] Done. scheduled=${summary.scheduled} already_booked=${summary.already_booked} ` +
            `skipped_flag=${summary.skipped_flag} skipped_prior_cancellation=${summary.skipped_prior_cancellation} errors=${summary.errors}`
        )
        return NextResponse.json(summary)
    } catch (e: any) {
        console.error('[Cron/auto-schedule-lessons] Failed:', e)
        return NextResponse.json({ error: e?.message || 'auto-schedule failed' }, { status: 500 })
    }
}
