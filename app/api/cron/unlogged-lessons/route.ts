import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { shiftDateStr, studioToday } from '@/lib/studio-timezone'
import { alertUnloggedLessons, findUnloggedLessons } from '@/lib/unlogged-lessons'

export const dynamic = 'force-dynamic'

// Each morning: email the studio inbox about yesterday's lessons that nobody
// logged (so no credit was taken). Silent when there are none. Manual runs:
// ?date=YYYY-MM-DD for another day, ?dry=1 to list without emailing.
export const GET = withCronRun('unlogged-lessons', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const asked = searchParams.get('date')
    const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : shiftDateStr(studioToday(), -1)
    const dryRun = searchParams.get('dry') === '1'

    try {
        const client = createAdminClient()
        const lessons = await findUnloggedLessons(client, date)
        const emailed = dryRun ? false : await alertUnloggedLessons(client, date, lessons)
        console.log(`[Cron/unlogged-lessons] ${date}: ${lessons.length} unlogged${emailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`)
        return NextResponse.json({
            success: true,
            date,
            dryRun,
            emailed,
            unlogged: lessons.map(l => ({ id: l.id, time: l.time, status: l.status })),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/unlogged-lessons] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
