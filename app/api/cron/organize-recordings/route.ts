import { NextResponse } from 'next/server'
import { organizeZBackupRecordings } from '@/lib/organize-recordings'

export const dynamic = 'force-dynamic'
// Server-side Dropbox moves are fast (no download), but allow headroom for
// share-link creation + DB work across a batch.
export const maxDuration = 300

// Moves new ZBackup recordings into each student's /Lesson Recordings folder and
// attaches them to the matching lesson. Dedupes by date, so it never duplicates
// a recording already placed by another path. Safe to run repeatedly.
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('key') !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const logs: string[] = []
    const start = new Date()
    console.log(`[Cron/organize-recordings] Starting at ${start.toISOString()}`)

    try {
        const result = await organizeZBackupRecordings({
            log: (msg) => {
                console.log(`[Cron/organize-recordings] ${msg}`)
                logs.push(msg)
            },
        })
        console.log(
            `[Cron/organize-recordings] Done. scanned=${result.scanned} moved=${result.moved.length} skipped=${result.skipped.length} errors=${result.errors.length}`
        )
        return NextResponse.json({ success: true, result, logs })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/organize-recordings] Failed: ${detail}`)
        return NextResponse.json({ error: detail, logs }, { status: 500 })
    }
}
