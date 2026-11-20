import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { makeClassroomThumbnails } from '@/lib/classroom-thumbnails'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Hourly: a small picture for each classroom recording that has none yet
// (Lionel's #1095, lib/classroom-thumbnails.ts), shown on its row in the admin
// Classroom recordings tab. A few per run; each is made once. No emails.
// Manual runs: ?limit=N (at most 20).
export const GET = withCronRun('classroom-thumbnails', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get('limit')) || 8, 1), 20)
    const logs: string[] = []
    try {
        const result = await makeClassroomThumbnails({
            limit,
            log: (msg) => {
                console.log(`[Cron/classroom-thumbnails] ${msg}`)
                logs.push(msg)
            },
        })
        return NextResponse.json({ success: true, ...result, logs })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/classroom-thumbnails] Failed: ${detail}`)
        return NextResponse.json({ error: detail, logs }, { status: 500 })
    }
}
