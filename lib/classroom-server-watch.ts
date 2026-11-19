import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { formatStudioTime } from '@/lib/backup-watchdog'
import { nextHealth, readReport, saveAlerts, type HealthAlerts, type HealthEmail } from '@/lib/classroom-server-health'

/**
 * Watch on the classroom's call server (Lionel's #724).
 *
 * Once classroom lessons run on the studio's own LiveKit server
 * (rtc.musicalbasics.com) instead of LiveKit Cloud, a stopped server means no
 * lesson can connect at all, and nothing else would say so. Every 5 minutes the
 * cron /api/cron/classroom-server-watch asks the server's root URL, which
 * answers HTTP 200 "OK" when healthy. A timeout, any other status or any other
 * body counts as a miss. Two misses in a row (about 10 minutes) email the
 * studio inbox once; the first good answer after that emails once more to say
 * it is back.
 *
 * Off until CLASSROOM_SERVER_HEALTH_URL is set (at the switch from LiveKit
 * Cloud), so it never alerts about a server that isn't in use yet.
 *
 * State lives on the watch's cron_heartbeats row, in the `state` column.
 */

export const WATCH_JOB = 'classroom-server-watch'
export const MISSES_BEFORE_ALERT = 2
export const PROBE_TIMEOUT_MS = 8_000

export type WatchState = {
    /** Last time the server answered "OK". */
    lastOkAt: string | null
    /** Misses in a row, reset by the first good answer. */
    consecutiveFailures: number
    /** When the current run of misses began (first miss). */
    downSince: string | null
    /** The "down" email went out for the current run of misses. */
    alerted: boolean
    /** Why the last probe counted as a miss. */
    lastError: string | null
}

export const INITIAL_STATE: WatchState = {
    lastOkAt: null,
    consecutiveFailures: 0,
    downSince: null,
    alerted: false,
    lastError: null,
}

export type Probe = { ok: true } | { ok: false; reason: string }

export type WatchEmail = { kind: 'down' | 'up'; subject: string; lines: string[] }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** One request to the server's health URL. Never throws. */
export async function probeServer(url: string, fetchImpl: FetchLike = fetch, timeoutMs = PROBE_TIMEOUT_MS): Promise<Probe> {
    try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
        const body = (await res.text()).trim()
        if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}` }
        if (body !== 'OK') return { ok: false, reason: `answered "${body.slice(0, 60)}" instead of "OK"` }
        return { ok: true }
    } catch (err: any) {
        const name = err?.name || ''
        if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, reason: `no answer within ${Math.round(timeoutMs / 1000)}s` }
        return { ok: false, reason: err?.cause?.code || err?.message || String(err) }
    }
}

function serverName(url: string): string {
    try {
        return new URL(url).host
    } catch {
        return url
    }
}

/**
 * The decision, kept pure for testing: the state after this probe, and the
 * email it calls for (at most one). `alerted` in the returned state assumes the
 * email goes out; the runner keeps it false when sending fails, so the next run
 * tries again.
 */
export function nextWatchState(prev: WatchState, probe: Probe, now: Date, url: string): { state: WatchState; email: WatchEmail | null } {
    const server = serverName(url)
    if (probe.ok) {
        const state: WatchState = { lastOkAt: now.toISOString(), consecutiveFailures: 0, downSince: null, alerted: false, lastError: null }
        if (!prev.alerted) return { state, email: null }
        return {
            state,
            email: {
                kind: 'up',
                subject: 'The classroom call server is back',
                lines: [
                    `The classroom's call server (${server}) is back since ${formatStudioTime(now)}. Classroom lessons can connect again.`,
                    prev.downSince ? `It stopped answering at ${formatStudioTime(new Date(prev.downSince))}.` : '',
                ].filter(Boolean),
            },
        }
    }

    const failures = prev.consecutiveFailures + 1
    const downSince = prev.downSince ?? now.toISOString()
    const state: WatchState = { ...prev, consecutiveFailures: failures, downSince, lastError: probe.reason }
    if (prev.alerted || failures < MISSES_BEFORE_ALERT) return { state, email: null }
    return {
        state: { ...state, alerted: true },
        email: {
            kind: 'down',
            subject: 'The classroom call server is down',
            lines: [
                `The classroom's call server (${server}) has not answered for 10 minutes since ${formatStudioTime(new Date(downSince))}. `
                + `Classroom lessons can't connect until it's back.`,
                `Quick fix: switch the classroom back to LiveKit Cloud (see music-lesson-dashboard docs/self-hosted-livekit.md, "Roll back"), or restart it on the server.`,
                `Last check: ${probe.reason}.`,
            ],
        },
    }
}

const HEALTH_FOOTER = `Sent by the portal's classroom server watch (/api/cron/classroom-server-watch) from the report the server sends every 5 minutes. `
    + `One email when a problem starts and one when it is fixed.`

const FOOTER = `Sent by the portal's classroom server watch (/api/cron/classroom-server-watch). `
    + `It checks the server every 5 minutes, emails once when it stops answering twice in a row, and once when it is back.`

export type HealthResult = { message: string; emails: string[]; alerts: HealthAlerts }

