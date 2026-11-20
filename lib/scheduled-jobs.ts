import type { DbClient } from '@/lib/supabase/admin'
import { STUDIO_TZ, studioTzAbbr } from '@/lib/studio-timezone'
import vercelConfig from '@/vercel.json'

/**
 * Every scheduled job, in plain words, for the admin jobs page (Lionel's #777).
 *
 * The portal's jobs are the crons in vercel.json; each route records its runs
 * on the cron_heartbeats row named after it (withCronRun, lib/cron-runs.ts).
 * The Mac's jobs check in on cron_heartbeats too. This file names them, says
 * what each does, turns the cron schedules (UTC) into Eastern words, and works
 * out a status per job: worked, failed, late (no run within about twice its
 * interval) or never recorded.
 *
 * Adding a cron to vercel.json? Add it to PORTAL_JOBS below and wrap its route
 * in withCronRun; scripts/check_scheduled_jobs.ts fails until both are done.
 */

type Body = any

export type JobGroup = 'lessons' | 'recordings' | 'payments' | 'watch' | 'mac'

export const GROUP_TITLES: Record<JobGroup, string> = {
    lessons: 'Lessons and emails',
    recordings: 'Recordings',
    payments: 'Payments',
    watch: 'Keeping watch',
    mac: 'On the Mac',
}

