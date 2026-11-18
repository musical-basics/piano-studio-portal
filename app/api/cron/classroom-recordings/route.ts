import { NextResponse } from 'next/server'
import { attachClassroomRecordings } from '@/lib/classroom-recordings'
import { syncClassroomDropboxCopies } from '@/lib/classroom-dropbox-copies'
import { isAuthorizedCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Attaches classroom (LiveKit) recordings to the lessons they were recorded in,
// and logs the lesson (one credit) when its video is 20+ minutes, the lesson is
// still unlogged and from the last 7 days (see lib/classroom-recordings.ts).
// The classroom also calls the lesson-recording webhook when it saves one; this
// sweep catches any call that never arrived. Idempotent: a recording already on
// a lesson is skipped. Then it copies new recordings into the student's Dropbox
// folder (Dropbox fetches them itself) and checks on copies still running
// (lib/classroom-dropbox-copies.ts). Manual runs: ?days=N to look further back,
// ?copy_days=N to queue older recordings for Dropbox, ?dry=1 to report without
// writing (result.logged = what it would log, dropbox.started = what it would copy).
export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(Number(searchParams.get('days')) || 14, 1), 400)
    const copyDays = Math.min(Math.max(Number(searchParams.get('copy_days')) || 14, 1), 400)
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

        // A Dropbox problem must not fail the attach run above.
        let dropbox: Awaited<ReturnType<typeof syncClassroomDropboxCopies>> | { error: string }
        try {
            dropbox = await syncClassroomDropboxCopies({
                days: copyDays,
                dryRun,
                log: (msg) => {
                    console.log(`[Cron/classroom-recordings] dropbox: ${msg}`)
                    logs.push(`dropbox: ${msg}`)
                },
            })
            console.log(`[Cron/classroom-recordings] dropbox: queued=${dropbox.queued} started=${dropbox.started.length}`
                + ` done=${dropbox.done.length} running=${dropbox.inProgress} failed=${dropbox.failed.length}${dryRun ? ' (dry run)' : ''}`)
        } catch (err: any) {
            dropbox = { error: err?.message || String(err) }
            console.error(`[Cron/classroom-recordings] dropbox copies failed: ${dropbox.error}`)
        }
        return NextResponse.json({ success: true, dryRun, result, dropbox, logs })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/classroom-recordings] Failed: ${detail}`)
        return NextResponse.json({ error: detail, logs }, { status: 500 })
    }
}
