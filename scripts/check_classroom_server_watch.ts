/**
 * Self-check for the classroom call server watch (lib/classroom-server-watch.ts):
 * healthy, one miss, two misses (one email), more misses (no more emails),
 * recovery (one email), plus the "not configured" and timeout cases. Fake fetch,
 * fake database, fake mailer: no network, nothing sent.
 *
 *   npx tsx scripts/check_classroom_server_watch.ts
 */
import assert from 'node:assert/strict'
import { runClassroomServerWatch, WATCH_JOB, type WatchEmail } from '../lib/classroom-server-watch'
import type { DbClient } from '../lib/supabase/admin'

const URL_ = 'https://rtc.musicalbasics.com'

// cron_heartbeats in memory: just the calls the watch makes.
function fakeDb() {
    const rows = new Map<string, Record<string, unknown>>()
    const client = {
        from(table: string) {
            assert.equal(table, 'cron_heartbeats')
            return {
                select: () => ({
                    eq: (_col: string, job: string) => ({
                        maybeSingle: async () => ({ data: rows.get(job) ?? null, error: null }),
                    }),
                }),
                upsert: async (row: Record<string, unknown>) => {
                    rows.set(row.job as string, { ...(rows.get(row.job as string) ?? {}), ...row })
                    return { error: null }
                },
            }
        },
    }
    return { client: client as unknown as DbClient, rows }
}

type Answer = 'ok' | 'down503' | 'wrongBody' | 'refused' | 'hang'
let answer: Answer = 'ok'
const fakeFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
    switch (answer) {
        case 'ok': return new Response('OK', { status: 200 })
        case 'down503': return new Response('Service Unavailable', { status: 503 })
        case 'wrongBody': return new Response('<html>parked domain</html>', { status: 200 })
        case 'refused': throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
        case 'hang': return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
        })
    }
}

const sent: WatchEmail[] = []
let mailerWorks = true
const sendAlert = async (e: WatchEmail) => {
    if (!mailerWorks) return false
    sent.push(e)
    return true
}

async function main() {
    const { client, rows } = fakeDb()
    let t = Date.parse('2026-11-20T23:00:00Z') // Fri Nov 20, 6:00pm EST
    const tick = async (a: Answer, dryRun = false) => {
        answer = a
        const r = await runClassroomServerWatch({ client, url: URL_, now: new Date(t), fetchImpl: fakeFetch, timeoutMs: 50, sendAlert, dryRun })
        t += 5 * 60_000
        return r
    }

    // Not configured: no probe, no state, no email.
    const off = await runClassroomServerWatch({ client, url: '', fetchImpl: async () => { throw new Error('must not probe') }, sendAlert })
    assert.equal(off.configured, false)
    assert.match(off.message, /not configured/)
    assert.equal(rows.size, 0)

    // #949: the server's own report is healthy and stays fresh for this whole run
    // (dated far ahead), so only the probe-based emails below are counted here;
    // scripts/check_classroom_server_health.ts covers the report's own emails.
    rows.set('classroom-server-report', { job: 'classroom-server-report', state: { report: { at: '2099-01-01T00:00:00Z', livekit: 'active', egress: 'active', diskPct: 30 }, alerts: { recorderDown: false, diskFull: false, stale: false } } })

    // Healthy.
    let r = await tick('ok')
    assert.equal(r.probe?.ok, true)
    assert.equal(r.email, null)
    assert.equal((rows.get(WATCH_JOB)!.state as any).consecutiveFailures, 0)
    assert.equal(sent.length, 0)

    // One miss: no email yet.
    r = await tick('down503')
    assert.equal(r.probe?.ok, false)
    assert.equal(r.after?.consecutiveFailures, 1)
    assert.equal(r.email, null)
    assert.equal(sent.length, 0)
    const downSince = r.after?.downSince

    // Second miss in a row: exactly one email, naming the first miss's time.
    r = await tick('wrongBody')
    assert.equal(r.after?.consecutiveFailures, 2)
    assert.equal(r.email, 'down')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].kind, 'down')
    assert.equal(r.after?.downSince, downSince)
    assert.ok(sent[0].lines[0].includes('(rtc.musicalbasics.com) has not answered for 10 minutes since Fri Nov 20, 6:05pm EST'), sent[0].lines[0])
    assert.ok(sent[0].lines[1].includes("LiveKit Cloud"))
    assert.ok(rows.get(WATCH_JOB)!.last_alert_at)

    // More misses (refused, timeout): no more emails.
    r = await tick('refused')
    assert.equal(r.probe?.ok, false)
    r = await tick('hang')
    assert.equal(r.probe?.ok, false)
    assert.match((r.probe as any).reason, /no answer within/)
    for (let i = 0; i < 5; i++) await tick('down503')
    assert.equal(sent.length, 1)
    assert.equal((rows.get(WATCH_JOB)!.state as any).consecutiveFailures, 9)

    // A dry run while down and recovered: reports, but no email and nothing saved.
    const stateBefore = JSON.stringify(rows.get(WATCH_JOB)!.state)
    r = await tick('ok', true)
    assert.equal(r.email, 'up')
    assert.equal(r.emailed, false)
    assert.equal(sent.length, 1)
    assert.equal(JSON.stringify(rows.get(WATCH_JOB)!.state), stateBefore)

    // Recovery: exactly one "back" email.
    r = await tick('ok')
    assert.equal(r.email, 'up')
    assert.equal(sent.length, 2)
    assert.equal(sent[1].kind, 'up')
    assert.match(sent[1].lines[0], /is back since /)
    assert.equal(r.after?.alerted, false)
    assert.equal(r.after?.consecutiveFailures, 0)

    // Healthy again: no more emails.
    await tick('ok')
    await tick('ok')
    assert.equal(sent.length, 2)

    // A single blip never emails.
    await tick('down503')
    await tick('ok')
    assert.equal(sent.length, 2)

    // If the "down" email fails to send, the next run tries again (and only once it works).
    mailerWorks = false
    await tick('down503')
    r = await tick('down503')
    assert.equal(r.email, 'down')
    assert.equal(r.emailed, false)
    assert.equal(r.after?.alerted, false)
    mailerWorks = true
    r = await tick('down503')
    assert.equal(r.emailed, true)
    assert.equal(sent.length, 3)
    await tick('down503')
    assert.equal(sent.length, 3)
    await tick('ok')
    assert.equal(sent.length, 4)
    assert.equal(sent[3].kind, 'up')

    console.log('classroom server watch: all checks passed')
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