export type JobInfo = {
    /** The cron_heartbeats row; for portal jobs, the route's last path segment. */
    job: string
    name: string
    what: string
    group: JobGroup
    /** Mac jobs only (portal jobs take theirs from vercel.json). */
    schedule?: string
    intervalMinutes?: number
    /** Defaults to twice the interval plus 10 minutes. */
    lateAfterMinutes?: number
    /** One line from a successful run's JSON answer, e.g. "3 reminders sent". */
    summarize?: (body: Body) => string | undefined
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const len = (v: unknown) => (Array.isArray(v) ? v.length : Number(v) || 0)

export const PORTAL_JOBS: JobInfo[] = [
    {
        job: 'reminders',
        name: 'Lesson reminders',
        what: 'Sends families their lesson reminders (2 days, 1 day, 12 hours and 15 minutes before) and emails you if any fail.',
        group: 'lessons',
        summarize: b => {
            const sent = Object.values((b?.stats ?? {}) as Record<string, number>).reduce((a, n) => a + (Number(n) || 0), 0)
            const parts = [sent ? `${plural(sent, 'reminder')} sent` : 'No reminders due']
            if (b?.failed) parts.push(`${b.failed} failed to send`)
            if (b?.unnotified) parts.push(`${plural(b.unnotified, 'lesson')} started with no reminder`)
            return parts.join(', ')
        },
    },
    {
        job: 'auto-schedule-lessons',
        name: 'Book standing lessons',
        what: "Books each student's standing weekly lessons for the coming week, and checks the reminders are still running.",
        group: 'lessons',
        summarize: b => [
            b?.scheduled ? `${plural(b.scheduled, 'lesson')} booked` : 'Nothing new to book',
            b?.errors ? `${plural(b.errors, 'problem')}` : '',
        ].filter(Boolean).join(', '),
    },
    {
        job: 'evening-preview',
        name: 'Evening email',
        what: "Emails you tomorrow's lessons (with each student's last homework) and the family messages still waiting for a reply, the evening before a lesson day.",
        group: 'lessons',
        summarize: b => !b?.wouldEmail
            ? 'No lessons tomorrow, so no email'
            : `${b.emailed ? 'Emailed you' : 'Email did not send'} (${plural(len(b.lessons), 'lesson')}, ${len(b.waiting)} waiting)`,
    },
    {
        job: 'unlogged-tonight',
        name: 'Unlogged lessons, tonight',
        what: "Emails you today's lessons that are still not logged, at 11pm, so you can log them while they're fresh.",
        group: 'lessons',
        summarize: b => len(b?.unlogged) ? `${plural(len(b.unlogged), 'lesson')} unlogged${b.emailed ? ', emailed you' : ''}` : 'Nothing unlogged',
    },
    {
        job: 'unlogged-lessons',
        name: 'Unlogged lessons, morning',
        what: "Emails you today's lessons and yesterday's lessons that nobody logged (no credit was taken for them).",
        group: 'lessons',
        summarize: b => {
            const today = len(b?.today?.lessons)
            const todayPart = today ? `, ${plural(today, 'lesson')} today` : ''
            const short = len(b?.ranShort)
            return `${len(b?.unlogged) ? `${plural(len(b.unlogged), 'lesson')} unlogged` : 'Nothing unlogged'}${short ? `, ${short} ran short` : ''}${todayPart}${b?.emailed ? ', emailed you' : ''}`
        },
    },
    {
        job: 'calendar-sync',
        name: 'Calendar check',
        what: "Compares the next 14 days of lessons with your Google Calendar and fixes missing events, wrong times and events left behind for removed lessons, then emails you what it fixed. Only ever changes events the portal made.",
        group: 'lessons',
        summarize: b => {
            const c = b?.counts ?? {}
            const fixed = (Number(c.created) || 0) + (Number(c.linked) || 0) + (Number(c.retimed) || 0) + (Number(c.deleted) || 0)
            const checked = Number(b?.checked) || 0
            const parts = [fixed ? `${plural(fixed, 'event')} fixed` : checked ? `${checked === 1 ? 'The 1 lesson' : `All ${checked} lessons`} matched` : 'No lessons in the next 14 days']
            if (c.errors) parts.push(`${plural(c.errors, 'problem')}`)
            if (c.leftAlone) parts.push(`${c.leftAlone} left alone to check`)
            if (b?.emailed) parts.push('emailed you')
            return parts.join(', ')
        },
    },
    {
        job: 'weekly-summary',
        name: 'Weekly summary',
        what: "Emails you last week's lessons, videos and credits, and families down to 0 lessons.",
        group: 'lessons',
        summarize: b => (b?.emailed ? 'Emailed you' : 'Not emailed'),
    },
    {
        job: 'weekly-digest',
        name: 'Weekly reminder check',
        what: "Emails you how many of last week's lessons got their reminders, which also proves alert emails still arrive.",
        group: 'lessons',
        summarize: b => `${plural(len(b?.total), 'lesson')} checked${b?.unnotified ? `, ${b.unnotified} with no reminder` : ''}${b?.emailed ? ', emailed you' : ''}`,
    },
    {
        job: 'credit-check',
        name: 'Monthly credit check',
        what: "Checks last month's logged lessons took the right credits and that Stripe payments match the lessons added, then emails you anything to look at.",
        group: 'lessons',
        summarize: b => {
            const toLook = len(b?.findings) + len(b?.payments?.findings)
            return `${plural(len(b?.lessonsChecked), 'lesson')} checked, ${toLook ? `${toLook} to look at` : 'all matched'}${b?.emailed ? ', emailed you' : ''}`
        },
    },
    {
        job: 'monthly-statements',
        name: 'Monthly family statements',
        what: "On the 1st, emails each active family a short summary of last month: lessons held, lessons left, and the next payment date if they're on a plan. Never twice in a month.",
        group: 'lessons',
        summarize: b => {
            if (b?.off) return 'Off (MONTHLY_STATEMENTS=off), nothing sent'
            const sent = Number(b?.sent) || 0
            const parts = [sent ? `${plural(sent, 'family', 'families')} emailed` : 'No statements sent']
            if (b?.alreadySent) parts.push(`${b.alreadySent} already had theirs`)
            if (b?.failed) parts.push(`${b.failed} failed`)
            return parts.join(', ')
        },
    },
    {
        job: 'new-recordings',
        name: 'New recording emails',
        what: "Emails a family when a new lesson recording appears in their Dropbox folder.",
        group: 'recordings',
        summarize: b => {
            const n = len(b?.stats?.notified ?? b?.notified)
            const errors = len(b?.stats?.errors)
            return `${n ? `${plural(n, 'family', 'families')} told` : 'No new recordings'}${errors ? `, ${plural(errors, 'problem')}` : ''}`
        },
    },
    {
        job: 'organize-recordings',
        name: 'File Zoom recordings',
        what: "Moves new Zoom recordings into each student's Dropbox folder and attaches them to the lesson.",
        group: 'recordings',
        summarize: b => {
            const moved = len(b?.result?.moved)
            const errors = len(b?.result?.errors)
            return `${moved ? `${plural(moved, 'recording')} filed` : 'Nothing new'}${errors ? `, ${plural(errors, 'problem')}` : ''}`
        },
    },
    {
        job: 'backfill-recordings',
        name: 'Catch missed Zoom recordings',
        what: "Saves who joined each Zoom lesson once it's over (Zoom only keeps that about a year), then looks for recent Zoom lessons with no video and pulls in any recording the instant hand-off missed.",
        group: 'recordings',
        summarize: b => {
            const got = len(b?.result?.recovered)
            const errors = len(b?.result?.errors)
            const attendance = len(b?.attendance?.saved)
            return [
                got ? `${plural(got, 'recording')} recovered` : 'Nothing missing',
                errors ? plural(errors, 'problem') : '',
                attendance ? `attendance saved for ${plural(attendance, 'lesson')}` : '',
                b?.attendance?.error ? `attendance failed: ${b.attendance.error}` : '',
            ].filter(Boolean).join(', ')
        },
    },
    {
        job: 'classroom-recordings',
        name: 'Classroom recordings',
        what: 'Attaches classroom recordings to their lessons, logs the lesson when the video is 20+ minutes, and copies them to Dropbox.',
        group: 'recordings',
        summarize: b => [
            len(b?.result?.attached) ? `${plural(len(b.result.attached), 'recording')} attached` : 'Nothing new',
            len(b?.result?.logged) ? `${plural(len(b.result.logged), 'lesson')} logged` : '',
            b?.dropbox?.error ? `Dropbox copies failed: ${b.dropbox.error}` : '',
        ].filter(Boolean).join(', '),
    },
    {
        job: 'classroom-r2-move',
        name: 'Old classroom videos to Dropbox',
        what: "Moves classroom videos older than 60 days from Cloudflare R2 (10 GB free) to their copy in the student's Dropbox folder, once the copy is checked to be complete.",
        group: 'recordings',
        summarize: b => [
            len(b?.moved) ? `${plural(len(b.moved), 'video')} moved (${(Number(b.movedBytes || 0) / 1e9).toFixed(2)} GB)` : 'Nothing to move',
            len(b?.queued) ? `${plural(len(b.queued), 'copy', 'copies')} queued` : '',
            len(b?.problems) ? plural(len(b.problems), 'problem') : '',
        ].filter(Boolean).join(', '),
    },
    {
        job: 'classroom-library-check',
        name: 'Classroom videos missing from the library',
        what: 'Compares classroom storage with the recordings library each week, adds any lesson-length video that never reached it and puts it on its lesson when that lesson has no video (never logs). Emails you only when it finds one.',
        group: 'recordings',
        summarize: b => [
            len(b?.added) ? `${plural(len(b.added), 'video')} added to the library` : 'Library complete',
            len(b?.missingFiles) ? `${plural(len(b.missingFiles), 'file')} gone from R2` : '',
        ].filter(Boolean).join(', '),
    },
    {
        job: 'capture-payments',
        name: 'Collect held card payments',
        what: 'Collects card payments that are only on hold, 3 days after checkout, before the hold expires.',
        group: 'payments',
        summarize: b => [
            b?.captured ? `${plural(b.captured, 'payment')} collected` : (b?.held ? `${plural(b.held, 'payment')} on hold, not due yet` : 'Nothing on hold'),
            b?.failed ? `${b.failed} failed` : '',
        ].filter(Boolean).join(', '),
    },
    {
        job: 'plan-payment-check',
        name: 'Plan payment watch',
        what: "Reads Stripe's plan payments every hour and emails you the same day a family's plan payment is first declined, and once more if Stripe ends the plan unpaid.",
        group: 'payments',
        summarize: b => [
            `${plural(Number(b?.events) || 0, 'payment event')} checked`,
            b?.emailed ? `emailed you about ${plural(b.emailed, 'plan')}` : '',
            b?.emailFailed ? `${b.emailFailed} email failed, will retry` : '',
        ].filter(Boolean).join(', '),
    },
    {
        job: 'classroom-server-watch',
        name: 'Classroom server check',
        what: "Checks the classroom's own call server is answering and emails you if it stops. Off until the classroom moves to it.",
        group: 'watch',
        summarize: b => (b?.configured === false ? "Off until the classroom moves to the studio's own server" : b?.message),
    },
    {
        job: 'backup-watchdog',
        name: 'Backup check',
        what: "Emails you if the Mac's nightly backup or family message watcher hasn't checked in for 36 hours.",
        group: 'watch',
        summarize: b => {
            const parts = [b?.stale
                ? `Backup is late${b.emailed ? ', emailed you' : ''}`
                : b?.hoursSince != null ? `Backup fresh (${plural(Math.round(b.hoursSince), 'hour')} old)` : 'No backup yet']
            if (b?.familyWatch?.stale) parts.push(`family message watcher is late${b.familyWatch.emailed ? ', emailed you' : ''}`)
            return parts.join(', ')
        },
    },
    {
        job: 'storage-check',
        name: 'Storage check',
        what: "Emails you when the database or files pass 80% of Supabase's free plan (500 MB and 1 GB), or Cloudflare R2 (classroom videos) passes 80% of its free 10 GB.",
        group: 'watch',
        summarize: b => (typeof b?.message === 'string' ? b.message.charAt(0).toUpperCase() + b.message.slice(1) : undefined),
    },
]

export const MAC_JOBS: JobInfo[] = [
    {
        job: 'studio-backup',
        name: 'Nightly backup',
        what: 'Copies the whole studio database to the Mac and to Dropbox. Runs when the Mac is awake.',
        group: 'mac',
        schedule: 'Nightly 3:30am',
        intervalMinutes: 24 * 60,
    },
    {
        job: 'studio-restore-test',
        name: 'Monthly restore test',
        what: 'Loads the newest backup into a throwaway database and compares it with the live one, to prove the backup really works.',
        group: 'mac',
        schedule: '1st of the month, 4:30am',
        intervalMinutes: 31 * 24 * 60,
    },
    {
        job: 'lesson-transcripts',
        name: 'Lesson transcripts',
        what: 'Writes a text transcript of each lesson recording, saved next to the video in Dropbox, so you can search what was said (Recordings tab). Newest first, 1:30 to 6am, when the Mac is awake.',
        group: 'mac',
        schedule: 'Nightly 1:30am',
        intervalMinutes: 24 * 60,
    },
    {
        job: 'family-watch',
        name: 'Family message watcher',
        what: 'Watches for new family messages so a reply gets drafted for your OK.',
        group: 'mac',
        schedule: 'Every 10 minutes',
        intervalMinutes: 10,
        lateAfterMinutes: 30,
    },
]

const BY_JOB = new Map(PORTAL_JOBS.map(j => [j.job, j]))

/** The cron_heartbeats row a vercel.json path records to. */
export function jobForPath(path: string): string {
    return path.replace(/\/+$/, '').split('/').pop() || path
}

/** One line for a successful run's answer. Never throws. */
export function summarizeJobRun(job: string, body: Body): string | null {
    try {
        return BY_JOB.get(job)?.summarize?.(body)?.slice(0, 300) || null
    } catch {
        return null
    }
}

// ----------------------------------------------------------- schedules ---

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

function ordinal(n: number): string {
    const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
    return `${n}${s}`
}

/** Eastern wall-clock parts of an instant. */
function eastern(at: Date) {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: STUDIO_TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).formatToParts(at).map(x => [x.type, x.value]),
    )
    const time = `${p.hour}${p.minute === '00' ? '' : `:${p.minute}`}${String(p.dayPeriod).toLowerCase()} ${studioTzAbbr(at)}`
    return { time, weekday: String(p.weekday), day: Number(p.day), month: Number(p.month) }
}

