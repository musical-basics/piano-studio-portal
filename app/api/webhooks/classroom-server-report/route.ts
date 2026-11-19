import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseReport, saveReport } from '@/lib/classroom-server-health'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

/**
 * The classroom server's health report (#949), POSTed every 5 minutes by a timer
 * on the server: { livekit, egress, diskPct, diskTotalGb }. Its own secret
 * (CLASSROOM_SERVER_REPORT_SECRET, header x-report-secret), so the server holds
 * nothing that can do more than report. The classroom-server-watch cron decides
 * what to email (lib/classroom-server-health.ts).
 */
export async function POST(req: Request) {
    const secret = process.env.CLASSROOM_SERVER_REPORT_SECRET
    if (!secret || req.headers.get('x-report-secret') !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const report = parseReport(await req.json().catch(() => null))
    if (!report) return NextResponse.json({ error: 'expected { livekit, egress, diskPct }' }, { status: 400 })
    try {
        await saveReport(createAdminClient(), report)
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        console.error('[classroom-server-report] not saved:', e?.message || e)
        return NextResponse.json({ error: 'not saved' }, { status: 500 })
    }
}
