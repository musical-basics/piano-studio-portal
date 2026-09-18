/**
 * Cron health: heartbeats and failure alerts to the studio inbox.
 *
 * In Aug 2026 lesson reminders stopped reaching students for a week and nothing
 * said so. Two causes, and this module exists to make both loud:
 *
 *   - Vercel Cron had been 401ing since Dec 2025 because the route only read
 *     `?key=`. Two triggers were configured, so the setup LOOKED redundant, but
 *     one had never worked and nothing checked.
 *   - GitHub Actions then throttled the surviving trigger to ~6 runs/day.
 *
 * So every reminder run records a heartbeat, both overall and PER TRIGGER, and
 * anything that would cause a student not to get their notice raises an email:
 *
 *   1. late      - the gap since the previous tick is far longer than scheduled
 *   2. unnotified- a lesson began having never been announced at all
 *   3. failed    - Resend rejected an individual reminder
 *   4. stalled   - the daily auto-schedule cron sees a stale reminders heartbeat
 *                  (catches a total outage, which a dead cron cannot self-report)
 *   5. trigger   - one of the two triggers has gone quiet while the other still
 *                  works, which is exactly the fault that hid for eight months
 *
 * All of it is best-effort and non-blocking: if the heartbeat table or the mail
 * send fails, the reminder run itself still completes normally.
 *
 * `withRetry` is here for the opposite reason: to keep a blip from becoming an
 * alert at all. Supabase's REST gateway returns the occasional 504, and a read
 * that fails once is not a reminders outage.
 */
import type { DbClient } from '@/lib/supabase/admin'

const FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'
const FALLBACK_TO = 'support@musicalbasics.com'

/** Don't re-alert about an ongoing scheduler problem more than once per window. */
export const ALERT_COOLDOWN_MINUTES = 360

/** Shape of a Supabase query result, narrowed to what the retry needs. */
type QueryResult<T> = { data: T | null; error: { message: string } | null }

/**
 * Runs a Supabase query, retrying a failed attempt a couple of times.
 *
 * Supabase's REST gateway intermittently answers 504 Gateway Timeout under no
 * particular load. supabase-js surfaces that as an `error` rather than throwing,
 * so a caller that checks `if (error)` treats one unlucky millisecond exactly
 * like a dead database. For the reminder cron that meant abandoning the tick,
 * emailing the studio and returning 500 (which in turn fails the GitHub Actions
 * trigger and mails the repo owner too) over something the very next attempt
 * would have answered in 120ms.
 *
 * Retries are short and few: the caller is a cron with its own 10-minute
 * cadence, and notices self-heal, so the fallback for "still failing" is simply
 * the next tick rather than anything a longer backoff would buy.
 */
