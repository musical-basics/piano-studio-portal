import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { runClassroomAloneCheck } from '@/lib/classroom-alone-alert'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Every minute: a student waiting alone in the classroom 5 minutes past the
// later of their arrival and their lesson's start, with Lionel not in the room,
// emails the studio inbox once per lesson (Lionel's #1104,
// lib/classroom-alone-alert.ts). Nothing to do until the classroom records
// attendance (our own call server). Manual runs: ?dry=1 lists what it would
// email without claiming or sending anything.
export const GET = withCronRun('classroom-alone', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = new URL(request.url).searchParams.get('dry') === '1'

    try {
        const result = await runClassroomAloneCheck(createAdminClient(), {
            dryRun,
            log: (msg) => console.log(`[Cron/classroom-alone] ${msg}`),
        })
        if (result.rooms > 0) console.log(`[Cron/classroom-alone] ${result.message}`)
        return NextResponse.json({ success: true, ...result })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/classroom-alone] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
