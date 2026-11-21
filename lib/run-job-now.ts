import { MANUAL_RUN_HEADER } from '@/lib/cron-auth'
import { allJobs, scheduledRunNear, summarizeJobRun } from '@/lib/scheduled-jobs'
import { STUDIO_TZ, studioTzAbbr } from '@/lib/studio-timezone'

/**
 * "Run now" on the admin jobs page (Lionel's #1076): runs a portal job on the
 * server, right away, exactly as its schedule would. The button's server action
 * (app/actions/scheduled-jobs.ts) checks the caller is the admin first; this
 * file then calls the cron route's own GET handler in-process with the cron
 * secret, so the run goes through the same code, the same guards and the same
 * recording (withCronRun) as a scheduled one. CRON_SECRET never leaves the
 * server. The run is marked manual (MANUAL_RUN_HEADER): "(run by hand)" on the
 * page, and no trigger heartbeat is stamped.
 *
 * Jobs that can email families carry `runNow.confirm` in lib/scheduled-jobs.ts:
 * the page asks first (with a dry run's numbers where the route has ?dry=1),
 * this refuses without that yes, and it waits out a scheduled run that is
 * starting or just started, so the two can't send the same email at once.
 * The Mac's jobs can't be run from here.
 */

type Handler = (request: Request) => Promise<Response>

/** Every portal cron route, loaded only when it is run. scripts/check_scheduled_jobs.ts keeps this in step with vercel.json. */
export const JOB_ROUTES: Record<string, () => Promise<{ GET: Handler }>> = {
    'reminders': () => import('@/app/api/cron/reminders/route'),
    'auto-schedule-lessons': () => import('@/app/api/cron/auto-schedule-lessons/route'),
    'evening-preview': () => import('@/app/api/cron/evening-preview/route'),
    'unlogged-tonight': () => import('@/app/api/cron/unlogged-tonight/route'),
    'unlogged-lessons': () => import('@/app/api/cron/unlogged-lessons/route'),
    'calendar-sync': () => import('@/app/api/cron/calendar-sync/route'),
    'weekly-summary': () => import('@/app/api/cron/weekly-summary/route'),
    'weekly-digest': () => import('@/app/api/cron/weekly-digest/route'),
    'credit-check': () => import('@/app/api/cron/credit-check/route'),
    'monthly-statements': () => import('@/app/api/cron/monthly-statements/route'),
    'staged-sends': () => import('@/app/api/cron/staged-sends/route'),
    'new-recordings': () => import('@/app/api/cron/new-recordings/route'),
    'organize-recordings': () => import('@/app/api/cron/organize-recordings/route'),
    'backfill-recordings': () => import('@/app/api/cron/backfill-recordings/route'),
    'classroom-recordings': () => import('@/app/api/cron/classroom-recordings/route'),
    'classroom-r2-move': () => import('@/app/api/cron/classroom-r2-move/route'),
    'classroom-library-check': () => import('@/app/api/cron/classroom-library-check/route'),
    'classroom-thumbnails': () => import('@/app/api/cron/classroom-thumbnails/route'),
    'capture-payments': () => import('@/app/api/cron/capture-payments/route'),
    'plan-payment-check': () => import('@/app/api/cron/plan-payment-check/route'),
    'classroom-server-watch': () => import('@/app/api/cron/classroom-server-watch/route'),
    'classroom-alone': () => import('@/app/api/cron/classroom-alone/route'),
    'backup-watchdog': () => import('@/app/api/cron/backup-watchdog/route'),
    'storage-check': () => import('@/app/api/cron/storage-check/route'),
}

export type RunNowResult = { ok: boolean; text: string; ms?: number }

function clock(at: Date): string {
    return `${at.toLocaleTimeString('en-US', { timeZone: STUDIO_TZ, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()} ${studioTzAbbr(at)}`
}

function manualRequest(job: string, secret: string, query = ''): Request {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'
    return new Request(`${base.replace(/\/+$/, '')}/api/cron/${job}${query}`, {
        headers: { authorization: `Bearer ${secret}`, [MANUAL_RUN_HEADER]: '1' },
    })
}

type Options = {
    now?: Date
    /** Tests: stands in for the route. */
    handler?: Handler
    secret?: string
}

type Found = { info: ReturnType<typeof allJobs>[number] } | { error: string }

function findJob(job: string, now: Date): Found {
    const info = allJobs(now).find(j => j.job === job)
    if (!info) return { error: 'There is no job by that name.' }
    if (info.runsOn !== 'portal') return { error: 'This job runs on the Mac, so the portal cannot start it.' }
    return { info }
}

async function call(job: string, query: string, opts: Options): Promise<{ res: Response; body: any } | { error: string }> {
    const secret = opts.secret ?? process.env.CRON_SECRET
    if (!secret) return { error: 'CRON_SECRET is not set on the server, so the job cannot be started.' }
    const handler = opts.handler ?? (JOB_ROUTES[job] ? (await JOB_ROUTES[job]()).GET : null)
    if (!handler) return { error: 'This job has no Run now yet.' }
    const res = await handler(manualRequest(job, secret, query))
    let body: any = null
    try {
        body = await res.json()
    } catch {
        // Not JSON: the status alone decides.
    }
    return { res, body }
}

/** Runs the job now. Jobs that can email families need `confirmed` (the page's yes). */
export async function runJobNowCore(job: string, opts: Options & { confirmed?: boolean } = {}): Promise<RunNowResult> {
    const now = opts.now ?? new Date()
    const found = findJob(job, now)
    if ('error' in found) return { ok: false, text: found.error }
    const { info } = found
    if (info.runNow) {
        if (!opts.confirmed) return { ok: false, text: 'This job can email families, so it needs your yes first.' }
        const near = info.cron ? scheduledRunNear(info.cron, now) : null
        if (near) {
            return {
                ok: false,
                text: `Its scheduled run is at ${clock(near)}, right about now. Try again in a few minutes, so the two runs can't send the same email at once.`,
            }
        }
    }
    const started = Date.now()
    try {
        const out = await call(job, '', opts)
        const ms = Date.now() - started
        if ('error' in out) return { ok: false, text: out.error }
        if (!out.res.ok) {
            const error = typeof out.body?.error === 'string' && out.body.error ? out.body.error : `It answered HTTP ${out.res.status}.`
            return { ok: false, text: error, ms }
        }
        return { ok: true, text: summarizeJobRun(job, out.body) || 'Done.', ms }
    } catch (e) {
        return { ok: false, text: e instanceof Error ? e.message : String(e), ms: Date.now() - started }
    }
}

/** For a job with `runNow.preview`: a dry run (changes and sends nothing), in words for the question. */
export async function previewJobRunCore(job: string, opts: Options = {}): Promise<RunNowResult> {
    const now = opts.now ?? new Date()
    const found = findJob(job, now)
    if ('error' in found) return { ok: false, text: found.error }
    const preview = found.info.runNow?.preview
    if (!preview) return { ok: false, text: 'This job has no check to run first.' }
    try {
        const out = await call(job, '?dry=1', opts)
        if ('error' in out) return { ok: false, text: out.error }
        if (!out.res.ok) return { ok: false, text: (typeof out.body?.error === 'string' && out.body.error) || `It answered HTTP ${out.res.status}.` }
        return { ok: true, text: preview(out.body) }
    } catch (e) {
        return { ok: false, text: e instanceof Error ? e.message : String(e) }
    }
}
