import { NextResponse } from 'next/server'
import { backfillMissingRecordings } from '@/lib/backfill-recordings'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { createAdminClient } from '@/lib/supabase/admin'
import { sweepZoomAttendance, type SweepResult } from '@/lib/core/zoom-lesson-attendance'

export const dynamic = 'force-dynamic'
// Recordings can be ~50-300MB; allow time for download + chunked Dropbox upload.
export const maxDuration = 300

// Fallback for Zoom recordings the real-time webhook missed. Scans recent past
// lessons that have a zoom_meeting_id but no video_url and pulls any matching
// cloud recording into Dropbox. Idempotent: a lesson with video_url already set
// is excluded by the query, so re-runs are safe. Before that, it saves who
// joined each recent Zoom lesson (#965, lib/core/zoom-lesson-attendance.ts).
export const GET = withCronRun('backfill-recordings', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const logs: string[] = []
    const start = new Date()
    console.log(`[Cron/backfill-recordings] Starting at ${start.toISOString()}`)

    // #965: first, save Zoom attendance for lessons that ended 30+ minutes ago
    // (quick: one Zoom call per lesson, capped). Its own failure never stops
    // the recording backfill below.
    let attendance: SweepResult | { error: string }
    try {
        attendance = await sweepZoomAttendance(createAdminClient(), { limit: 8, budgetMs: 60_000 })
        console.log(`[Cron/backfill-recordings] attendance: due=${attendance.due} saved=${attendance.saved.length} errors=${attendance.errors.length} left=${attendance.left}`)
    } catch (err: any) {
        attendance = { error: err?.message || String(err) }
        console.error(`[Cron/backfill-recordings] attendance failed (non-blocking): ${attendance.error}`)
    }

    try {
        const result = await backfillMissingRecordings({
            log: (msg) => {
                console.log(`[Cron/backfill-recordings] ${msg}`)
                logs.push(msg)
            },
        })
        console.log(
            `[Cron/backfill-recordings] Done. scanned=${result.scanned} recovered=${result.recovered.length} skipped=${result.skipped.length} errors=${result.errors.length}`
        )
        return NextResponse.json({ success: true, result, attendance, logs })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/backfill-recordings] Failed: ${detail}`)
        return NextResponse.json({ error: detail, attendance, logs }, { status: 500 })
    }
}