export type WatchResult = {
    configured: boolean
    message: string
    /** #949: the server's own report (recorder, call server, disk). */
    health?: HealthResult
    url?: string
    probe?: Probe
    before?: WatchState
    after?: WatchState
    email?: WatchEmail['kind'] | null
    emailed?: boolean
    dryRun?: boolean
}

export type WatchOptions = {
    client: DbClient
    /** Defaults to CLASSROOM_SERVER_HEALTH_URL. Unset or empty = the watch is off. */
    url?: string | null
    dryRun?: boolean
    now?: Date
    fetchImpl?: FetchLike
    timeoutMs?: number
    /** Defaults to sendCronAlert to the studio inbox. Returns whether it went out. */
    sendAlert?: (email: WatchEmail) => Promise<boolean>
}

async function readState(client: DbClient): Promise<WatchState> {
    const { data, error } = await client.from('cron_heartbeats').select('state').eq('job', WATCH_JOB).maybeSingle()
    // Unreadable state must not turn into a false alarm: fail the run instead.
    if (error) throw new Error(`cron_heartbeats read failed: ${error.message}`)
    return { ...INITIAL_STATE, ...((data?.state as Partial<WatchState> | null) ?? {}) }
}

async function writeState(client: DbClient, state: WatchState, now: Date, emailed: boolean): Promise<void> {
    const row: Record<string, unknown> = { job: WATCH_JOB, last_run_at: now.toISOString(), state }
    if (emailed) row.last_alert_at = now.toISOString()
    const { error } = await client.from('cron_heartbeats').upsert(row, { onConflict: 'job' })
    if (error) throw new Error(`cron_heartbeats write failed: ${error.message}`)
}

/** #949: the server's own report, read and alerted on (lib/classroom-server-health.ts). */
async function runHealthReport(
    client: DbClient,
    now: Date,
    dryRun: boolean,
    inUse: boolean,
    send: (e: HealthEmail) => Promise<boolean>,
): Promise<HealthResult> {
    const { report, alerts: prev } = await readReport(client)
    const { alerts, emails } = nextHealth(prev, report, now, inUse)
    const after: HealthAlerts = { ...alerts }
    const sent: string[] = []
    for (const e of emails) {
        if (dryRun) { sent.push(`would email "${e.kind}"`); continue }
        const ok = await send(e)
        sent.push(ok ? `emailed "${e.kind}"` : `"${e.kind}" email failed`)
        // A failed email is tried again next run: keep that problem's old flag.
        if (!ok) {
            if (e.kind.startsWith('stale')) after.stale = prev.stale
            else if (e.kind.startsWith('recorder')) after.recorderDown = prev.recorderDown
            else if (e.kind.startsWith('disk')) after.diskFull = prev.diskFull
        }
    }
    const changed = after.stale !== prev.stale || after.recorderDown !== prev.recorderDown || after.diskFull !== prev.diskFull
    if (!dryRun && changed) await saveAlerts(client, report, after)
    const status = report
        ? `server report ${Math.round((now.getTime() - Date.parse(report.at)) / 60_000)} min old: call server ${report.livekit}, recorder ${report.egress}, disk ${report.diskPct}%`
        : 'no server report yet'
    return { message: `${status}${sent.length ? `, ${sent.join(', ')}` : ''}`, emails: sent, alerts: after }
}

export async function runClassroomServerWatch(opts: WatchOptions): Promise<WatchResult> {
    const url = (opts.url === undefined ? process.env.CLASSROOM_SERVER_HEALTH_URL : opts.url)?.trim()
    const now = opts.now ?? new Date()
    const dryRun = !!opts.dryRun
    const sendHealth = (e: HealthEmail) =>
        opts.sendAlert ? opts.sendAlert(e as WatchEmail) : sendCronAlert(opts.client, { subject: e.subject, lines: e.lines, footer: HEALTH_FOOTER })
    const health = await runHealthReport(opts.client, now, dryRun, !!url, sendHealth)
    if (!url) {
        return { configured: false, health, message: `not configured: CLASSROOM_SERVER_HEALTH_URL is not set, so the server was not probed; ${health.message}` }
    }

    const before = await readState(opts.client)
    const probe = await probeServer(url, opts.fetchImpl, opts.timeoutMs)
    const { state, email } = nextWatchState(before, probe, now, url)

    let emailed = false
    let after = state
    if (email && !dryRun) {
        const send = opts.sendAlert ?? ((e: WatchEmail) => sendCronAlert(opts.client, { subject: e.subject, lines: e.lines, footer: FOOTER }))
        emailed = await send(email)
        // An email that failed to send is tried again on the next run.
        if (!emailed) after = email.kind === 'down' ? { ...state, alerted: false } : { ...state, alerted: true, downSince: before.downSince }
    }
    if (!dryRun) await writeState(opts.client, after, now, emailed)

    const status = probe.ok ? 'answered OK' : `missed (${probe.reason}), ${after.consecutiveFailures} in a row`
    const mail = email ? (dryRun ? `, would email "${email.kind}"` : emailed ? `, emailed "${email.kind}"` : `, "${email.kind}" email failed`) : ''
    return {
        configured: true,
        health,
        message: `${serverName(url)} ${status}${mail}${dryRun ? ' (dry run, nothing saved)' : ''}; ${health.message}`,
        url,
        probe,
        before,
        after,
        email: email?.kind ?? null,
        emailed,
        dryRun,
    }
}
