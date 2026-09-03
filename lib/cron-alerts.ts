/**
 * Cron health: heartbeats and failure alerts to the studio inbox.
 *
 * Reminders are window-based (lib/reminder-policy.ts): a notice only goes out
 * if a cron tick lands inside its 25-60 minute window, and a missed window is
 * never retried. That made a scheduler outage completely silent. In Aug 2026
 * GitHub Actions throttled the every-10-minutes workflow down to ~6 runs/day
 * and nobody noticed for a week.
 *
 * So every reminder run records a heartbeat, and anything that would cause a
 * student not to get their notice raises an email:
 *
 *   1. late      - the gap since the previous tick is far longer than scheduled
 *   2. missed    - a notice window elapsed with its sent flag still false
 *   3. failed    - Resend rejected an individual reminder
 *   4. stalled   - the daily auto-schedule cron sees a stale reminders heartbeat
 *                  (catches a total outage, which a dead cron cannot self-report)
 *
 * All of it is best-effort and non-blocking: if the heartbeat table or the mail
 * send fails, the reminder run itself still completes normally.
 */
import type { DbClient } from '@/lib/supabase/admin'

const FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'
const FALLBACK_TO = 'support@musicalbasics.com'

/** Don't re-alert about an ongoing scheduler problem more than once per window. */
export const ALERT_COOLDOWN_MINUTES = 360

/**
 * `available` is false when the heartbeat table itself could not be read (most
 * likely the migration hasn't been run against this environment). Callers must
 * check it before treating a null `lastRunAt` as "the job never ran", otherwise
 * a missing table looks identical to a dead cron and raises a false alarm.
 */
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

export async function writeHeartbeat(client: DbClient, job: string, alerted = false): Promise<void> {
    try {
        const row: Record<string, string> = { job, last_run_at: new Date().toISOString() }
        if (alerted) row.last_alert_at = new Date().toISOString()
        const { error } = await client.from('cron_heartbeats').upsert(row, { onConflict: 'job' })
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
    { subject, lines }: { subject: string; lines: string[] },
): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) {
        console.error('[CronHealth] RESEND_API_KEY missing, cannot alert:', subject)
        return false
    }
    try {
        const to = await studioInbox(client)
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const { error } = await resend.emails.send({
            from: FROM,
            to,
            subject,
            html: `
                <p><strong>${subject}</strong></p>
                <ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>
                <p style="color:#666;font-size:13px">
                    Students may not have received their lesson notices. To send them now:<br>
                    <code>npx tsx scripts/send_reminders_now.ts --date=YYYY-MM-DD --send</code>
                </p>
                <p style="color:#666;font-size:13px">
                    Triggers: Vercel Cron (vercel.json) and GitHub Actions (.github/workflows/cron.yml).
                </p>`,
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