const isNum = (s: string) => /^\d+$/.test(s)

/**
 * A vercel.json schedule (UTC) in Eastern words, for the season `now` is in,
 * and the minutes between runs. Handles the shapes vercel.json uses; anything
 * else comes back as the raw expression, run daily.
 */
export function describeCron(expr: string, now: Date = new Date()): { words: string; intervalMinutes: number } {
    const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/)
    if (mon !== '*') return { words: expr, intervalMinutes: 24 * 60 }

    if (hour === '*' && dom === '*' && dow === '*') {
        const every = /^\*\/(\d+)$/.exec(min)
        if (every) return { words: `Every ${every[1]} minutes`, intervalMinutes: Number(every[1]) }
        const minutes = min.split(',')
        if (minutes.every(isNum)) {
            const n = 60 / minutes.length
            return { words: minutes.length === 1 ? 'Every hour' : `Every ${Math.round(n)} minutes`, intervalMinutes: n }
        }
        return { words: expr, intervalMinutes: 60 }
    }

    if (!isNum(min) || !isNum(hour)) return { words: expr, intervalMinutes: 24 * 60 }
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth()

    if (dom === '*' && dow === '*') {
        const at = new Date(Date.UTC(y, m, now.getUTCDate(), Number(hour), Number(min)))
        return { words: `Daily ${eastern(at).time}`, intervalMinutes: 24 * 60 }
    }
    if (dom === '*' && isNum(dow)) {
        const shift = (Number(dow) - now.getUTCDay() + 7) % 7
        const at = new Date(Date.UTC(y, m, now.getUTCDate() + shift, Number(hour), Number(min)))
        const e = eastern(at)
        return { words: `${e.weekday}s ${e.time}`, intervalMinutes: 7 * 24 * 60 }
    }
    if (isNum(dom) && dow === '*') {
        // The next run, so the time zone label is the one it will run in.
        let at = new Date(Date.UTC(y, m, Number(dom), Number(hour), Number(min)))
        if (at < now) at = new Date(Date.UTC(y, m + 1, Number(dom), Number(hour), Number(min)))
        const e = eastern(at)
        const day = e.month === at.getUTCMonth() + 1 ? `${ordinal(e.day)} of the month` : 'Last day of the month'
        return { words: `${day}, ${e.time}`, intervalMinutes: 31 * 24 * 60 }
    }
    return { words: expr, intervalMinutes: 24 * 60 }
}

