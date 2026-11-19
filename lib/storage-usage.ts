import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { formatStudioTime } from '@/lib/backup-watchdog'
import { isoToStudioWallClock } from '@/lib/studio-timezone'

/**
 * Storage alert (Lionel's #778).
 *
 * The studio runs on Supabase's free plan: a 500 MB database and 1 GB of
 * Storage files. Past those, Supabase stops taking new data, which would show
 * up as lessons that won't save or uploads that fail. Once a day the cron
 * /api/cron/storage-check measures both (through the service-role-only SQL
 * function studio_storage_usage, migration 20261119000000) and emails the
 * studio inbox when either passes 80%: what, how big, the limit, how fast it
 * grew and what to do. While over, it repeats at most weekly, plus once more
 * when it crosses 95%. Silent otherwise.
 *
 * State lives on the job's cron_heartbeats row (`state`): one reading a day for
 * the last five weeks (for the growth figure) and the last email per resource.
 */

export const STORAGE_JOB = 'storage-check'

const MB = 1024 * 1024

/** Supabase free plan. Sizes in bytes (1 MB = 1024 * 1024, as Supabase counts). */
export const FREE_PLAN_LIMITS: Limits = { database: 500 * MB, files: 1024 * MB }
export const WARN_AT = 0.8
export const URGENT_AT = 0.95
export const REPEAT_DAYS = 7
const HISTORY_DAYS = 35

export type Resource = 'database' | 'files'
export type Limits = Record<Resource, number>
export type Level = 0 | 80 | 95

export type Usage = {
    database: number
    files: number
    fileCount: number
    tables: { name: string; bytes: number }[]
    buckets: { name: string; bytes: number; files: number }[]
}

export type Reading = { date: string; at: string; database: number; files: number }

export type StorageState = {
    /** One reading per Eastern day, oldest first, at most HISTORY_DAYS old. */
    readings: Reading[]
    /** The last email per resource still over 80%: which level it was about, and when. */
    alerts: Partial<Record<Resource, { level: 80 | 95; at: string }>>
}

export const INITIAL_STATE: StorageState = { readings: [], alerts: {} }

export type ResourceReport = {
    resource: Resource
    bytes: number
    limit: number
    percent: number
    level: Level
    /** Bytes per day since the oldest earlier reading, null without one. */
    perDay: number | null
    /** How many days that growth figure spans. */
    overDays: number | null
    /** This run emails about it. */
    due: boolean
}

export type StorageEmail = { subject: string; html: string; urgent: boolean }

const LABEL: Record<Resource, string> = { database: 'database', files: 'file storage' }

export function formatSize(bytes: number): string {
    const mb = bytes / MB
    if (mb >= 1024) return `${(mb / 1024).toFixed(2).replace(/\.?0+$/, '')} GB`
    if (mb >= 10) return `${Math.round(mb)} MB`
    return `${mb.toFixed(1).replace(/\.0$/, '')} MB`
}

/** Whole percent, rounded down so "80%" never shows below the 80% line. */
function percentOf(bytes: number, limit: number): number {
    return Math.floor((bytes / limit) * 100)
}

function levelOf(bytes: number, limit: number): Level {
    const share = bytes / limit
    return share >= URGENT_AT ? 95 : share >= WARN_AT ? 80 : 0
}

function studioDate(at: Date): string {
    return isoToStudioWallClock(at.toISOString()).localDate
}

function growth(readings: Reading[], resource: Resource, bytes: number, now: Date): { perDay: number | null; overDays: number | null } {
    const today = studioDate(now)
    const earlier = readings.filter(r => r.date < today)
    if (!earlier.length) return { perDay: null, overDays: null }
    const oldest = earlier[0]
    const days = (now.getTime() - Date.parse(oldest.at)) / 86_400_000
    if (days < 0.5) return { perDay: null, overDays: null }
    return { perDay: (bytes - oldest[resource]) / days, overDays: Math.round(days) }
}

/**
 * The decision, kept pure for testing: the state after this reading, a report
 * per resource, and the email it calls for (at most one, covering every
 * resource that is due). `alerts` in the returned state assumes the email goes
 * out; the runner keeps the old ones when sending fails, so the next run tries
 * again.
 */
