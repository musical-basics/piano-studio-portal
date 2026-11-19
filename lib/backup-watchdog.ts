import type { DbClient } from '@/lib/supabase/admin'
import { readHeartbeat, sendCronAlert, writeHeartbeat } from '@/lib/cron-alerts'
import { STUDIO_TZ, studioTzAbbr } from '@/lib/studio-timezone'

/**
 * Watchdog for the Mac's studio jobs: the nightly database backup (decision
 * #438) and, since #776, the family-message watch (same rule, own email).
 *
 * The backup runs on Lionel's Mac (scripts/backup_studio_db.py, launchd at
 * 3:30am), so a Mac that is off or asleep for days stops it without any error
 * to email. Each finished run stamps cron_heartbeats 'studio-backup'; this
 * daily check emails the studio inbox when that stamp is over 36 hours old,
 * i.e. two nights in a row were missed.
 *
 * The cooldown lives on a separate row ('backup-watchdog') because only the
 * backup itself may move the 'studio-backup' timestamp.
 */

export const BACKUP_JOB = 'studio-backup'
export const WATCHDOG_JOB = 'backup-watchdog'
export const FAMILY_WATCH_JOB = 'family-watch'
export const FAMILY_WATCH_WATCHDOG_JOB = 'family-watch-watchdog'
export const STALE_HOURS = 36

/** While the backup stays quiet: one email a day for the first week, then one a week. */
const DAILY_REPEAT_HOURS = 20
const WEEKLY_REPEAT_HOURS = 7 * 24 - 4
const WEEKLY_AFTER_HOURS = STALE_HOURS + 7 * 24

export type BackupCheck = {
    job: string
    watchdogJob: string
    /** When the job last checked in (named for the backup, the first job watched). */
    lastBackupAt: string | null
    hoursSince: number | null
    stale: boolean
    alertDue: boolean
    subject: string | null
    lines: string[]
    footer: string | null
}

/** "Tue Nov 17, 3:31am EST" in the studio's zone. */
export function formatStudioTime(at: Date): string {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: STUDIO_TZ, weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).formatToParts(at).map(p => [p.type, p.value]),
    )
    return `${parts.weekday} ${parts.month} ${parts.day}, ${parts.hour}:${parts.minute}${String(parts.dayPeriod).toLowerCase()} ${studioTzAbbr(at)}`
}

/** A Mac job that checks in through cron_heartbeats, and what to say when it goes quiet. */
type MacJob = {
    job: string
    /** Its own cooldown row: only the job itself may move `job`'s timestamp. */
    watchdogJob: string
    subject: (day: string | null) => string
    lines: (since: string) => string[]
    footer: string
}

const BACKUP: MacJob = {
    job: BACKUP_JOB,
    watchdogJob: WATCHDOG_JOB,
    subject: day => (day ? `Studio backup hasn't run since ${day}` : 'Studio backup has never checked in'),
    lines: since => [
        `The studio's nightly backup on the Mac ${since}. It normally runs every night at 3:30am.`,
        'Most likely the Mac is off, or has been asleep since then. It catches up by itself as soon as the Mac wakes.',
        'What to do: wake the Mac or turn it on. If it is already on, open Terminal and run '
        + '<code>launchctl kickstart gui/$(id -u)/com.musicalbasics.studio-backup</code>, '
        + 'then check <code>~/Backups/piano-studio/backup.log</code> for "backup ok".',
    ],
    footer: `This email comes once a day while the backup stays quiet, then once a week after the first week. `
        + `It stops by itself once a backup checks in. Sent by the portal's daily backup watchdog `
        + `(/api/cron/backup-watchdog), which alerts after ${STALE_HOURS} hours without a backup.`,
}

/**
 * The family-message watch (Lionel's #776): a launchd job on the Mac
 * (scripts/family_watch_agent.py) that queues every family message for a
 * drafted reply and checks in every 10 minutes. Same 36-hour rule as the backup.
 */
const FAMILY_WATCH: MacJob = {
    job: FAMILY_WATCH_JOB,
    watchdogJob: FAMILY_WATCH_WATCHDOG_JOB,
    subject: day => (day ? `Family message watch quiet since ${day}` : 'Family message watch has never checked in'),
    lines: since => [
        `The Mac's family message watch ${since}. It normally checks in every 10 minutes.`,
        'Families can still write and everything they send is in the portal, but new messages are not being '
        + 'queued for a drafted reply, so check the portal chat yourself until it is back.',
        'Most likely the Mac is off or asleep, or nobody has logged in since it restarted. It starts by itself at login.',
        'What to do: wake the Mac or log in. If it is already on, open Terminal and run '
        + '<code>launchctl kickstart -k gui/$(id -u)/com.musicalbasics.studio-family-watch</code>, '
        + 'then check <code>~/Library/Logs/studio-family-watch.log</code>.',
    ],
    footer: `This email comes once a day while the watch stays quiet, then once a week after the first week. `
        + `It stops by itself once the watch checks in. Sent by the portal's daily watchdog `
        + `(/api/cron/backup-watchdog), which alerts after ${STALE_HOURS} hours without a check-in.`,
}

async function checkMacJob(client: DbClient, spec: MacJob, now: Date): Promise<BackupCheck> {
    const beat = await readHeartbeat(client, spec.job)
    // An unreadable table would look exactly like a dead job: fail loudly
    // in the route's logs instead of emailing a false alarm.
    if (!beat.available) throw new Error('cron_heartbeats could not be read')

    const hoursSince = beat.lastRunAt ? (now.getTime() - beat.lastRunAt.getTime()) / 3_600_000 : null
    const stale = hoursSince === null || hoursSince > STALE_HOURS
    const base = {
        job: spec.job,
        watchdogJob: spec.watchdogJob,
        lastBackupAt: beat.lastRunAt ? beat.lastRunAt.toISOString() : null,
        hoursSince: hoursSince === null ? null : Math.round(hoursSince * 10) / 10,
        stale,
    }
    if (!stale) return { ...base, alertDue: false, subject: null, lines: [], footer: null }

    const { lastAlertAt } = await readHeartbeat(client, spec.watchdogJob)
    const repeatHours = hoursSince !== null && hoursSince > WEEKLY_AFTER_HOURS ? WEEKLY_REPEAT_HOURS : DAILY_REPEAT_HOURS
    const alertDue = !lastAlertAt || (now.getTime() - lastAlertAt.getTime()) / 3_600_000 >= repeatHours

    const since = beat.lastRunAt
        ? `hasn't checked in since ${formatStudioTime(beat.lastRunAt)} (${Math.round(hoursSince!)} hours ago)`
        : 'has never checked in'
    const day = beat.lastRunAt ? formatStudioTime(beat.lastRunAt).split(',')[0] : null
    return { ...base, alertDue, subject: spec.subject(day), lines: spec.lines(since), footer: spec.footer }
}

export async function checkBackup(client: DbClient, now: Date = new Date()): Promise<BackupCheck> {
    return checkMacJob(client, BACKUP, now)
}

export async function checkFamilyWatch(client: DbClient, now: Date = new Date()): Promise<BackupCheck> {
    return checkMacJob(client, FAMILY_WATCH, now)
}

/** Emails the studio inbox when the job is stale and the cooldown allows. Returns whether it emailed. */
export async function alertIfBackupStale(client: DbClient, check: BackupCheck): Promise<boolean> {
    let emailed = false
    if (check.alertDue && check.subject) {
        emailed = await sendCronAlert(client, { subject: check.subject, lines: check.lines, footer: check.footer ?? '' })
    }
    await writeHeartbeat(client, check.watchdogJob, { alerted: emailed })
    return emailed
}
