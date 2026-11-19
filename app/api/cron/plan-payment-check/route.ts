import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { fetchPlanEvents, lookupPlanAlertInfo, planAlertEmail, processPlanEvent, replayPlanEvents, type ProcessResult } from '@/lib/plan-payment-alerts'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Plan payment watch (#984, lib/plan-payment-alerts.ts): every hour, read the
// last week of Stripe's plan payment events (read-only) and email the studio
// once when a family's plan payment fails twice in a row, and once more if
// Stripe ends the plan unpaid. Needed because the Stripe webhook endpoint is
// not subscribed to payment failures; the webhook still passes along what it
// does get. Events and emails are each recorded once, so overlapping runs and
// the webhook never double up.
//
// Manual runs:
//   ?dry=1            replay the window from scratch: what it would email (subjects
//                     and lines), whether each was already sent; no writes, no email
//   ?days=N           how far back to read (default 7, at most 30: Stripe keeps 30 days)
export const GET = withCronRun('plan-payment-check', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dry') === '1'
    const askedDays = Number(searchParams.get('days'))
    const days = Number.isFinite(askedDays) && askedDays > 0 ? Math.min(30, askedDays) : 7

    try {
        const client = createAdminClient()
        const events = await fetchPlanEvents(days)

        if (dryRun) {
            const alerts = replayPlanEvents(events)
            const { data: sentRows } = await client.from('plan_payment_alerts').select('subscription_id, alert_key, sent_at')
            const sent = new Set((sentRows || []).filter((r: any) => r.sent_at).map((r: any) => `${r.subscription_id} ${r.alert_key}`))
            const out = []
            for (const a of alerts) {
                const email = planAlertEmail(a, await lookupPlanAlertInfo(client, a))
                out.push({
                    kind: a.kind,
                    subscriptionId: a.subscriptionId,
                    key: a.key,
                    at: new Date(a.event.at).toISOString(),
                    failures: a.failures.length,
                    alreadySent: sent.has(`${a.subscriptionId} ${a.key}`),
                    subject: email.subject,
                    lines: email.lines,
                })
            }
            return NextResponse.json({
                success: true, dryRun, days,
                events: events.length,
                failed: events.filter(e => e.kind === 'failed').length,
                paid: events.filter(e => e.kind === 'paid').length,
                ended: events.filter(e => e.kind === 'ended').length,
                alerts: out,
            })
        }

        const results: ProcessResult[] = []
        for (const e of events) results.push(await processPlanEvent(client, e))
        const alerts = results.filter(r => r.alert && !r.alert.already).map(r => r.alert!)
        const sent = alerts.filter(a => a.sent).length
        const notSent = alerts.length - sent
        console.log(`[Cron/plan-payment-check] ${days}d: ${events.length} events, ${results.filter(r => r.recorded).length} new, ${sent} emailed${notSent ? `, ${notSent} email(s) failed, will retry` : ''}`)
        return NextResponse.json({
            success: true, dryRun, days,
            events: events.length,
            newEvents: results.filter(r => r.recorded).length,
            emailed: sent,
            emailFailed: notSent,
            alerts,
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/plan-payment-check] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
