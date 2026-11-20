import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { quietJobRun, summarizeJobRun } from '@/lib/scheduled-jobs'
import { isManualRun } from '@/lib/cron-auth'

/**
 * Every scheduled run, recorded (Lionel's #777).
 *
 * The admin jobs page (/admin/jobs) shows each scheduled job's last run and
 * whether it worked. Each cron route records its runs on its own
 * cron_heartbeats row (named after the route, e.g. "reminders"), in columns of
 * their own: last_finished_at, last_ok, last_detail. A run that worked also
 * stamps last_run_at, which already meant "last ran OK" for the jobs that use
 * it, so their alerting (reminder gaps, the backup watchdog, payment capture)
 * reads exactly what it did before. last_alert_at and state are never touched.
 *
 * Since #1077 each run also lands in cron_runs (30 days of history, the marks
 * on the jobs page). A trigger on cron_heartbeats writes it whenever
 * last_finished_at moves, so this file and the Mac's scripts feed it without
 * writing it themselves; last_duration_ms carries how long the run took, and
 * last_quiet whether it worked and did nothing (a job running every few
 * minutes keeps those quiet runs at most once an hour).
 *
 * Best-effort: a failed write is logged and never fails the run itself.
 */

const DETAIL_MAX = 500

export type CronRun = {
    ok: boolean
    detail?: string | null
    durationMs?: number | null
    /** Worked and did nothing (kept in cron_runs at most once an hour); null = let the database compare details. */
    quiet?: boolean | null
}

export async function recordCronRun(client: DbClient, job: string, { ok, detail, durationMs, quiet }: CronRun): Promise<void> {
    try {
        const now = new Date().toISOString()
        const row: Record<string, unknown> = {
            job,
            last_finished_at: now,
            last_ok: ok,
            last_detail: detail ? detail.replace(/\s+/g, ' ').trim().slice(0, DETAIL_MAX) : null,
            last_duration_ms: durationMs != null && Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
            last_quiet: ok ? quiet ?? null : false,
        }
        if (ok) row.last_run_at = now
        const { error } = await client.from('cron_heartbeats').upsert(row, { onConflict: 'job' })
        if (error) console.error(`[CronRuns] could not record "${job}" (non-blocking):`, error.message)
    } catch (e) {
        console.error(`[CronRuns] could not record "${job}" (non-blocking):`, e)
    }
}

type Handler = (request: Request) => Promise<Response>

/**
 * Wraps a cron route's GET so every run is recorded: a 2xx answer worked (the
 * detail is the job's one-line summary of its JSON, see scheduled-jobs.ts),
 * anything else failed (the detail is the route's `error`), and a thrown error
 * failed and is re-thrown unchanged. Not recorded: unauthorized requests (a
 * stranger hitting the URL is not a run), ?dry=1 test runs, and a 400 (a test
 * call with wrong parameters, refused before doing anything: on Nov 19 one left
 * the monthly statements red for a job that had not run yet). A "Run now"
 * from the jobs page is recorded like any run, its detail ending "(run by hand)".
 *
 *   export const GET = withCronRun('reminders', handle)
 *
 * `opts.client` swaps the database client (tests).
 */
export function withCronRun(job: string, handler: Handler, opts: { client?: () => DbClient } = {}): Handler {
    return async function GET(request: Request): Promise<Response> {
        const started = Date.now()
        // "Run now" on the jobs page (#1076) says so in the detail.
        const byHand = isManualRun(request)
        const record = (run: CronRun) => recordWith(opts.client ?? createAdminClient, job, {
            ...run,
            detail: byHand ? `${run.detail || 'Done'} (run by hand)` : run.detail,
            durationMs: Date.now() - started,
        })
        let res: Response
        try {
            res = await handler(request)
        } catch (e) {
            await record({ ok: false, detail: e instanceof Error ? e.message : String(e) })
            throw e
        }
        if (res.status === 401 || res.status === 400 || new URL(request.url).searchParams.get('dry') === '1') return res

        let body: any = null
        try {
            body = await res.clone().json()
        } catch {
            // Not JSON: the status alone decides.
        }
        const ok = res.ok
        const detail = ok
            ? summarizeJobRun(job, body)
            : (typeof body?.error === 'string' && body.error) || `answered HTTP ${res.status}`
        await record({ ok, detail, quiet: ok ? quietJobRun(job, body) : false })
        return res
    }
}

async function recordWith(makeClient: () => DbClient, job: string, run: CronRun): Promise<void> {
    let client: DbClient
    try {
        client = makeClient()
    } catch (e) {
        console.error(`[CronRuns] no database client to record "${job}" (non-blocking):`, e)
        return
    }
    await recordCronRun(client, job, run)
}
