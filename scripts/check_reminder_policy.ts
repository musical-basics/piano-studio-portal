// Verifies lib/reminder-policy.ts, the decision logic behind every lesson
// reminder. No test runner is configured, so run it directly:
//
//   npx tsx scripts/check_reminder_policy.ts
//
// Covers on-time delivery, the confirmed/unconfirmed split, recovery after a
// scheduler outage, short-notice bookings, and the never-email-after-start rule.
import { readFileSync } from 'node:fs'
import { dueNotice, neverNotified, ALL_NOTICES, NOTICE_FLAG_COLUMNS, type SentFlags, type NoticeKey } from '../lib/reminder-policy'

const none: SentFlags = { '48h': false, '24h': false, '12h': false, '15m': false }
const f = (...keys: NoticeKey[]): SentFlags => ({ ...none, ...Object.fromEntries(keys.map(k => [k, true])) } as SentFlags)

let pass = 0, fail = 0
function check(desc: string, got: unknown, want: unknown) {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) { pass++; console.log(`  ok   ${desc}`) }
    else { fail++; console.log(`  FAIL ${desc}\n         got  ${g}\n         want ${w}`) }
}
const d = (m: number, conf: boolean, s: SentFlags) => {
    const r = dueNotice(m, conf, s)
    return r ? { n: r.notice, sup: r.superseded, late: r.lateByMinutes } : null
}

console.log('\nNormal on-time delivery (unconfirmed):')
check('3 days out: nothing due', d(4320, false, none), null)
check('47h out: 48h notice', d(2820, false, none), { n: '48h', sup: [], late: 60 })
check('23h out, 48h done: 24h notice', d(1380, false, f('48h')), { n: '24h', sup: [], late: 60 })
check('11h out, 48h+24h done: 12h notice', d(660, false, f('48h','24h')), { n: '12h', sup: [], late: 60 })
check('20m out, all but 15m done', d(20, false, f('48h','24h','12h')), { n: '15m', sup: [], late: 5 })
check('20m out, everything sent', d(20, false, f('48h','24h','12h','15m')), null)

console.log('\nConfirmed lessons skip the confirm-nudge notices:')
check('47h out confirmed: nothing (48h is nudge-only)', d(2820, true, none), null)
check('23h out confirmed: 24h notice', d(1380, true, none), { n: '24h', sup: [], late: 60 })
check('11h out confirmed: nothing (12h is nudge-only)', d(660, true, f('24h')), null)
check('20m out confirmed: 15m notice', d(20, true, f('24h')), { n: '15m', sup: [], late: 5 })

console.log('\nSELF-HEALING: scheduler was down, tick arrives late:')
check('down through 48h window, back at 30h: still sends 48h',
    d(1800, false, none), { n: '48h', sup: [], late: 1080 })
check('down until 4h before: sends 12h, supersedes 48h+24h',
    d(240, false, none), { n: '12h', sup: ['24h','48h'], late: 480 })
check('down until 10m before: sends 15m, supersedes the rest',
    d(10, false, none), { n: '15m', sup: ['12h','24h','48h'], late: 15 })
check('down until 10m before (confirmed): 15m, supersedes 24h only',
    d(10, true, none), { n: '15m', sup: ['24h'], late: 15 })

console.log('\nShort-notice booking gets one email, not four:')
check('lesson booked 20m out', d(20, false, none), { n: '15m', sup: ['12h','24h','48h'], late: 5 })
check('lesson booked 3h out', d(180, false, none), { n: '12h', sup: ['24h','48h'], late: 540 })

console.log('\nLesson already started: never email:')
check('exactly at start', d(0, false, none), null)
check('15m after start', d(-15, false, none), null)
check('2h after start, nothing ever sent', d(-120, false, none), null)

console.log('\nneverNotified:')
check('nothing sent', neverNotified(none), true)
check('one sent', neverNotified(f('15m')), false)
check('all sent', neverNotified(f('48h','24h','12h','15m')), false)

// The weekly digest can't build its select from NOTICE_FLAG_COLUMNS without
// breaking supabase-js row typing, so it hardcodes the columns. Catch drift.
console.log('\nWeekly digest select covers every notice flag column:')
const digestRoute = readFileSync(new URL('../app/api/cron/weekly-digest/route.ts', import.meta.url), 'utf8')
for (const key of ALL_NOTICES) {
    check(`digest selects ${NOTICE_FLAG_COLUMNS[key]}`, digestRoute.includes(NOTICE_FLAG_COLUMNS[key]), true)
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