// -------------------------------------------------------------- status ---

export type JobStatus = 'ok' | 'failed' | 'late' | 'never'

export type HeartbeatRow = {
    job: string
    last_run_at: string | null
    last_finished_at?: string | null
    last_ok?: boolean | null
    last_detail?: string | null
}

export type JobView = {
    job: string
    name: string
    what: string
    group: JobGroup
    runsOn: 'portal' | 'mac'
    schedule: string
    intervalMinutes: number
    status: JobStatus
    /** When it last finished a run (worked or not). */
    lastRunAt: string | null
    /** When it last worked, when that is earlier than the last run. */
    lastWorkedAt: string | null
    detail: string | null
}

export function lateAfterMinutes(job: Pick<JobInfo, 'lateAfterMinutes'>, intervalMinutes: number): number {
    return job.lateAfterMinutes ?? 2 * intervalMinutes + 10
}

export function jobStatus(row: HeartbeatRow | undefined, lateAfterMin: number, now: Date): Pick<JobView, 'status' | 'lastRunAt' | 'lastWorkedAt' | 'detail'> {
    const times = [row?.last_finished_at, row?.last_run_at].filter((t): t is string => !!t).map(t => Date.parse(t))
    if (!row || !times.length) return { status: 'never', lastRunAt: null, lastWorkedAt: null, detail: null }
    const last = Math.max(...times)
    const lastRunAt = new Date(last).toISOString()
    const detail = row.last_detail ?? null
    if (row.last_ok === false) {
        const worked = row.last_run_at ? Date.parse(row.last_run_at) : null
        // A failed first run creates the row, which stamps last_run_at too: not a "worked".
        const lastWorkedAt = worked && worked < last - 60_000 ? new Date(worked).toISOString() : null
        return { status: 'failed', lastRunAt, lastWorkedAt, detail }
    }
    const status: JobStatus = now.getTime() - last > lateAfterMin * 60_000 ? 'late' : 'ok'
    return { status, lastRunAt, lastWorkedAt: null, detail }
}

