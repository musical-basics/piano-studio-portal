import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { autoRefillDeps } from '@/lib/auto-refill-server'
import { previewAutoRefill, runAutoRefill } from '@/lib/auto-refill'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Auto-refill (#1477, lib/auto-refill.ts), every 15 minutes: finds families on
// auto-refill whose lessons just ran out (from the credit history, so every
// way a lesson is taken counts), charges their saved card for their monthly
// lessons once the lesson is past its 10-minute Undo, retries a declined card
// 3 days later, and finishes any charge a run left half done. One open refill
// per family and one Stripe PaymentIntent per refill: never charged twice.
// Paused while the rollout stage is off (the Tests card on /admin/jobs).
// Manual: ?dry=1 says what it would start and charge, changes nothing.
export const GET = withCronRun('auto-refill', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const dryRun = new URL(request.url).searchParams.get('dry') === '1'
    try {
        const client = createAdminClient()
        const deps = autoRefillDeps(client)
        if (dryRun) {
            return NextResponse.json({ success: true, dryRun: true, fakeStripe: deps.stripe.fake, ...(await previewAutoRefill(deps)) })
        }
        const report = await runAutoRefill(deps)
        const charged = report.charged.filter(c => c.outcome === 'paid').length
        const declined = report.charged.filter(c => c.outcome === 'declined').length
        console.log(`[Cron/auto-refill] found ${report.found.length}, charged ${charged}, declined ${declined}, recovered ${report.recovered.length}, waiting ${report.waiting}${report.paused ? ' (paused: stage off)' : ''}`)
        return NextResponse.json({ success: true, fakeStripe: deps.stripe.fake, ...report, paid: charged, declined })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/auto-refill] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