export function decideStorageAlert(
    prev: StorageState,
    usage: Pick<Usage, 'database' | 'files'> & Partial<Usage>,
    now: Date,
    limits: Limits = FREE_PLAN_LIMITS,
): { state: StorageState; reports: ResourceReport[]; email: StorageEmail | null } {
    const alerts: StorageState['alerts'] = { ...prev.alerts }
    const reports: ResourceReport[] = (['database', 'files'] as Resource[]).map(resource => {
        const bytes = usage[resource]
        const limit = limits[resource]
        const level = levelOf(bytes, limit)
        const last = prev.alerts[resource]
        let due = false
        if (level === 0) {
            delete alerts[resource]
        } else if (!last || level > last.level || now.getTime() - Date.parse(last.at) >= REPEAT_DAYS * 86_400_000) {
            due = true
            alerts[resource] = { level, at: now.toISOString() }
        } else if (level < last.level) {
            // Back under 95% but still over 80%: crossing 95% again emails again.
            alerts[resource] = { level, at: last.at }
        }
        return { resource, bytes, limit, percent: percentOf(bytes, limit), level, due, ...growth(prev.readings, resource, bytes, now) }
    })

    const today = studioDate(now)
    const cutoff = now.getTime() - HISTORY_DAYS * 86_400_000
    const readings = [
        ...prev.readings.filter(r => r.date !== today && Date.parse(r.at) >= cutoff),
        { date: today, at: now.toISOString(), database: usage.database, files: usage.files },
    ]

    const due = reports.filter(r => r.due)
    const email = due.length ? renderStorageEmail(due, reports, usage, now) : null
    return { state: { readings, alerts }, reports, email }
}

function growthLine(r: ResourceReport): string {
    if (r.perDay === null || r.overDays === null) {
        return 'No growth figure yet: this is the first reading the check has.'
    }
    const grew = r.perDay * r.overDays
    const span = r.overDays === 1 ? 'the last day' : `the last ${r.overDays} days`
    if (grew <= 0) return `It did not grow over ${span}.`
    const perMonth = r.perDay * 30
    const daysLeft = (r.limit - r.bytes) / r.perDay
    const eta = daysLeft <= 0 ? '' : daysLeft < 14
        ? ` At that pace it reaches the limit in about ${Math.max(1, Math.round(daysLeft))} day${Math.round(daysLeft) === 1 ? '' : 's'}.`
        : daysLeft < 120
            ? ` At that pace it reaches the limit in about ${Math.round(daysLeft / 7)} weeks.`
            : ` At that pace it reaches the limit in about ${Math.round(daysLeft / 30)} months.`
    return `It grew ${formatSize(grew)} over ${span} (about ${formatSize(perMonth)} a month).${eta}`
}

function biggestLine(r: ResourceReport, usage: Partial<Usage>): string {
    if (r.resource === 'database') {
        const tables = (usage.tables ?? []).slice(0, 5)
        return tables.length ? `Biggest tables: ${tables.map(t => `${esc(t.name)} ${formatSize(t.bytes)}`).join(', ')}.` : ''
    }
    const buckets = (usage.buckets ?? []).slice(0, 5)
    return buckets.length
        ? `Biggest folders: ${buckets.map(b => `${esc(b.name)} ${formatSize(b.bytes)} (${b.files} file${b.files === 1 ? '' : 's'})`).join(', ')}.`
        : ''
}

const AT_LIMIT: Record<Resource, string> = {
    database: 'At the limit Supabase makes the database read-only: lessons, logs, credits and messages stop saving until it is back under.',
    files: 'At the limit Supabase stops taking uploads: lesson materials, sheet music and chat attachments would fail to upload.',
}

