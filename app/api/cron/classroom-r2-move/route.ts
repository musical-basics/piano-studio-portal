import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { moveOldClassroomVideos, MOVE_AFTER_DAYS } from '@/lib/classroom-r2-move'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Once a day: classroom videos saved more than 60 days ago move from Cloudflare
// R2 to their finished, same-size copy in the student's Dropbox folder; the
// library row and the lesson then point at a Dropbox share link and the R2 file
// is deleted (Lionel's #1020, lib/classroom-r2-move.ts). Lesson-length ones with
// no copy yet are queued for one and move on a later run. No emails.
// Manual runs: ?dry=1 for the plan without changing anything, ?days=N for
// another age (30 or more).
export const GET = withCronRun('classroom-r2-move', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dry') === '1'
    const days = Math.max(Number(searchParams.get('days')) || MOVE_AFTER_DAYS, 30)
    const logs: string[] = []

    try {
        const result = await moveOldClassroomVideos({
            dryRun,
            days,
            log: (msg) => {
                console.log(`[Cron/classroom-r2-move] ${msg}`)
                logs.push(msg)
            },
        })
        const problems = result.kept.filter(k => k.problem)
        console.log(`[Cron/classroom-r2-move] moved=${result.moved.length} (${(result.movedBytes / 1e9).toFixed(2)} GB)`
            + ` queued=${result.queued.length} kept=${result.kept.length} problems=${problems.length}${dryRun ? ' (dry run)' : ''}`)
        return NextResponse.json({ success: true, ...result, problems, logs })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/classroom-r2-move] Failed: ${detail}`)
        return NextResponse.json({ error: detail, logs }, { status: 500 })
    }
}
