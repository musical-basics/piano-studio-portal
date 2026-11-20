import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { formatStudioTime } from '@/lib/backup-watchdog'
import { isoToStudioWallClock } from '@/lib/studio-timezone'
import { measureEmailQuota, type EmailQuota } from '@/lib/email-quota'
import { measureR2, PRACTICE_BUCKET, R2_FREE_BYTES, R2_PRICE_PER_GB_MONTH, r2Configured, RECORDINGS_BUCKET, type R2Usage } from '@/lib/classroom-r2'

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
 * Since #1072 it also measures Cloudflare R2, where the classroom keeps its
 * lesson videos and families' practice videos sit: those two studio buckets
 * together against the free 10 GB, with the same 80% email. Other projects
 * share the Cloudflare account; their buckets are never alerted on, only the
 * whole account's total is mentioned as one line of information. Past 10 GB
 * nothing stops, it just costs $0.015 per GB a month, so an R2 email is never
 * marked urgent. If R2 cannot be measured the run still checks Supabase.
 *
 * Since #1073 it also checks the emails the portal sends through Resend
 * against the plan's monthly limit (and the daily one, on the free plan),
 * read from Resend's own usage headers (lib/email-quota.ts), with the same 80%
 * email and a repeat at 95%: past the limit Resend stops sending, reminders
 * included. If it cannot be read the run still checks the rest.
 *
 * State lives on the job's cron_heartbeats row (`state`): one reading a day for
 * the last five weeks (for the growth figure) and the last email per resource.
 */

export const STORAGE_JOB = 'storage-check'

const MB = 1024 * 1024

/** Supabase free plan (1 MB = 1024 * 1024, as Supabase counts) and R2's free 10 GB (10^9 bytes a GB). */
export const FREE_PLAN_LIMITS: Limits = { database: 500 * MB, files: 1024 * MB, r2: R2_FREE_BYTES }
export const WARN_AT = 0.8
export const URGENT_AT = 0.95
export const REPEAT_DAYS = 7
const HISTORY_DAYS = 35

export type Resource = 'database' | 'files' | 'r2' | 'emails' | 'emailsDay'
/** Storage limits are fixed; the email limits come with the reading (EmailQuota) unless set here (dry-run tests). */
export type Limits = Record<'database' | 'files' | 'r2', number> & { emails?: number; emailsDay?: number }
export type Level = 0 | 80 | 95

export type Usage = {
    database: number
    files: number
    fileCount: number
    tables: { name: string; bytes: number }[]
    buckets: { name: string; bytes: number; files: number }[]
    /** Cloudflare R2, every bucket on the account; null when it could not be measured (or is not set up). */
    r2?: R2Usage | null
    r2Error?: string
    /** Resend: emails used this billing month (and today on the free plan); null when it could not be read. */
    emails?: EmailQuota | null
    emailsError?: string
}

export type Reading = { date: string; at: string; database: number; files: number; r2?: number; emails?: number }

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
    /** Bytes (emails, for the email resources) per day since the oldest earlier reading, null without one. */
    perDay: number | null
    /** How many days that growth figure spans. */
    overDays: number | null
    /** This run emails about it. */
    due: boolean
}

export type StorageEmail = { subject: string; html: string; urgent: boolean }

const LABEL: Record<Resource, string> = {
    database: 'database', files: 'file storage', r2: 'classroom and practice video storage (Cloudflare R2)',
    emails: 'emails this month', emailsDay: 'emails today',
}
const TITLE: Record<Resource, string> = {
    database: 'Database', files: 'File storage', r2: 'Cloudflare R2 (classroom and practice videos)',
    emails: 'Emails sent through Resend this month', emailsDay: 'Emails sent through Resend today',
}
const isEmail = (resource: Resource) => resource === 'emails' || resource === 'emailsDay'

/** Supabase sizes count 1 MB = 1024 * 1024 bytes; Cloudflare counts 1 GB = 10^9 bytes. */
export function formatSize(bytes: number, unit: 'binary' | 'decimal' = 'binary'): string {
    const k = unit === 'decimal' ? 1000 : 1024
    const mb = bytes / (k * k)
    if (mb >= k) return `${(mb / k).toFixed(2).replace(/\.?0+$/, '')} GB`
    if (mb >= 10) return `${Math.round(mb)} MB`
    return `${mb.toFixed(1).replace(/\.0$/, '')} MB`
}

function sizeOf(resource: Resource, bytes: number): string {
    if (isEmail(resource)) return `${Math.round(bytes).toLocaleString('en-US')} email${bytes === 1 ? '' : 's'}`
    return formatSize(bytes, resource === 'r2' ? 'decimal' : 'binary')
}

