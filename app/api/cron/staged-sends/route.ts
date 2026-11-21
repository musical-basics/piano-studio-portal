import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { batchCounts, dbStore, resendDeps } from '@/lib/staged-send'
import { checkStagedSends, defaultStatementOps } from '@/lib/staged-send-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Staged family bulk emails (protocol 1.20, lib/staged-send.ts), every 15
// minutes: reads Resend's delivery reports for the first 3 families of each
// waiting send. A bounce, complaint or failed send stops it at once and
// emails the studio inbox why; when the rest is due (24 hours after the first
// batch, or before a recital), all 3 delivered sends the rest, anything else
// stops it the same way. An hour after the last emails went, their delivery
// is read once more for the record on the Tests card (/admin/jobs).
// Manual: ?dry=1 lists the sends it would look at, changes and sends nothing.
export const GET = withCronRun('staged-sends', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const dryRun = new URL(request.url).searchParams.get('dry') === '1'
    try {
        const client = createAdminClient()
        const store = dbStore(client)
        if (dryRun) {
            const now = Date.now()
            const active = await store.active()
            return NextResponse.json({
                success: true,
                dryRun: true,
                sends: active.map(r => ({
                    id: r.id,
                    kind: r.kind,
                    status: r.status,
                    restDueAt: r.rest_due_at,
                    due: r.status === 'waiting' && (!r.rest_due_at || Date.parse(r.rest_due_at) <= now),
                    first: batchCounts(r.items, 'first'),
                    rest: batchCounts(r.items, 'rest'),
                })),
            })
        }
        const report = await checkStagedSends({ store, deps: resendDeps(client), statements: defaultStatementOps(client) })
        console.log(`[Cron/staged-sends] looked at ${report.looked}: rest sent ${report.restSent.length}, stopped ${report.stopped.length}, checked ${report.checked.length}, unstuck ${report.unstuck.length}`)
        return NextResponse.json({ success: true, ...report })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/staged-sends] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
