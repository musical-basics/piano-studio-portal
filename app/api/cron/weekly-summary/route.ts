import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { buildWeeklySummary, lastWeekMonday, mondayOf, renderWeeklySummary, sendWeeklySummary } from '@/lib/weekly-summary'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Mondays: one email to the studio inbox summing up last week (Mon-Sun Eastern):
// lessons held and logged, videos, credits used and added, families at 0 lessons
// (#754, lib/weekly-summary.ts). Only to Lionel; no family is emailed.
// Scheduled 13:30 UTC in vercel.json = 8:30am EST; during daylight time
// (Mar to Nov) that is 9:30am EDT, since Vercel Cron runs on UTC.
// Manual runs: ?week=YYYY-MM-DD (any day of that week) for another week,
// ?dry=1 to return the summary and the email's HTML without sending.
export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const asked = searchParams.get('week')
    const week = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? mondayOf(asked) : lastWeekMonday()
    const dryRun = searchParams.get('dry') === '1'

    try {
        const client = createAdminClient()
        const summary = await buildWeeklySummary(client, week)
        const { subject, html } = renderWeeklySummary(summary)
        const emailed = dryRun ? false : await sendWeeklySummary(client, summary)
        console.log(`[Cron/weekly-summary] ${summary.weekStart}: "${subject}"${emailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`)
        return NextResponse.json({ success: true, dryRun, emailed, subject, summary, ...(dryRun ? { html } : {}) })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/weekly-summary] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