/** "79 of 50,000 emails", "176 MB of 1 GB". */
function amountOf(r: Pick<ResourceReport, 'resource' | 'bytes' | 'limit'>): string {
    return isEmail(r.resource)
        ? `${Math.round(r.bytes).toLocaleString('en-US')} of ${sizeOf(r.resource, r.limit)}`
        : `${sizeOf(r.resource, r.bytes)} of ${sizeOf(r.resource, r.limit)}`
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
    // Today's count starts from zero each day: no growth figure.
    if (resource === 'emailsDay') return { perDay: null, overDays: null }
    const key = resource as 'database' | 'files' | 'r2' | 'emails'
    const today = studioDate(now)
    let earlier = readings.filter(r => r.date < today && typeof r[key] === 'number')
    if (resource === 'emails') {
        // The count restarts each billing month: only the readings since the last restart.
        for (let i = earlier.length - 1; i > 0; i--) {
            if ((earlier[i].emails as number) < (earlier[i - 1].emails as number)) {
                earlier = earlier.slice(i)
                break
            }
        }
        if (earlier.length && bytes < (earlier[earlier.length - 1].emails as number)) earlier = []
    }
    if (!earlier.length) return { perDay: null, overDays: null }
    const oldest = earlier[0]
    const days = (now.getTime() - Date.parse(oldest.at)) / 86_400_000
    if (days < 0.5) return { perDay: null, overDays: null }
    return { perDay: (bytes - (oldest[key] as number)) / days, overDays: Math.round(days) }
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
    // R2 and the emails only when they were measured; a failed measurement leaves their alert state alone.
    const measured: Resource[] = ['database', 'files']
    if (usage.r2) measured.push('r2')
    if (usage.emails) measured.push('emails')
    if (usage.emails && usage.emails.day != null && usage.emails.dayLimit) measured.push('emailsDay')
    const bytesOf = (resource: Resource): number => {
        if (resource === 'r2') return usage.r2!.bytes
        if (resource === 'emails') return usage.emails!.month
        if (resource === 'emailsDay') return usage.emails!.day ?? 0
        return usage[resource]
    }
    const limitOf = (resource: Resource): number => {
        if (resource === 'emails') return limits.emails ?? usage.emails!.monthLimit
        if (resource === 'emailsDay') return limits.emailsDay ?? usage.emails!.dayLimit ?? 0
        return limits[resource]
    }
    const reports: ResourceReport[] = measured.map(resource => {
        const bytes = bytesOf(resource)
        const limit = limitOf(resource)
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
        {
            date: today, at: now.toISOString(), database: usage.database, files: usage.files,
            ...(usage.r2 ? { r2: usage.r2.bytes } : {}),
            ...(usage.emails ? { emails: usage.emails.month } : {}),
        },
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
    if (isEmail(r.resource)) {
        if (grew <= 0) return `None went out over ${span}.`
        const left = (r.limit - r.bytes) / r.perDay
        const days = Math.max(1, Math.round(left))
        const eta = left > 0 && left < 45
            ? ` At that pace the limit is reached in about ${days} day${days === 1 ? '' : 's'}, unless the billing month restarts first.`
            : ''
        return `About ${Math.round(r.perDay).toLocaleString('en-US')} a day went out over ${span}.${eta}`
    }
    if (grew <= 0) return `It did not grow over ${span}.`
    const perMonth = r.perDay * 30
    const daysLeft = (r.limit - r.bytes) / r.perDay
    const eta = daysLeft <= 0 ? '' : daysLeft < 14
        ? ` At that pace it reaches the limit in about ${Math.max(1, Math.round(daysLeft))} day${Math.round(daysLeft) === 1 ? '' : 's'}.`
        : daysLeft < 120
            ? ` At that pace it reaches the limit in about ${Math.round(daysLeft / 7)} weeks.`
            : ` At that pace it reaches the limit in about ${Math.round(daysLeft / 30)} months.`
    return `It grew ${sizeOf(r.resource, grew)} over ${span} (about ${sizeOf(r.resource, perMonth)} a month).${eta}`
}

function biggestLine(r: ResourceReport, usage: Partial<Usage>): string {
    if (r.resource === 'r2') {
        const buckets = (usage.r2?.buckets ?? []).filter(b => b.bytes > 0).slice(0, 6)
        return buckets.length
            ? `By bucket: ${buckets.map(b => `${esc(b.name)}${b.name === RECORDINGS_BUCKET ? ' (classroom videos)' : b.name === PRACTICE_BUCKET ? ' (practice videos)' : ''} ${formatSize(b.bytes, 'decimal')} (${b.files} file${b.files === 1 ? '' : 's'})`).join(', ')}.`
            : ''
    }
    if (isEmail(r.resource)) return ''
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
    r2: `Past ${formatSize(R2_FREE_BYTES, 'decimal')} nothing stops working: Cloudflare charges $${R2_PRICE_PER_GB_MONTH} per GB a month over it.`,
    emails: 'At the limit Resend stops sending until the next billing month (unless extra emails are turned on in its billing settings): '
        + 'lesson reminders, lesson notes, chat notifications and these alerts would all stop.',
    emailsDay: 'At the limit Resend stops sending until midnight UTC: lesson reminders, lesson notes, chat notifications and these alerts would all stop.',
}

const TO_DO: Record<Resource, string> = {
    database: 'What to do: delete old rows nobody needs from the biggest tables above (old sign-in and webhook logs are the usual ones), '
        + 'or move the project to Supabase Pro ($25 a month, 8 GB database and 100 GB files).',
    files: 'What to do: delete files nobody uses any more from the biggest folders above (Supabase dashboard, Storage), '
        + 'or move the project to Supabase Pro ($25 a month, 100 GB files and 8 GB database).',
    r2: 'What to do: classroom videos older than 60 days already move to their Dropbox copy every day on their own. '
        + 'To bring it down further, delete test and no-show recordings (admin, Classroom recordings) or old practice videos, '
        + 'or let it be and pay the cents above.',
    emails: 'What to do: move to a bigger Resend plan, or turn on extra emails, before it runs out (resend.com, Settings, Billing). '
        + 'Every site that sends through the same Resend account counts toward it, and so do emails it receives (chat replies).',
    emailsDay: 'What to do: move to a paid Resend plan (resend.com, Settings, Billing): paid plans have no daily limit.',
}

/** The email limit was assumed from the plan, not set: say so, and how to set it. */
function emailLimitLine(r: ResourceReport, usage: Partial<Usage>): string {
    if (r.resource !== 'emails' || usage.emails?.limitFrom !== 'plan') return ''
    return usage.emails.plan === 'free'
        ? "The limit is the free plan's 3,000 a month."
        : `${Math.round(r.limit).toLocaleString('en-US')} a month is Resend Pro's limit, assumed: if the plan is different, set RESEND_MONTHLY_LIMIT in Vercel.`
}

/** One line of information: the whole Cloudflare account, other projects included (never alerted on). */
function accountLine(usage: Partial<Usage>): string {
    const a = usage.r2?.account
    if (!a) return ''
    return `For information: the whole Cloudflare account holds ${formatSize(a.bytes, 'decimal')} in ${a.buckets} bucket${a.buckets === 1 ? '' : 's'}, `
        + 'other projects included. This check counts only the studio\'s classroom and practice video buckets.'
}

/** What R2 over its free 10 GB costs a month at this size. */
function r2CostLine(r: ResourceReport): string {
    if (r.resource !== 'r2' || r.bytes <= r.limit) return ''
    const overGb = Math.ceil((r.bytes - r.limit) / 1e9)
    return `At this size it costs about $${(overGb * R2_PRICE_PER_GB_MONTH).toFixed(2)} a month (${overGb} GB over the free ${formatSize(r.limit, 'decimal')}).`
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderStorageEmail(due: ResourceReport[], all: ResourceReport[], usage: Partial<Usage>, now: Date): StorageEmail {
    // Only Supabase stops working at its limit; R2 just costs a little more.
    const urgent = due.some(r => r.level === 95 && r.resource !== 'r2')
    const plan = (r: ResourceReport) => (r.resource === 'r2' ? 'the free' : "the free plan's")
    const subject = due.length === 1 && isEmail(due[0].resource)
        ? `${urgent ? 'Urgent: s' : 'S'}tudio emails are at ${due[0].percent}% of ${due[0].resource === 'emails' ? "this month's" : "today's"} Resend limit (${amountOf(due[0])})`
        : due.length === 1
        ? `${urgent ? 'Urgent: s' : 'S'}tudio ${LABEL[due[0].resource]} is at ${due[0].percent}% of ${due[0].resource === 'r2' ? `the free ${sizeOf('r2', due[0].limit)}` : 'the free plan'} (${sizeOf(due[0].resource, due[0].bytes)} of ${sizeOf(due[0].resource, due[0].limit)})`
        : due.length === 2 && due.every(r => r.resource !== 'r2')
            ? `${urgent ? 'Urgent: s' : 'S'}tudio database and file storage are both near the free plan's limits`
            : `${urgent ? 'Urgent: s' : 'S'}tudio ${due.map(r => LABEL[r.resource]).join(' and ')} are near their ${due.some(r => isEmail(r.resource)) ? '' : 'free '}limits`
    const section = (r: ResourceReport) => {
        const first = r.resource === 'emails'
            ? `<strong>${sizeOf(r.resource, r.bytes)}</strong> went out this billing month, of the Resend plan's ${Math.round(r.limit).toLocaleString('en-US')} (<strong>${r.percent}%</strong>).`
            : r.resource === 'emailsDay'
                ? `<strong>${sizeOf(r.resource, r.bytes)}</strong> went out today (the UTC day), of the free plan's ${Math.round(r.limit).toLocaleString('en-US')} a day (<strong>${r.percent}%</strong>).`
                : `The ${LABEL[r.resource]} is <strong>${sizeOf(r.resource, r.bytes)}</strong> of ${plan(r)} ${sizeOf(r.resource, r.limit)} (<strong>${r.percent}%</strong>).`
        const lines = [
            first,
            emailLimitLine(r, usage),
            growthLine(r),
            r2CostLine(r),
            biggestLine(r, usage),
            AT_LIMIT[r.resource],
            TO_DO[r.resource],
        ].filter(Boolean)
        return `<p style="margin:16px 0 4px"><strong>${TITLE[r.resource]}</strong></p>`
            + `<ul style="margin:0;padding-left:20px">${lines.map(l => `<li style="margin:4px 0">${l}</li>`).join('')}</ul>`
    }
    const others = all.filter(r => !r.due)
    const html = due.map(section).join('')
        + (others.length
            ? `<p style="margin:16px 0 4px;color:#444">${others.map(r => `${isEmail(r.resource) ? `${LABEL[r.resource].charAt(0).toUpperCase()}${LABEL[r.resource].slice(1)}:` : `The ${LABEL[r.resource]} is`} ${amountOf(r)} (${r.percent}%)${r.level ? ', already emailed about' : ', fine'}.`).join(' ')}</p>`
            : '')
        + (usage.r2Error ? `<p style="margin:16px 0 4px;color:#444">Cloudflare R2 could not be measured today: ${esc(usage.r2Error)}</p>` : '')
        + (usage.emailsError ? `<p style="margin:16px 0 4px;color:#444">The Resend email usage could not be read today: ${esc(usage.emailsError)}</p>` : '')
        + (accountLine(usage) ? `<p style="margin:16px 0 4px;color:#444">${accountLine(usage)}</p>` : '')
        + `<p style="margin:16px 0 0;color:#444">Measured ${esc(formatStudioTime(now))}.</p>`
    return { subject, html, urgent }
}

export const STORAGE_FOOTER = `Sent by the portal's daily storage check (/api/cron/storage-check). `
    + `It emails when the database, files or the studio's Cloudflare R2 video buckets pass ${WARN_AT * 100}% of their free limit, `
    + `or the emails sent through Resend pass ${WARN_AT * 100}% of the plan's monthly limit, again at most once a week while they stay over, `
    + `and once more when one passes ${URGENT_AT * 100}%.`

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
    /** Measures R2 (default: every bucket on the account, when the R2 key is set). Tests pass a fake. */
    measureR2?: () => Promise<R2Usage | null>
    /** Reads the Resend usage (default: lib/email-quota.ts, one probe send). Tests pass a fake. */
    measureEmails?: () => Promise<EmailQuota | null>
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
    if (!opts.usage || opts.measureR2) {
        try {
            usage.r2 = await (opts.measureR2 ?? (() => (r2Configured() ? measureR2() : Promise.resolve(null))))()
        } catch (err) {
            usage.r2 = null
            usage.r2Error = err instanceof Error ? err.message : String(err)
        }
    }
    if (!opts.usage || opts.measureEmails) {
        try {
            usage.emails = await (opts.measureEmails ?? (() => measureEmailQuota()))()
        } catch (err) {
            usage.emails = null
            usage.emailsError = err instanceof Error ? err.message : String(err)
        }
    }
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

    const sizes = reports.map(r => `${LABEL[r.resource]} ${amountOf(r)} (${r.percent}%)`
        + (r.resource === 'r2' && usage.r2?.account ? ` (whole Cloudflare account ${formatSize(usage.r2.account.bytes, 'decimal')}, other projects included, not checked)` : '')).join(', ')
        + (usage.r2Error ? `, R2 not measured (${usage.r2Error})` : '')
        + (usage.emailsError ? `, emails not measured (${usage.emailsError})` : '')
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
