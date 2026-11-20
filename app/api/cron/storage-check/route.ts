import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { FREE_PLAN_LIMITS, runStorageCheck, type Limits } from '@/lib/storage-usage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Each morning: measure the database and Storage files against the Supabase
// free plan (500 MB and 1 GB) and email the studio inbox when either passes
// 80%, at most weekly while over and once more at 95% (Lionel's #778,
// lib/storage-usage.ts). Since #1072 also Cloudflare R2 (classroom videos),
// every bucket on the account against its free 10 GB, same 80% email.
// Silent otherwise; nothing goes to families.
// Manual runs: ?dry=1 measures and returns what it would email (with the HTML)
// without sending or saving. With ?dry=1 only, ?db_limit_mb=N and
// ?files_limit_mb=N (and ?r2_limit_gb=N for R2) stand in for the limits, to see the email.
export const GET = withCronRun('storage-check', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dry') === '1'
    const mb = (key: string) => {
        const n = Number(searchParams.get(key))
        return dryRun && n > 0 ? n * 1024 * 1024 : null
    }
    const limits: Limits = {
        database: mb('db_limit_mb') ?? FREE_PLAN_LIMITS.database,
        files: mb('files_limit_mb') ?? FREE_PLAN_LIMITS.files,
        r2: (dryRun && Number(searchParams.get('r2_limit_gb')) > 0 ? Number(searchParams.get('r2_limit_gb')) * 1e9 : null) ?? FREE_PLAN_LIMITS.r2,
    }

    try {
        const result = await runStorageCheck({ client: createAdminClient(), dryRun, limits })
        console.log(`[Cron/storage-check] ${result.message}`)
        return NextResponse.json({
            success: true,
            dryRun,
            emailed: result.emailed,
            message: result.message,
            reports: result.reports,
            usage: result.usage,
            subject: result.email?.subject ?? null,
            ...(dryRun ? { html: result.email?.html ?? null, state: result.state } : {}),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/storage-check] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
