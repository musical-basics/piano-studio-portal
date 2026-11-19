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
import { allJobs, describeCron, jobForPath, jobStatus, MAC_JOBS, PORTAL_JOBS, summarizeJobRun } from '../lib/scheduled-jobs'
import { withCronRun } from '../lib/cron-runs'
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
    assert.equal(rows.has('weekly-summary'), false, 'unauthorized and dry runs are not recorded')

    // A broken database client never breaks the run.
    res = await withCronRun('reminders', async () => Response.json({ success: true }), { client: () => { throw new Error('no env') } })(new Request(url + 'reminders'))
    assert.equal(res.status, 200)

    console.log(`scheduled jobs: all checks passed (${crons.length} portal jobs, ${MAC_JOBS.length} Mac jobs)`)
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
