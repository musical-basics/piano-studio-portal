/**
 * Alerting for the auto-capture cron (app/api/cron/capture-payments).
 *
 * Lives outside the route because Next.js route files may only export
 * handlers, and the daily watchdog in auto-schedule-lessons needs this too.
 *
 * A failed or missing capture is money: credits were already granted at
 * checkout, and a card hold Stripe hasn't captured within 7 days expires for
 * good. So problems always go to the support inbox, not just the admin profile.
 */
import type { DbClient } from '@/lib/supabase/admin'
import { ALERT_COOLDOWN_MINUTES, readHeartbeat, sendCronAlert, writeHeartbeat } from '@/lib/cron-alerts'

export const CAPTURE_JOB = 'capture-payments'
export const CAPTURE_ALERT_TO = 'support@musicalbasics.com'

/** Hourly job, so a heartbeat this old means several missed runs. */
const CAPTURE_STALE_AFTER_MINUTES = 6 * 60

const FOOTER = `Held payments must be captured within 7 days of checkout or the authorization expires and the charge is lost.
    Capture manually at <a href="https://dashboard.stripe.com/payments?status[0]=uncaptured">Stripe: uncaptured payments</a>.
    The job runs hourly from vercel.json.`

/**
 * Failures retry hourly, so without a cooldown one stuck payment or a Stripe
 * outage would send an email every hour.
 */
export async function sendCaptureAlert(client: DbClient, subject: string, lines: string[]): Promise<boolean> {
    const cooldownJob = `${CAPTURE_JOB}-alert`
    const { lastAlertAt } = await readHeartbeat(client, cooldownJob)
    if (lastAlertAt && (Date.now() - lastAlertAt.getTime()) / 60000 < ALERT_COOLDOWN_MINUTES) return false
    const alerted = await sendCronAlert(client, { subject, lines, to: CAPTURE_ALERT_TO, footer: FOOTER })
    if (alerted) await writeHeartbeat(client, cooldownJob, { alerted: true })
    return alerted
}

/** Called from the daily auto-schedule cron: a dead capture cron cannot report itself. */
export async function checkCaptureHeartbeat(client: DbClient): Promise<void> {
    try {
        const { lastRunAt, available } = await readHeartbeat(client, CAPTURE_JOB)
        // Can't tell a dead cron from an unmigrated table, so stay quiet.
        if (!available) return
        const staleMinutes = lastRunAt ? Math.round((Date.now() - lastRunAt.getTime()) / 60000) : null
        if (staleMinutes !== null && staleMinutes < CAPTURE_STALE_AFTER_MINUTES) return

        await sendCaptureAlert(client, '🚨 Payment auto-capture cron has stopped running', [
            lastRunAt
                ? `Last successful run: <strong>${lastRunAt.toISOString()}</strong> (${staleMinutes} minutes ago).`
                : 'No successful auto-capture run has ever been recorded.',
            'It should run every hour. Held Stripe payments are not being captured.',
        ])
    } catch (e) {
        console.error('[CaptureAlerts] heartbeat watchdog failed (non-blocking):', e)
    }
}
