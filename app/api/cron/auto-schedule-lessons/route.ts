import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autoScheduleStandingLessonsCore } from '@/lib/core/lessons'
import { studioToday } from '@/lib/studio-timezone'

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
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const secret = process.env.CRON_SECRET
    const headerAuth = request.headers.get('authorization')
    // Accept the ?key= used by the other crons AND Vercel's cron Authorization header.
    const authorized = Boolean(secret) && (searchParams.get('key') === secret || headerAuth === `Bearer ${secret}`)
    if (!authorized) {
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
