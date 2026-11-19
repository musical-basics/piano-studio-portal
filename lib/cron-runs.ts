import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { summarizeJobRun } from '@/lib/scheduled-jobs'

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
 * Best-effort: a failed write is logged and never fails the run itself.
 */

const DETAIL_MAX = 500

export type CronRun = { ok: boolean; detail?: string | null }

export async function recordCronRun(client: DbClient, job: string, { ok, detail }: CronRun): Promise<void> {
    try {
        const now = new Date().toISOString()
        const row: Record<string, unknown> = {
            job,
            last_finished_at: now,
            last_ok: ok,
            last_detail: detail ? detail.replace(/\s+/g, ' ').trim().slice(0, DETAIL_MAX) : null,
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
 * stranger hitting the URL is not a run) and ?dry=1 test runs.
 *
 *   export const GET = withCronRun('reminders', handle)
 *
 * `opts.client` swaps the database client (tests).
 */
export function withCronRun(job: string, handler: Handler, opts: { client?: () => DbClient } = {}): Handler {
    const record = (run: CronRun) => recordWith(opts.client ?? createAdminClient, job, run)
    return async function GET(request: Request): Promise<Response> {
        let res: Response
        try {
            res = await handler(request)
        } catch (e) {
            await record({ ok: false, detail: e instanceof Error ? e.message : String(e) })
            throw e
        }
        if (res.status === 401 || new URL(request.url).searchParams.get('dry') === '1') return res

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
        await record({ ok, detail })
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
