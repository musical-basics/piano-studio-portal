import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { runClassroomServerWatch } from '@/lib/classroom-server-watch'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Every 5 minutes: ask the classroom's own call server (self-hosted LiveKit) if
// it is up, and email the studio inbox once when it misses twice in a row and
// once when it is back (Lionel's #724, lib/classroom-server-watch.ts). Does
// nothing until CLASSROOM_SERVER_HEALTH_URL is set. Manual runs: ?dry=1 probes
// and reports without emailing or saving.
export const GET = withCronRun('classroom-server-watch', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = new URL(request.url).searchParams.get('dry') === '1'

    try {
        const result = await runClassroomServerWatch({ client: createAdminClient(), dryRun })
        console.log(`[Cron/classroom-server-watch] ${result.message}`)
        return NextResponse.json({ success: true, ...result })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/classroom-server-watch] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
