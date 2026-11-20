/**
 * Self-check for the scheduled jobs page (#777): every cron in vercel.json is
 * described in lib/scheduled-jobs.ts and its route records its runs
 * (withCronRun); schedules read right in Eastern words in winter and summer;
 * statuses (worked, failed, late, never); and the recorder itself (ok, error,
 * thrown, not for unauthorized or ?dry=1). Fake database: nothing touches prod.
 *
 *   npx tsx scripts/check_scheduled_jobs.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import vercel from '../vercel.json'
import { allJobs, cronMatches, dayMarks, describeCron, HISTORY_DAYS, jobForPath, jobStatus, MAC_JOBS, PORTAL_JOBS, runNowView, scheduledRunNear, summarizeJobRun, type RunDayRow } from '../lib/scheduled-jobs'
import { withCronRun } from '../lib/cron-runs'
import { isManualRun, MANUAL_RUN_HEADER } from '../lib/cron-auth'
import { cronSource } from '../lib/cron-alerts'
import { JOB_ROUTES, previewJobRunCore, runJobNowCore } from '../lib/run-job-now'
import type { DbClient } from '../lib/supabase/admin'

const ROOT = path.join(__dirname, '..')

function fakeDb() {
    const rows = new Map<string, Record<string, unknown>>()
    const client = {
        from(table: string) {
            assert.equal(table, 'cron_heartbeats')
            return {
                upsert: async (row: Record<string, unknown>) => {
                    rows.set(row.job as string, { ...(rows.get(row.job as string) ?? {}), ...row })
                    return { error: null }
                },
            }
        },
    }
    return { client: client as unknown as DbClient, rows }
}

async function main() {
    // 1. vercel.json and the registry agree, and every route records its runs.
    const crons = vercel.crons.map(c => jobForPath(c.path))
    const described = PORTAL_JOBS.map(j => j.job)
    assert.deepEqual([...crons].sort(), [...described].sort(), 'vercel.json crons and PORTAL_JOBS differ')
    for (const job of crons) {
        const file = path.join(ROOT, 'app/api/cron', job, 'route.ts')
        assert.ok(existsSync(file), `no route for ${job}`)
        assert.ok(readFileSync(file, 'utf8').includes(`withCronRun('${job}', `), `${job}: route does not record its runs (withCronRun)`)
    }
    assert.equal(allJobs().length, crons.length + MAC_JOBS.length)

    // 2. Schedules in Eastern words, winter and summer.
    const nov = new Date('2026-11-19T12:00:00Z')
    const jul = new Date('2026-07-15T12:00:00Z')
    const words = (expr: string, at = nov) => describeCron(expr, at).words
    assert.equal(words('*/10 * * * *'), 'Every 10 minutes')
    assert.equal(words('15,45 * * * *'), 'Every 30 minutes')
    assert.equal(words('20 * * * *'), 'Every hour')
    assert.equal(words('30 13 * * *'), 'Daily 8:30am EST')
    assert.equal(words('30 13 * * *', jul), 'Daily 9:30am EDT')
    assert.equal(words('0 4 * * *'), 'Daily 11pm EST')
    assert.equal(words('0 2 * * *'), 'Daily 9pm EST')
    assert.equal(words('0 14 1 * *'), '1st of the month, 9am EST')
    assert.equal(words('30 13 * * 1'), 'Mondays 8:30am EST')
    assert.equal(words('0 2 * * 1'), 'Sundays 9pm EST')
    assert.equal(words('0 2 1 * *'), 'Last day of the month, 9pm EST')
    assert.equal(describeCron('*/5 * * * *').intervalMinutes, 5)
    assert.equal(describeCron('5,35 * * * *').intervalMinutes, 30)
    assert.equal(describeCron('30 13 * * 1').intervalMinutes, 7 * 24 * 60)

    // 3. Statuses.
    const now = new Date('2026-11-19T15:00:00Z')
    const iso = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString()
    assert.equal(jobStatus(undefined, 30, now).status, 'never')
    assert.equal(jobStatus({ job: 'x', last_run_at: iso(10) }, 30, now).status, 'ok')
    assert.equal(jobStatus({ job: 'x', last_run_at: iso(31) }, 30, now).status, 'late')
    // last_finished_at newer than last_run_at counts as the last run.
    assert.equal(jobStatus({ job: 'x', last_run_at: iso(100), last_finished_at: iso(5), last_ok: true }, 30, now).status, 'ok')
    let s = jobStatus({ job: 'x', last_run_at: iso(600), last_finished_at: iso(5), last_ok: false, last_detail: 'Dropbox said no' }, 30, now)
    assert.equal(s.status, 'failed')
    assert.equal(s.detail, 'Dropbox said no')
    assert.equal(s.lastWorkedAt, iso(600))
    // A first run that failed: the row's creation stamp is not a "last worked".
    s = jobStatus({ job: 'x', last_run_at: iso(5), last_finished_at: iso(5), last_ok: false }, 30, now)
    assert.equal(s.status, 'failed')
    assert.equal(s.lastWorkedAt, null)

    // 4. Summaries from real-shaped answers.
    assert.equal(summarizeJobRun('reminders', { stats: { '48h': 1, '24h': 2, '12h': 0, '15m': 0 }, failed: 0, unnotified: 0 }), '3 reminders sent')
    assert.equal(summarizeJobRun('reminders', { stats: {}, failed: 1, unnotified: 0 }), 'No reminders due, 1 failed to send')
    assert.equal(summarizeJobRun('organize-recordings', { result: { moved: [], errors: [] } }), 'Nothing new')
    assert.equal(summarizeJobRun('capture-payments', { held: 0, captured: 0, failed: 0 }), 'Nothing on hold')
    assert.equal(summarizeJobRun('classroom-server-watch', { configured: false }), "Off until the classroom moves to the studio's own server")
    assert.equal(summarizeJobRun('backup-watchdog', { stale: false, hoursSince: 5.2, familyWatch: { stale: true, emailed: true } }),
        'Backup fresh (5 hours old), family message watcher is late, emailed you')
    assert.equal(summarizeJobRun('no-such-job', {}), null)
    assert.equal(summarizeJobRun('reminders', null), 'No reminders due')

    // 5. The recorder.
    const { client, rows } = fakeDb()
    const wrapped = (job: string, handler: (r: Request) => Promise<Response>) => withCronRun(job, handler, { client: () => client })
    const url = 'https://lessons.example/api/cron/'
    let res = await wrapped('reminders', async () => Response.json({ success: true, stats: { '24h': 2 }, failed: 0 }))(new Request(url + 'reminders'))
    assert.equal(res.status, 200)
    assert.equal((await res.json()).success, true, 'the answer still reads after recording')
    let row = rows.get('reminders')!
    assert.equal(row.last_ok, true)
    assert.equal(row.last_detail, '2 reminders sent')
    assert.ok(row.last_run_at && row.last_finished_at)
    assert.equal(typeof row.last_duration_ms, 'number', 'the run time is recorded (#1077)')
    assert.equal(row.last_quiet, false, 'it sent reminders: not quiet')
    await wrapped('reminders', async () => Response.json({ success: true, stats: { '24h': 0 }, failed: 0, unnotified: 0 }))(new Request(url + 'reminders'))
    assert.equal(rows.get('reminders')!.last_quiet, true, 'no reminders due: quiet')
    await wrapped('classroom-server-watch', async () => Response.json({ configured: false }))(new Request(url + 'classroom-server-watch'))
    assert.equal(rows.get('classroom-server-watch')!.last_quiet, null, 'no rule: the database compares details')

    await wrapped('reminders', async () => Response.json({ error: 'database timed out' }, { status: 500 }))(new Request(url + 'reminders'))
    row = rows.get('reminders')!
    assert.equal(row.last_ok, false)
    assert.equal(row.last_detail, 'database timed out')

    await assert.rejects(wrapped('credit-check', async () => { throw new Error('boom') })(new Request(url + 'credit-check')), /boom/)
    assert.equal(rows.get('credit-check')!.last_ok, false)
    assert.equal(rows.get('credit-check')!.last_detail, 'boom')
    assert.equal(rows.get('credit-check')!.last_run_at, undefined, 'a failure never stamps last_run_at')

    await wrapped('weekly-summary', async () => Response.json({ error: 'Unauthorized' }, { status: 401 }))(new Request(url + 'weekly-summary'))
    await wrapped('weekly-summary', async () => Response.json({ success: true, emailed: false }))(new Request(url + 'weekly-summary?dry=1'))
    await wrapped('weekly-summary', async () => Response.json({ error: 'month= only works with dry=1' }, { status: 400 }))(new Request(url + 'weekly-summary?month=2026-10'))
    assert.equal(rows.has('weekly-summary'), false, 'unauthorized, dry and wrong-parameter runs are not recorded')

    // A broken database client never breaks the run.
    res = await withCronRun('reminders', async () => Response.json({ success: true }), { client: () => { throw new Error('no env') } })(new Request(url + 'reminders'))
    assert.equal(res.status, 200)

    // 6. The 30 days of marks (#1077).
    const day = (d: string, runs: number, failed: number, extra: Partial<RunDayRow> = {}): RunDayRow => ({
        job: 'x', day: d, runs, failed, last_at: `${d}T14:15:00Z`, last_detail: 'Nothing new', last_duration_ms: 2300,
        failed_at: failed ? `${d}T15:10:00Z` : null, failed_detail: failed ? 'Dropbox said no' : null, ...extra,
    })
    const marks = dayMarks([day('2026-11-20', 1, 0), day('2026-11-19', 144, 2), day('2026-11-18', 3, 0), day('2026-10-01', 1, 1)], '2026-11-20')
    assert.equal(marks.length, HISTORY_DAYS)
    assert.equal(marks[0].date, '2026-10-22', 'oldest first, 30 days ending today')
    assert.equal(marks[29].date, '2026-11-20')
    assert.equal(marks[29].state, 'ok')
    assert.equal(marks[29].text, 'Fri, Nov 20, 9:15am EST: worked. Nothing new. Took 2 seconds.')
    assert.equal(marks[28].state, 'failed')
    assert.equal(marks[28].text, 'Thu, Nov 19: 2 runs failed (of 144 on record). Last failure at 10:10am EST: Dropbox said no.')
    assert.equal(marks[27].text, 'Wed, Nov 18: all worked (3 runs on record). Last at 9:15am EST: Nothing new.')
    assert.equal(marks[26].state, 'none')
    assert.equal(marks[26].text, 'Tue, Nov 17: no run.')
    assert.ok(!marks.some(m => m.date === '2026-10-01'), 'older days fall off')

    // 7. Run now (#1076).
    assert.deepEqual(Object.keys(JOB_ROUTES).sort(), [...crons].sort(), 'every vercel.json cron has a Run now route (lib/run-job-now.ts)')
    for (const job of crons) {
        assert.ok(readFileSync(path.join(ROOT, 'lib/run-job-now.ts'), 'utf8').includes(`import('@/app/api/cron/${job}/route')`), `${job}: JOB_ROUTES loads the wrong route`)
    }
    // Every job that sends families email asks first.
    for (const job of ['reminders', 'auto-schedule-lessons', 'monthly-statements', 'new-recordings', 'classroom-recordings']) {
        assert.equal(runNowView(allJobs().find(j => j.job === job)!).mode, 'confirm', `${job} must ask before a manual run`)
    }
    assert.equal(runNowView(allJobs().find(j => j.job === 'storage-check')!).mode, 'run')
    assert.equal(runNowView(allJobs().find(j => j.job === 'studio-backup')!).mode, 'mac')

    assert.ok(cronMatches('*/10 * * * *', new Date('2026-11-20T23:00:00Z')))
    assert.ok(!cronMatches('*/10 * * * *', new Date('2026-11-20T23:05:00Z')))
    assert.ok(cronMatches('0 15 1 * *', new Date('2026-12-01T15:00:00Z')))
    assert.ok(!cronMatches('0 15 1 * *', new Date('2026-12-02T15:00:00Z')))
    assert.ok(cronMatches('30 13 * * 1', new Date('2026-11-23T13:30:00Z')), 'Monday')
    assert.ok(cronMatches('5,35 * * * *', new Date('2026-11-23T13:35:00Z')))
    assert.ok(scheduledRunNear('*/10 * * * *', new Date('2026-11-20T23:01:40Z')), 'a tick that just started')
    assert.ok(scheduledRunNear('*/10 * * * *', new Date('2026-11-20T22:59:20Z')), 'a tick about to start')
    assert.equal(scheduledRunNear('*/10 * * * *', new Date('2026-11-20T23:05:00Z')), null)

    process.env.CRON_SECRET = 'test-secret'
    const seen: Request[] = []
    const fake = (body: unknown, status = 200) => async (r: Request) => { seen.push(r); return Response.json(body, { status }) }
    const quiet = new Date('2026-11-20T23:05:00Z')
    let run = await runJobNowCore('storage-check', { now: quiet, handler: fake({ success: true, message: 'database 25 MB of 500 MB (4%)' }) })
    assert.deepEqual([run.ok, run.text], [true, 'Database 25 MB of 500 MB (4%)'])
    assert.equal(seen.at(-1)!.headers.get('authorization'), 'Bearer test-secret')
    assert.ok(isManualRun(seen.at(-1)!), 'a Run now request is marked manual')
    assert.equal(cronSource(seen.at(-1)!), 'manual', 'and never counts for a trigger')
    assert.equal(cronSource(new Request(url + 'reminders', { headers: { authorization: 'Bearer test-secret' } })), 'vercel')
    assert.equal(isManualRun(new Request(url + 'reminders', { headers: { [MANUAL_RUN_HEADER]: '1' } })), false, 'the header alone is nothing')

    const calls = seen.length
    run = await runJobNowCore('reminders', { now: quiet, handler: fake({ success: true }) })
    assert.equal(run.ok, false, 'a family-emailing job needs the yes')
    run = await runJobNowCore('reminders', { now: new Date('2026-11-20T23:00:30Z'), confirmed: true, handler: fake({ success: true }) })
    assert.equal(run.ok, false, 'not while its scheduled run is starting')
    assert.match(run.text, /scheduled run is at 6:00pm EST/)
    assert.equal(seen.length, calls, 'neither reached the route')
    run = await runJobNowCore('reminders', { now: quiet, confirmed: true, handler: fake({ success: true, stats: { '24h': 1 } }) })
    assert.deepEqual([run.ok, run.text], [true, '1 reminder sent'])
    run = await runJobNowCore('studio-backup', { now: quiet, handler: fake({}) })
    assert.match(run.text, /runs on the Mac/)
    run = await runJobNowCore('calendar-sync', { now: quiet, handler: fake({ error: 'Google said no' }, 500) })
    assert.deepEqual([run.ok, run.text], [false, 'Google said no'])
    run = await runJobNowCore('calendar-sync', { now: quiet, handler: async () => { throw new Error('boom') } })
    assert.deepEqual([run.ok, run.text], [false, 'boom'])

    let preview = await previewJobRunCore('monthly-statements', { now: quiet, handler: fake({ month: '2026-10', wouldSend: 2, alreadySent: 30 }) })
    assert.equal(preview.text, 'A check just now: 2 families would get the October statement (30 already have it).')
    assert.equal(new URL(seen.at(-1)!.url).searchParams.get('dry'), '1', 'the check is a dry run')
    preview = await previewJobRunCore('classroom-recordings', { now: quiet, handler: fake({ result: { attached: [{}], logged: [] }, attendance: { lessons: [{ action: 'would log' }, { action: 'not logged' }] } }) })
    assert.equal(preview.text, 'A check just now: 1 recording to attach and 1 lesson to log.')

    // A manual run is recorded like any other, marked as such.
    const manual = new Request(url + 'calendar-sync', { headers: { authorization: 'Bearer test-secret', [MANUAL_RUN_HEADER]: '1' } })
    await wrapped('calendar-sync', async () => Response.json({ checked: 3, counts: {} }))(manual)
    assert.equal(rows.get('calendar-sync')!.last_detail, 'All 3 lessons matched (run by hand)')

    console.log(`scheduled jobs: all checks passed (${crons.length} portal jobs, ${MAC_JOBS.length} Mac jobs)`)
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
