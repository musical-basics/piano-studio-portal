import type { DbClient } from '@/lib/supabase/admin'
import { formatStudioTime } from '@/lib/backup-watchdog'

/**
 * The classroom server's own health report (Lionel's #949). Every 5 minutes a
 * timer on the server (/opt/livekit/studio-report.sh, see music-lesson-dashboard
 * docs/self-hosted-livekit.md) POSTs whether the call server and the recorder
 * (LiveKit Egress) are running and how full the disk is to
 * /api/webhooks/classroom-server-report, which keeps the latest report on the
 * cron_heartbeats row 'classroom-server-report'. The classroom-server-watch cron
 * reads it every 5 minutes and emails the studio inbox once per problem:
 *
 *   - the recorder (or the call server) stopped running,
 *   - the disk passed DISK_ALERT_PCT (and again only after it fell below DISK_CLEAR_PCT),
 *   - the reports stopped coming for REPORT_STALE_MIN minutes (server off or cut off),
 * and once more when each is fixed.
 *
 * The disk check always runs (the livestream shares the disk). The recorder
 * and stale-report checks only alert once the classroom runs on the server
 * (CLASSROOM_SERVER_HEALTH_URL set at the switch), so a server not yet in use
 * never alerts about its recorder.
 */

export const REPORT_JOB = 'classroom-server-report'
export const DISK_ALERT_PCT = 85
export const DISK_CLEAR_PCT = 80
export const REPORT_STALE_MIN = 20

export type ServerReport = {
    /** When the server sent it (server clock). */
    at: string
    /** systemctl is-active livekit / livekit-egress: "active", "inactive", "failed", ... */
    livekit: string
    egress: string
    /** Disk use of / in percent (0-100). */
    diskPct: number
    diskTotalGb?: number
}

export type HealthAlerts = {
    recorderDown: boolean
    diskFull: boolean
    stale: boolean
}

export const NO_ALERTS: HealthAlerts = { recorderDown: false, diskFull: false, stale: false }

export type HealthEmail = { kind: string; subject: string; lines: string[] }

/** Check a POSTed report: plain values only, nothing else is stored. */
export function parseReport(body: unknown, now: Date = new Date()): ServerReport | null {
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>
    const word = (v: unknown) => (typeof v === 'string' && /^[a-z-]{1,20}$/.test(v) ? v : null)
    const livekit = word(b.livekit)
    const egress = word(b.egress)
    const disk = Number(b.diskPct)
    if (!livekit || !egress || !Number.isFinite(disk) || disk < 0 || disk > 100) return null
    const total = Number(b.diskTotalGb)
    return {
        at: now.toISOString(),
        livekit,
        egress,
        diskPct: Math.round(disk),
        ...(Number.isFinite(total) && total > 0 ? { diskTotalGb: Math.round(total) } : {}),
    }
}

/**
 * The decision, pure for testing: which problems are on now, and the emails
 * for the ones that changed (an alert when one starts, a short note when it ends).
 * `inUse` = the classroom runs on this server (recorder and stale checks on).
 */
