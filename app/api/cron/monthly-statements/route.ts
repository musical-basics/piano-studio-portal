import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { studioToday } from '@/lib/studio-timezone'
import { alertStatementFailures, previousMonthOf, runMonthlyStatements, statementsOff, type StatementRun } from '@/lib/monthly-statements'
import { dbStore, planBatches, resendDeps } from '@/lib/staged-send'
import { defaultStatementOps, startStagedStatements } from '@/lib/staged-send-runner'

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
// Since protocol 1.20 the run is staged (lib/staged-send-runner.ts): a preview
// copy of one family's statement to the studio inbox, the first 3 families,
// and the rest 24 hours later from the staged-sends check, only if Resend
// reports those 3 delivered with no bounce or complaint. A second trigger the
// same month sends nothing more. The Tests card on /admin/jobs has the record
// and "Send the rest now".
//
// Off switch: MONTHLY_STATEMENTS=off (a dry run still shows what would go out).
// Manual runs:
//   ?dry=1               per family: who, the subject and the plain text; no email, no claim;
//                        stagedPlan says which 3 would go first
//   ?dry=1&only=<id>     one family, with the email's HTML too (any student, even a test account)
//   ?dry=1&month=YYYY-MM another month (dry runs only; real runs always cover last month)
//   ?only=<id>           a real run for one active family (still at most once a month, not staged)
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
        let run: StatementRun
        let staged: Record<string, unknown> | null = null
        if (dryRun || only || statementsOff()) {
            run = await runMonthlyStatements(client, { month, dryRun, only, withHtml: dryRun && Boolean(only) })
            if (dryRun && !only) {
                // Which families the staged send would start with (ids only).
                const going = run.families.filter(f => f.status === 'would_send' && f.to)
                const plan = planBatches(going.map(f => ({ id: f.studentId, to: [f.to as string] })))
                staged = going.length > 1
                    ? { firstBatch: plan.filter(p => p.batch === 'first').map(p => p.id), rest: plan.filter(p => p.batch === 'rest').map(p => p.id), holdHours: 24 }
                    : { note: 'one family or none: not staged' }
            }
        } else {
            const start = await startStagedStatements(
                { store: dbStore(client), deps: resendDeps(client), statements: defaultStatementOps(client) },
                month,
            )
            run = { month, dryRun: false, off: false, sent: 0, wouldSend: 0, alreadySent: 0, skipped: 0, failed: 0, families: [] }
            if (start.mode === 'held') {
                staged = { held: true, status: start.record.status, restDueAt: start.record.rest_due_at, id: start.record.id }
            } else {
                for (const f of start.families) {
                    run.families.push(f)
                    if (f.status === 'sent') run.sent++
                    else if (f.status === 'already_sent') run.alreadySent++
                    else if (f.status === 'failed') run.failed++
                    else if (f.status === 'skipped') run.skipped++
                }
                staged = start.mode === 'direct'
                    ? { direct: true, why: start.why }
                    : { id: start.record?.id, firstSent: start.firstSent, rest: start.restCount, restDueAt: start.restDueAt, stopped: start.stopped }
            }
        }
        // Failures of a real run were already emailed by the staged send's own run.
        const alerted = dryRun ? false : only ? await alertStatementFailures(client, run) : false
        console.log(
            `[Cron/monthly-statements] ${month}: ` +
            (run.off && !dryRun
                ? 'off (MONTHLY_STATEMENTS=off), nothing sent'
                : `${run.sent} sent, ${run.wouldSend} would send, ${run.alreadySent} already sent, ` +
                  `${run.skipped} skipped, ${run.failed} failed${alerted ? ', alerted' : ''}`) +
            `${dryRun ? ' (dry run)' : ''}` +
            (staged ? ` staged: ${JSON.stringify(staged)}` : ''),
        )
        return NextResponse.json({
            success: true,
            ...run,
            staged,
            alerted,
            families: run.families.map(f => dryRun ? f : { studentId: f.studentId, status: f.status, reason: f.reason, notes: f.notes }),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/monthly-statements] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
