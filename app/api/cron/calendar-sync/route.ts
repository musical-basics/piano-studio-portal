import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { resultJson, runCalendarSync } from '@/lib/calendar-sync'

export const dynamic = 'force-dynamic'
// One Google call per fix, plus a lookup for each lesson whose event is not in the window.
export const maxDuration = 60

// Each morning (8:15am EST): compare the next 14 days of lessons with the studio
// Google Calendar and fix any mismatch (missing event, wrong time, event left
// behind for a removed lesson), then email the studio inbox what it fixed, only
// when there was something (Lionel's #925, lib/calendar-sync.ts). Only events the
// portal made are ever changed. Manual runs: ?dry=1 changes nothing, sends
// nothing, and answers exactly what it would do (with the email's subject and html).
export const GET = withCronRun('calendar-sync', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = new URL(request.url).searchParams.get('dry') === '1'

    try {
        if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
            throw new Error('Google Calendar is not set up (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY missing)')
        }
        const run = await runCalendarSync(createAdminClient(), { dryRun })
        const count = (kind: string, ok = true) => run.results.filter(r => r.kind === kind && (ok ? !r.error : true)).length
        const counts = {
            created: count('create'),
            linked: count('link'),
            retimed: count('retime'),
            deleted: count('delete'),
            leftAlone: count('leave'),
            errors: run.results.filter(r => r.kind === 'error' || r.error).length,
        }
        console.log(`[Cron/calendar-sync] ${run.window.from}..${run.window.to}: ${run.checked} lessons checked, ${run.matched} matched, ${JSON.stringify(counts)}${run.emailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`)
        return NextResponse.json({
            success: true,
            dryRun,
            window: run.window,
            checked: run.checked,
            matched: run.matched,
            counts,
            emailed: run.emailed,
            actions: run.results.map(resultJson),
            ...(dryRun && run.email ? { subject: run.email.subject, html: run.email.html } : {}),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/calendar-sync] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