export async function withRetry<T>(
    label: string,
    run: () => PromiseLike<QueryResult<T>>,
    { attempts = 3, baseDelayMs = 400 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<QueryResult<T> & { attemptsUsed: number }> {
    let last: QueryResult<T> = { data: null, error: { message: 'never ran' } }
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            last = await run()
        } catch (e) {
            // supabase-js normally returns errors, but a fetch-level fault can
            // still throw. Same handling either way.
            last = { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
        }
        if (!last.error) return { ...last, attemptsUsed: attempt }
        if (attempt < attempts) {
            console.warn(`[CronHealth] ${label} failed (attempt ${attempt}/${attempts}), retrying: ${last.error.message}`)
            await new Promise(resolve => setTimeout(resolve, baseDelayMs * attempt))
        }
    }
    console.error(`[CronHealth] ${label} failed after ${attempts} attempts: ${last.error?.message}`)
    return { ...last, attemptsUsed: attempts }
}

/**
 * `available` is false when the heartbeat table itself could not be read (most
 * likely the migration hasn't been run against this environment). Callers must
 * check it before treating a null `lastRunAt` as "the job never ran", otherwise
 * a missing table looks identical to a dead cron and raises a false alarm.
 */
/**
 * Which scheduler invoked us. Vercel Cron sends a Bearer header, the GitHub
 * Actions workflow sends `?key=`. Recorded separately so a single dead trigger
 * is visible even while the other keeps the job nominally healthy.
 */
export type CronSource = 'vercel' | 'github' | 'manual'

export function cronSource(request: Request): CronSource {
    const secret = process.env.CRON_SECRET
    if (secret && new URL(request.url).searchParams.get('key') === secret) return 'github'
    if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return 'vercel'
    return 'manual'
}

/** Heartbeat row name for one job's individual trigger. */
export function sourceJob(job: string, source: CronSource): string {
    return `${job}:${source}`
}

export type Heartbeat = { lastRunAt: Date | null; lastAlertAt: Date | null; available: boolean }

export async function readHeartbeat(client: DbClient, job: string): Promise<Heartbeat> {
    try {
        const { data, error } = await client
            .from('cron_heartbeats')
            .select('last_run_at, last_alert_at')
            .eq('job', job)
            .maybeSingle()
        if (error) {
            console.error(`[CronHealth] heartbeat read failed for "${job}" (non-blocking):`, error.message)
            return { lastRunAt: null, lastAlertAt: null, available: false }
        }
        if (!data) return { lastRunAt: null, lastAlertAt: null, available: true }
        return {
            lastRunAt: data.last_run_at ? new Date(data.last_run_at) : null,
            lastAlertAt: data.last_alert_at ? new Date(data.last_alert_at) : null,
            available: true,
        }
    } catch (e) {
        // Table not migrated yet: degrade to "unknown" rather than failing the run.
        console.error(`[CronHealth] heartbeat read threw for "${job}" (non-blocking):`, e)
        return { lastRunAt: null, lastAlertAt: null, available: false }
    }
}

export async function writeHeartbeat(
    client: DbClient,
    job: string,
    { alerted = false, source }: { alerted?: boolean; source?: CronSource } = {},
): Promise<void> {
    try {
        const now = new Date().toISOString()
        const rows: Record<string, string>[] = [{ job, last_run_at: now }]
        if (alerted) rows[0].last_alert_at = now
        // A per-trigger row as well, so "Vercel has been silent for a day" is
        // answerable even though GitHub keeps the combined heartbeat fresh.
        if (source && source !== 'manual') rows.push({ job: sourceJob(job, source), last_run_at: now })
        const { error } = await client.from('cron_heartbeats').upsert(rows, { onConflict: 'job' })
        // Most likely cause is the migration not having been run against prod yet.
        // Gap/miss detection stays off until then; send-failure alerts still work.
        if (error) console.error(`[CronHealth] heartbeat write failed for "${job}" (non-blocking):`, error.message)
    } catch (e) {
        console.error('[CronHealth] heartbeat write failed (non-blocking):', e)
    }
}

async function studioInbox(client: DbClient): Promise<string> {
    try {
        const { data } = await client
            .from('profiles')
            .select('email')
            .eq('role', 'admin')
            .limit(1)
            .single()
        return data?.email || FALLBACK_TO
    } catch {
        return FALLBACK_TO
    }
}

/**
 * Emails the studio inbox about a cron problem. Returns whether a mail actually
 * went out, so the caller can stamp last_alert_at for cooldown purposes.
 */
export async function sendCronAlert(
    client: DbClient,
    { subject, lines, to: toOverride, footer }: {
        subject: string
        lines: string[]
        /** Fixed recipient instead of the admin profile's inbox. */
        to?: string
        /** Replaces the reminder-specific footer for alerts about other jobs. */
        footer?: string
    },
): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[CronHealth] RESEND_API_KEY missing, cannot alert:', subject)
        return false
    }
    try {
        const to = toOverride || await studioInbox(client)
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const { error } = await resend.emails.send({
            from: FROM,
            to,
            subject,
            html: `
                <p><strong>${subject}</strong></p>
                <ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>
                ${footer !== undefined ? `<p style="color:#666;font-size:13px">${footer}</p>` : `<p style="color:#666;font-size:13px">
                    Students may not have received their lesson notices. To send them now:<br>
                    <code>npx tsx scripts/send_reminders_now.ts --date=YYYY-MM-DD --send</code>
                </p>
                <p style="color:#666;font-size:13px">
                    Triggers: Vercel Cron (vercel.json) and GitHub Actions (.github/workflows/cron.yml).
                </p>`}`,
        })
        if (error) {
            console.error('[CronHealth] alert send failed:', error)
            return false
        }
        console.log(`[CronHealth] alerted ${to}: ${subject}`)
        return true
    } catch (e) {
        console.error('[CronHealth] alert send threw (non-blocking):', e)
        return false
    }
}

/**
 * Pings an external dead-man's-switch service (healthchecks.io or similar).
 *
 * Every other alarm in this file lives INSIDE the system it watches: the
 * watchdog is itself a Vercel cron, and the alert email goes through Resend. If
 * Vercel stops running crons altogether, or the Resend key is revoked, all of it
 * goes quiet, and quiet is indistinguishable from healthy. An outside service
 * that expects a ping every 10 minutes and complains when one doesn't arrive is
 * the only monitor that survives the app being the broken thing.
 *
 * Set HEALTHCHECK_PING_URL to the check's ping URL. Unset (e.g. locally) is a
 * no-op. Never throws and never blocks the run: a monitoring outage must not
 * become a reminders outage.
 */
export async function pingDeadManSwitch(ok: boolean): Promise<void> {
    const url = process.env.HEALTHCHECK_PING_URL
    if (!url) return
    try {
        const target = ok ? url : `${url.replace(/\/$/, '')}/fail`
        await fetch(target, {
            method: 'POST',
            signal: AbortSignal.timeout(5000),
        })
    } catch (e) {
        console.error('[CronHealth] dead-man ping failed (non-blocking):', e)
    }
}
