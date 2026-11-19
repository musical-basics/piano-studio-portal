import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { studioToday } from '@/lib/studio-timezone'
import { alertStatementFailures, previousMonthOf, runMonthlyStatements } from '@/lib/monthly-statements'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// The monthly statement (#936, lib/monthly-statements.ts): on the 1st, one
// short email to each active family about last month (lessons held, lessons
// left, next payment date if on a plan). vercel.json runs it at 15:00 UTC on
// the 1st: 10am EST (11am EDT in summer), an hour after the credit check.
// Each family gets at most one per month (monthly_statements_sent), so a
// re-run only sends to families that do not have theirs yet. Failures email
// the studio inbox.
//
// Off switch: MONTHLY_STATEMENTS=off (a dry run still shows what would go out).
// Manual runs:
//   ?dry=1               per family: who, the subject and the plain text; no email, no claim
//   ?dry=1&only=<id>     one family, with the email's HTML too (any student, even a test account)
//   ?dry=1&month=YYYY-MM another month (dry runs only; real runs always cover last month)
//   ?only=<id>           a real run for one active family (still at most once a month)
export const GET = withCronRun('monthly-statements', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dry') === '1'
    const asked = searchParams.get('month')
    if (asked && !dryRun) {
        return NextResponse.json({ error: 'month= only works with dry=1; a real run always covers last month' }, { status: 400 })
    }
    const month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : previousMonthOf(studioToday())
    const onlyRaw = searchParams.get('only')
    const only = onlyRaw && /^[0-9a-f-]{36}$/i.test(onlyRaw) ? onlyRaw : null
    if (onlyRaw && !only) {
        return NextResponse.json({ error: 'only= must be a student id' }, { status: 400 })
    }

    try {
        const client = createAdminClient()
        const run = await runMonthlyStatements(client, { month, dryRun, only, withHtml: dryRun && Boolean(only) })
        const alerted = await alertStatementFailures(client, run)
        console.log(
            `[Cron/monthly-statements] ${month}: ` +
            (run.off && !dryRun
                ? 'off (MONTHLY_STATEMENTS=off), nothing sent'
                : `${run.sent} sent, ${run.wouldSend} would send, ${run.alreadySent} already sent, ` +
                  `${run.skipped} skipped, ${run.failed} failed${alerted ? ', alerted' : ''}`) +
            `${dryRun ? ' (dry run)' : ''}`,
        )
        return NextResponse.json({
            success: true,
            ...run,
            alerted,
            families: run.families.map(f => dryRun ? f : { studentId: f.studentId, status: f.status, reason: f.reason, notes: f.notes }),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/monthly-statements] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
