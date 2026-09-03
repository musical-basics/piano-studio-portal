import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { readHeartbeat, sendCronAlert, writeHeartbeat, sourceJob } from '@/lib/cron-alerts'
import { ALL_NOTICES, NOTICE_FLAG_COLUMNS } from '@/lib/reminder-policy'
import { studioToday } from '@/lib/studio-timezone'

export const dynamic = 'force-dynamic'

/**
 * Weekly proof that the reminder pipeline is alive.
 *
 * Silence only carries information once you know alerts still arrive. The
 * Aug 2026 outage was invisible partly because "no alert" and "no alerting"
 * looked identical for a week. This sends a short digest every Monday, which
 * both reports the week and re-exercises the whole Resend path, so a revoked
 * mail key or a dead cron surfaces on its own rather than at the moment it
 * finally matters.
 */
function shiftDateStr(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ago(at: Date | null): string {
    if (!at) return 'never'
    const mins = Math.round((Date.now() - at.getTime()) / 60000)
    if (mins < 60) return `${mins}m ago`
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`
    return `${Math.round(mins / 1440)}d ago`
}

export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = createAdminClient()
    const today = studioToday()
    const since = shiftDateStr(today, -7)

    // Literal select: building it from NOTICE_FLAG_COLUMNS defeats supabase-js
    // row typing. check_reminder_policy.ts asserts the two stay in step.
    const { data: lessons, error } = await client
        .from('lessons')
        .select('date, time, reminder_48h_sent, reminder_24h_sent, reminder_12h_sent, reminder_15m_sent, profiles(name)')
        .gte('date', since)
        .lt('date', today)
        .neq('status', 'cancelled')

    if (error) {
        console.error('[Cron/weekly-digest] Error reading lessons:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    type DigestRow = {
        date: string
        time: string
        profiles?: { name?: string | null } | null
    } & Record<string, unknown>
    const rows = (lessons || []) as unknown as DigestRow[]

    const total = rows.length
    const counts = Object.fromEntries(ALL_NOTICES.map(n => [n, 0])) as Record<string, number>
    const unnotified: string[] = []
    for (const lesson of rows) {
        let any = false
        for (const n of ALL_NOTICES) {
            if (lesson[NOTICE_FLAG_COLUMNS[n]]) { counts[n]++; any = true }
        }
        if (!any) {
            unnotified.push(`${lesson.profiles?.name || 'Unknown student'} — ${lesson.date} ${String(lesson.time).slice(0, 5)}`)
        }
    }

    const [overall, vercel, github] = await Promise.all([
        readHeartbeat(client, 'reminders'),
        readHeartbeat(client, sourceJob('reminders', 'vercel')),
        readHeartbeat(client, sourceJob('reminders', 'github')),
    ])

    const healthy = unnotified.length === 0 && overall.lastRunAt !== null
    const lines = [
        `<strong>${total}</strong> lesson(s) in the last 7 days (${since} to ${today}).`,
        `Notices sent: ${ALL_NOTICES.map(n => `${n} ${counts[n]}`).join(', ')}.`,
        unnotified.length
            ? `<strong>${unnotified.length} lesson(s) ran with no reminder at all:</strong> ${unnotified.join('; ')}`
            : 'Every lesson got at least one reminder.',
        `Trigger health — reminder cron last ran ${ago(overall.lastRunAt)}; ` +
        `via Vercel ${ago(vercel.lastRunAt)}, via GitHub Actions ${ago(github.lastRunAt)}.`,
        'If this email stops arriving, the reminder pipeline or its mail path is down.',
    ]

    const sent = await sendCronAlert(client, {
        subject: healthy
            ? `✅ Weekly reminder digest: ${total} lesson(s), all notified`
            : `⚠️ Weekly reminder digest: ${unnotified.length} lesson(s) missed`,
        lines,
    })
    await writeHeartbeat(client, 'weekly-digest')

    console.log(`[Cron/weekly-digest] total=${total} unnotified=${unnotified.length} emailed=${sent}`)
    return NextResponse.json({ success: true, total, counts, unnotified: unnotified.length, emailed: sent })
}
