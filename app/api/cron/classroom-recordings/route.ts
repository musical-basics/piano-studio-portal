import { NextResponse } from 'next/server'
import { attachClassroomRecordings } from '@/lib/classroom-recordings'
import { isAuthorizedCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Attaches classroom (LiveKit) recordings to the lessons they were recorded in.
// The classroom also calls the lesson-recording webhook when it saves one; this
// sweep catches any call that never arrived. Idempotent: a recording already on
// a lesson is skipped. Manual runs: ?days=N to look further back, ?dry=1 to
// report without writing.
export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(Number(searchParams.get('days')) || 14, 1), 400)
    const dryRun = searchParams.get('dry') === '1'
    const logs: string[] = []

    try {
        const result = await attachClassroomRecordings({
            days,
            dryRun,
            log: (msg) => {
                console.log(`[Cron/classroom-recordings] ${msg}`)
                logs.push(msg)
            },
        })
        console.log(
            `[Cron/classroom-recordings] Done. scanned=${result.scanned} attached=${result.attached.length} skipped=${result.skipped.length}${dryRun ? ' (dry run)' : ''}`
        )
        return NextResponse.json({ success: true, dryRun, result, logs })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/classroom-recordings] Failed: ${detail}`)
        return NextResponse.json({ error: detail, logs }, { status: 500 })
    }
}