/** Every job: vercel.json's crons (described by PORTAL_JOBS) and the Mac's. */
export function allJobs(now: Date = new Date()): (JobInfo & { runsOn: 'portal' | 'mac'; schedule: string; intervalMinutes: number })[] {
    const crons = (vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? []
    const portal = crons.map(c => {
        const job = jobForPath(c.path)
        const info: JobInfo = BY_JOB.get(job) ?? { job, name: job, what: `Runs ${c.path}.`, group: 'watch' }
        const { words, intervalMinutes } = describeCron(c.schedule, now)
        return { ...info, runsOn: 'portal' as const, schedule: words, intervalMinutes }
    })
    // Registry order (grouped), then anything vercel.json has that the registry doesn't.
    const order = new Map(PORTAL_JOBS.map((j, i) => [j.job, i]))
    portal.sort((a, b) => (order.get(a.job) ?? 999) - (order.get(b.job) ?? 999))
    const mac = MAC_JOBS.map(j => ({ ...j, runsOn: 'mac' as const, schedule: j.schedule ?? '', intervalMinutes: j.intervalMinutes ?? 24 * 60 }))
    return [...portal, ...mac]
}

/** Server-side, with the service-role client: every job and how it last went. */
export async function loadScheduledJobs(client: DbClient, now: Date = new Date()): Promise<JobView[]> {
    const jobs = allJobs(now)
    const { data, error } = await client
        .from('cron_heartbeats')
        .select('job, last_run_at, last_finished_at, last_ok, last_detail')
        .in('job', jobs.map(j => j.job))
    if (error) throw new Error(`cron_heartbeats read failed: ${error.message}`)
    const rows = new Map(((data ?? []) as HeartbeatRow[]).map(r => [r.job, r]))
    return jobs.map(j => ({
        job: j.job,
        name: j.name,
        what: j.what,
        group: j.group,
        runsOn: j.runsOn,
        schedule: j.schedule,
        intervalMinutes: j.intervalMinutes,
        ...jobStatus(rows.get(j.job), lateAfterMinutes(j, j.intervalMinutes), now),
    }))
}
