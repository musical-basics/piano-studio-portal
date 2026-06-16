import { NextResponse } from 'next/server'
import { backfillMissingRecordings } from '@/lib/backfill-recordings'

export const dynamic = 'force-dynamic'
// Recordings can be ~50-300MB; allow time for download + chunked Dropbox upload.
export const maxDuration = 300

// Fallback for Zoom recordings the real-time webhook missed. Scans recent past
// lessons that have a zoom_meeting_id but no video_url and pulls any matching
// cloud recording into Dropbox. Idempotent: a lesson with video_url already set
// is excluded by the query, so re-runs are safe.
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('key') !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const logs: string[] = []
    const start = new Date()
    console.log(`[Cron/backfill-recordings] Starting at ${start.toISOString()}`)

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
        return NextResponse.json({ success: true, result, logs })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/backfill-recordings] Failed: ${detail}`)
        return NextResponse.json({ error: detail, logs }, { status: 500 })
    }
}
