import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { shiftDateStr, studioToday } from '@/lib/studio-timezone'
import { runMorningEmail } from '@/lib/unlogged-lessons'

export const dynamic = 'force-dynamic'
// Asks Zoom about each unlogged lesson (#797): a few calls, each capped at 15s.
export const maxDuration = 60

// Each morning: email the studio inbox about yesterday's lessons that nobody
// logged (so no credit was taken), with what Zoom saw for each (#797: "No-show?"
// and a No-Show button when only Lionel joined), and what the portal logged by
// itself that day (#793), and families asking to move a lesson with Approve /
// Decline buttons (#878). Silent when there is none of these. Manual runs:
// ?date=YYYY-MM-DD for another day, ?dry=1 to build without emailing (the
// reply then carries the email's subject and html).
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
        const { unlogged: lessons, autoLogged, moveRequests, email, emailed } = await runMorningEmail(client, date, { dryRun })
        console.log(`[Cron/unlogged-lessons] ${date}: ${lessons.length} unlogged, ${autoLogged.length} logged automatically, ${moveRequests.length} move request(s)${emailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`)
        return NextResponse.json({
            success: true,
            date,
            dryRun,
            emailed,
            unlogged: lessons.map(l => ({ id: l.id, time: l.time, status: l.status, zoom: l.attendance?.kind ?? null })),
            autoLogged: autoLogged.map(l => ({ id: l.id, date: l.date, time: l.time, by: l.by, before: l.before, after: l.after })),
            moveRequests: moveRequests.map(r => ({ id: r.id, lessonId: r.lessonId, from: `${r.fromDate} ${r.fromTime}`, to: `${r.toDate} ${r.toTime}` })),
            ...(dryRun && email ? { subject: email.subject, html: email.html, footer: email.footer } : {}),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/unlogged-lessons] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