export function nextHealth(
    prev: HealthAlerts,
    report: ServerReport | null,
    now: Date,
    inUse: boolean,
    switchBackUrl?: string | null,
): { alerts: HealthAlerts; emails: HealthEmail[] } {
    const emails: HealthEmail[] = []
    const ageMin = report ? (now.getTime() - Date.parse(report.at)) / 60_000 : Infinity
    const fresh = ageMin <= REPORT_STALE_MIN

    // Stale reports (only while the classroom uses the server).
    const stale = inUse && !fresh
    if (stale && !prev.stale) {
        emails.push({
            kind: 'stale',
            subject: 'The classroom server stopped reporting',
            lines: [
                report
                    ? `The classroom server's health report last arrived at ${formatStudioTime(new Date(report.at))}, ${Math.round(ageMin)} minutes ago. The server may be off or cut off from the internet.`
                    : `No health report from the classroom server has arrived yet.`,
                ...(switchBackUrl ? [`If lessons can't connect: switch the classroom back to LiveKit Cloud with one tap: ${switchBackUrl}`] : []),
            ],
        })
    } else if (!stale && prev.stale) {
        emails.push({ kind: 'stale-ok', subject: 'The classroom server is reporting again', lines: [`Its report arrived again at ${formatStudioTime(new Date(report!.at))}.`] })
    }

    // Recorder or call server not running (only from a fresh report, and only while in use).
    const servicesDown = fresh && report ? [report.livekit !== 'active' ? `the call server (${report.livekit})` : '', report.egress !== 'active' ? `the recorder (${report.egress})` : ''].filter(Boolean) : []
    const recorderDown = inUse && servicesDown.length > 0 ? true : inUse && !fresh ? prev.recorderDown : false
    if (recorderDown && !prev.recorderDown) {
        emails.push({
            kind: 'recorder',
            subject: 'The classroom recorder stopped',
            lines: [
                `On the classroom server ${servicesDown.join(' and ')} ${servicesDown.length > 1 ? 'are' : 'is'} not running (report at ${formatStudioTime(new Date(report!.at))}). Lessons may not be recorded until it's back.`,
                `Fix on the server: systemctl restart livekit-egress (or livekit), then check systemctl status.`,
                ...(switchBackUrl ? [`If lessons can't connect at all: switch the classroom back to LiveKit Cloud with one tap: ${switchBackUrl}`] : []),
            ],
        })
    } else if (!recorderDown && prev.recorderDown && fresh) {
        emails.push({ kind: 'recorder-ok', subject: 'The classroom recorder is running again', lines: [`The call server and the recorder are both running again (report at ${formatStudioTime(new Date(report!.at))}).`] })
    }

    // Disk (always, from a fresh report). Hysteresis: on at 85%, off below 80%.
    let diskFull = prev.diskFull
    if (fresh && report) {
        if (!prev.diskFull && report.diskPct >= DISK_ALERT_PCT) {
            diskFull = true
            emails.push({
                kind: 'disk',
                subject: `The classroom server's disk is ${report.diskPct}% full`,
                lines: [
                    `The classroom server's disk is ${report.diskPct}% full${report.diskTotalGb ? ` (of ${report.diskTotalGb} GB)` : ''}. Recordings fail once it is full.`,
                    `Recordings are uploaded to storage as they finish, so the disk should stay low; something else is filling it (logs, the livestream, leftover files).`,
                ],
            })
        } else if (prev.diskFull && report.diskPct < DISK_CLEAR_PCT) {
            diskFull = false
            emails.push({ kind: 'disk-ok', subject: `The classroom server's disk is back to ${report.diskPct}%`, lines: [`Disk use is down to ${report.diskPct}%.`] })
        }
    }

    return { alerts: { recorderDown, diskFull, stale }, emails }
}

export async function readReport(client: DbClient): Promise<{ report: ServerReport | null; alerts: HealthAlerts }> {
    const { data, error } = await client.from('cron_heartbeats').select('state').eq('job', REPORT_JOB).maybeSingle()
    if (error) throw new Error(`cron_heartbeats read failed: ${error.message}`)
    const state = (data?.state ?? {}) as { report?: ServerReport; alerts?: HealthAlerts }
    return { report: state.report ?? null, alerts: { ...NO_ALERTS, ...(state.alerts ?? {}) } }
}

export async function saveReport(client: DbClient, report: ServerReport): Promise<void> {
    const { alerts } = await readReport(client)
    const { error } = await client
        .from('cron_heartbeats')
        .upsert({ job: REPORT_JOB, last_run_at: report.at, state: { report, alerts } }, { onConflict: 'job' })
    if (error) throw new Error(`cron_heartbeats write failed: ${error.message}`)
}

export async function saveAlerts(client: DbClient, report: ServerReport | null, alerts: HealthAlerts): Promise<void> {
    const row: Record<string, unknown> = { job: REPORT_JOB, state: { report, alerts } }
    if (report) row.last_run_at = report.at
    const { error } = await client.from('cron_heartbeats').upsert(row, { onConflict: 'job' })
    if (error) throw new Error(`cron_heartbeats write failed: ${error.message}`)
}
