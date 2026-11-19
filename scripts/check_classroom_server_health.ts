/**
 * Self-check for the classroom server's health report (#949,
 * lib/classroom-server-health.ts): parsing, and one email per problem start
 * and end. Pure, no network. Run: npx tsx scripts/check_classroom_server_health.ts
 */
import assert from 'node:assert/strict'
import { NO_ALERTS, nextHealth, parseReport, type HealthAlerts, type ServerReport } from '@/lib/classroom-server-health'

const T0 = Date.parse('2026-11-22T15:00:00Z')
const at = (min: number) => new Date(T0 + min * 60_000)
const rep = (min: number, over: Partial<ServerReport> = {}): ServerReport =>
    ({ at: at(min).toISOString(), livekit: 'active', egress: 'active', diskPct: 33, ...over })

// Parsing: plain words and a 0-100 number only.
assert.deepEqual(parseReport({ livekit: 'active', egress: 'failed', diskPct: 33.4, diskTotalGb: 150 }, at(0)),
    { at: at(0).toISOString(), livekit: 'active', egress: 'failed', diskPct: 33, diskTotalGb: 150 })
assert.equal(parseReport({ livekit: 'active; rm -rf', egress: 'active', diskPct: 3 }), null)
assert.equal(parseReport({ livekit: 'active', egress: 'active', diskPct: 140 }), null)
assert.equal(parseReport(null), null)

let a: HealthAlerts = NO_ALERTS
const step = (report: ServerReport | null, nowMin: number, inUse = true) => {
    const r = nextHealth(a, report, at(nowMin), inUse, 'https://example.test/switch')
    a = r.alerts
    return r.emails.map(e => e.kind)
}

// Healthy: nothing.
assert.deepEqual(step(rep(0), 1), [])
// Recorder stops: one email (with the switch-back link), then quiet while it stays down.
assert.deepEqual(step(rep(5, { egress: 'failed' }), 6), ['recorder'])
assert.deepEqual(step(rep(10, { egress: 'failed' }), 11), [])
// Back: one note.
assert.deepEqual(step(rep(15), 16), ['recorder-ok'])
// Disk: alert at 85, quiet at 83 (still above the 80 clear line), note below 80.
assert.deepEqual(step(rep(20, { diskPct: 86 }), 21), ['disk'])
assert.deepEqual(step(rep(25, { diskPct: 83 }), 26), [])
assert.deepEqual(step(rep(30, { diskPct: 79 }), 31), ['disk-ok'])
// Reports stop: alert after 20 minutes, once; back: a note.
assert.deepEqual(step(rep(30), 45), [])
assert.deepEqual(step(rep(30), 55), ['stale'])
assert.deepEqual(step(rep(30), 60), [])
assert.deepEqual(step(rep(60), 61), ['stale-ok'])

// Not in use yet (before the switch): recorder and stale stay quiet, disk still alerts.
a = NO_ALERTS
assert.deepEqual(step(rep(0, { egress: 'inactive' }), 1, false), [])
assert.deepEqual(step(null, 100, false), [])
assert.deepEqual(step(rep(100, { diskPct: 90 }), 101, false), ['disk'])

// Never reported, in use: one "stale" email.
a = NO_ALERTS
assert.deepEqual(step(null, 0), ['stale'])
assert.deepEqual(step(null, 5), [])

// No em dashes in what Lionel reads.
const all = nextHealth(NO_ALERTS, rep(0, { egress: 'failed', livekit: 'failed', diskPct: 99 }), at(1), true, 'https://example.test/x')
for (const e of all.emails) assert.ok(!/—/.test(e.subject + e.lines.join(' ')), `em dash in ${e.kind}`)
assert.deepEqual(all.emails.map(e => e.kind), ['recorder', 'disk'])
assert.match(all.emails[0].lines.join(' '), /call server \(failed\) and the recorder \(failed\) are not running/)

console.log('classroom server health: all checks passed')
