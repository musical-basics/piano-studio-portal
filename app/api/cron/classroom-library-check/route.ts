import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { checkClassroomLibrary } from '@/lib/classroom-library-check'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Weekly: compares the classroom's R2 recordings with the recordings library
// (Lionel's #1018, lib/classroom-library-check.ts). A lesson-length video with
// no library row is added, and put on its lesson when that lesson has no video
// (video only: never logged, no family email). Emails the studio inbox only when
// it found something. Manual runs: ?dry=1 reports without writing or emailing.
export const GET = withCronRun('classroom-library-check', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = new URL(request.url).searchParams.get('dry') === '1'
    const logs: string[] = []
    try {
        const result = await checkClassroomLibrary({
            dryRun,
            log: (msg) => {
                console.log(`[Cron/classroom-library-check] ${msg}`)
                logs.push(msg)
            },
        })
        console.log(`[Cron/classroom-library-check] scanned=${result.scanned} added=${result.added.length}`
            + ` missing=${result.missingFiles.length} emailed=${result.emailed}${dryRun ? ' (dry run)' : ''}`)
        return NextResponse.json({ success: true, ...result, logs })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/classroom-library-check] Failed: ${detail}`)
        return NextResponse.json({ error: detail, logs }, { status: 500 })
    }
}