const TO_DO: Record<Resource, string> = {
    database: 'What to do: delete old rows nobody needs from the biggest tables above (old sign-in and webhook logs are the usual ones), '
        + 'or move the project to Supabase Pro ($25 a month, 8 GB database and 100 GB files).',
    files: 'What to do: delete files nobody uses any more from the biggest folders above (Supabase dashboard, Storage), '
        + 'or move the project to Supabase Pro ($25 a month, 100 GB files and 8 GB database).',
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderStorageEmail(due: ResourceReport[], all: ResourceReport[], usage: Partial<Usage>, now: Date): StorageEmail {
    const urgent = due.some(r => r.level === 95)
    const subject = due.length === 1
        ? `${urgent ? 'Urgent: s' : 'S'}tudio ${LABEL[due[0].resource]} is at ${due[0].percent}% of the free plan (${formatSize(due[0].bytes)} of ${formatSize(due[0].limit)})`
        : `${urgent ? 'Urgent: s' : 'S'}tudio database and file storage are both near the free plan's limits`
    const section = (r: ResourceReport) => {
        const lines = [
            `The ${LABEL[r.resource]} is <strong>${formatSize(r.bytes)}</strong> of the free plan's ${formatSize(r.limit)} (<strong>${r.percent}%</strong>).`,
            growthLine(r),
            biggestLine(r, usage),
            AT_LIMIT[r.resource],
            TO_DO[r.resource],
        ].filter(Boolean)
        return `<p style="margin:16px 0 4px"><strong>${r.resource === 'database' ? 'Database' : 'File storage'}</strong></p>`
            + `<ul style="margin:0;padding-left:20px">${lines.map(l => `<li style="margin:4px 0">${l}</li>`).join('')}</ul>`
    }
    const others = all.filter(r => !r.due)
    const html = due.map(section).join('')
        + (others.length
            ? `<p style="margin:16px 0 4px;color:#444">${others.map(r => `The ${LABEL[r.resource]} is ${formatSize(r.bytes)} of ${formatSize(r.limit)} (${r.percent}%)${r.level ? ', already emailed about' : ', fine'}.`).join(' ')}</p>`
            : '')
        + `<p style="margin:16px 0 0;color:#444">Measured ${esc(formatStudioTime(now))}.</p>`
    return { subject, html, urgent }
}

export const STORAGE_FOOTER = `Sent by the portal's daily storage check (/api/cron/storage-check). `
    + `It emails when the database or files pass ${WARN_AT * 100}% of the free plan, again at most once a week while they stay over, `
    + `and once more when either passes ${URGENT_AT * 100}%.`

/** Reads the sizes through the service-role-only SQL function. */
export async function measureUsage(client: DbClient): Promise<Usage> {
    const { data, error } = await client.rpc('studio_storage_usage')
    if (error) throw new Error(`studio_storage_usage failed: ${error.message}`)
    const d = (data ?? {}) as Record<string, any>
    const num = (v: unknown) => Number(v ?? 0) || 0
    return {
        database: num(d.database_bytes),
        files: num(d.storage_bytes),
        fileCount: num(d.storage_files),
        tables: Array.isArray(d.tables) ? d.tables.map((t: any) => ({ name: String(t.name), bytes: num(t.bytes) })) : [],
        buckets: Array.isArray(d.buckets) ? d.buckets.map((b: any) => ({ name: String(b.name), bytes: num(b.bytes), files: num(b.files) })) : [],
    }
}

async function readState(client: DbClient): Promise<StorageState> {
    const { data, error } = await client.from('cron_heartbeats').select('state').eq('job', STORAGE_JOB).maybeSingle()
    // Unreadable state would re-send last week's email: fail the run instead.
    if (error) throw new Error(`cron_heartbeats read failed: ${error.message}`)
    const s = (data?.state ?? {}) as Partial<StorageState>
    return { readings: Array.isArray(s.readings) ? s.readings : [], alerts: s.alerts ?? {} }
}

async function writeState(client: DbClient, state: StorageState, now: Date, emailed: boolean): Promise<void> {
    const row: Record<string, unknown> = { job: STORAGE_JOB, last_run_at: now.toISOString(), state }
    if (emailed) row.last_alert_at = now.toISOString()
    const { error } = await client.from('cron_heartbeats').upsert(row, { onConflict: 'job' })
    if (error) throw new Error(`cron_heartbeats write failed: ${error.message}`)
}

export type StorageCheckOptions = {
    client: DbClient
    dryRun?: boolean
    now?: Date
    limits?: Limits
    /** Instead of measuring (tests). */
    usage?: Usage
    /** Defaults to sendCronAlert to the studio inbox. Returns whether it went out. */
    sendAlert?: (email: StorageEmail) => Promise<boolean>
}

export type StorageCheckResult = {
    message: string
    usage: Usage
    reports: ResourceReport[]
    email: StorageEmail | null
    emailed: boolean
    dryRun: boolean
    state: StorageState
}

export async function runStorageCheck(opts: StorageCheckOptions): Promise<StorageCheckResult> {
    const now = opts.now ?? new Date()
    const dryRun = !!opts.dryRun
    const usage = opts.usage ?? await measureUsage(opts.client)
    const before = await readState(opts.client)
    const { state, reports, email } = decideStorageAlert(before, usage, now, opts.limits)

    let emailed = false
    let after = state
    if (email && !dryRun) {
        const send = opts.sendAlert
            ?? ((e: StorageEmail) => sendCronAlert(opts.client, { subject: e.subject, lines: [], html: e.html, footer: STORAGE_FOOTER }))
        emailed = await send(email)
        // Not sent: put back what was there before this run's stamps, so the next run tries again.
        if (!emailed) {
            const alerts = { ...state.alerts }
            for (const r of reports) {
                if (!r.due) continue
                const was = before.alerts[r.resource]
                if (was) alerts[r.resource] = was
                else delete alerts[r.resource]
            }
            after = { ...state, alerts }
        }
    }
    if (!dryRun) await writeState(opts.client, after, now, emailed)

    const sizes = reports.map(r => `${LABEL[r.resource]} ${formatSize(r.bytes)} of ${formatSize(r.limit)} (${r.percent}%)`).join(', ')
    const mail = email ? (dryRun ? `, would email "${email.subject}"` : emailed ? ', emailed the studio' : ', email failed to send') : ''
    return {
        message: `${sizes}${mail}${dryRun ? ' (dry run, nothing saved)' : ''}`,
        usage,
        reports,
        email,
        emailed,
        dryRun,
        state: after,
    }
}
