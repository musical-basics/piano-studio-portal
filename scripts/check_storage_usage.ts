/**
 * Self-check for the storage alert (lib/storage-usage.ts): silent under 80%,
 * one email past 80%, nothing more for a week, a repeat after a week, a second
 * email at 95%, a reset once back under 80%, a retry after a failed send, and
 * the growth figure. Fake usage, fake database, fake mailer: nothing sent.
 *
 *   npx tsx scripts/check_storage_usage.ts
 */
import assert from 'node:assert/strict'
import { runStorageCheck, STORAGE_JOB, type StorageEmail, type Usage } from '../lib/storage-usage'
import { measureEmailQuota, quotaFromHeaders, type EmailQuota } from '../lib/email-quota'
import type { DbClient } from '../lib/supabase/admin'

const MB = 1024 * 1024

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

const usage = (dbMb: number, filesMb: number): Usage => ({
    database: dbMb * MB,
    files: filesMb * MB,
    fileCount: 10,
    tables: [{ name: 'public.messages', bytes: 120 * MB }],
    buckets: [{ name: 'lesson_materials', bytes: 300 * MB, files: 114 }],
})

async function main() {
    const { client, rows } = fakeDb()
    const sent: StorageEmail[] = []
    let mailerWorks = true
    const sendAlert = async (e: StorageEmail) => {
        if (!mailerWorks) return false
        sent.push(e)
        return true
    }
    let t = Date.parse('2026-11-19T14:15:00Z') // Thu Nov 19, 9:15am EST
    const day = async (dbMb: number, filesMb: number, dryRun = false) => {
        const r = await runStorageCheck({ client, usage: usage(dbMb, filesMb), now: new Date(t), sendAlert, dryRun })
        t += 86_400_000
        return r
    }

    // Today's real sizes: silent, but the reading is kept.
    let r = await day(21, 176)
    assert.equal(r.email, null)
    assert.equal(sent.length, 0)
    assert.equal((rows.get(STORAGE_JOB)!.state as any).readings.length, 1)
    assert.ok(rows.get(STORAGE_JOB)!.last_run_at)

    // Database passes 80% (400 of 500 MB): one email, with growth and the to-do.
    r = await day(410, 176)
    assert.equal(sent.length, 1)
    assert.match(sent[0].subject, /^Studio database is at 82% of the free plan \(410 MB of 500 MB\)$/)
    assert.equal(sent[0].urgent, false)
    assert.match(sent[0].html, /It grew 389 MB over the last day/)
    assert.match(sent[0].html, /public\.messages 120 MB/)
    assert.match(sent[0].html, /What to do/)
    assert.match(sent[0].html, /file storage is 176 MB of 1 GB \(17%\), fine/)
    assert.ok(rows.get(STORAGE_JOB)!.last_alert_at)

    // Still over for the next six days: no more email.
    for (let i = 0; i < 6; i++) await day(412 + i, 176)
    assert.equal(sent.length, 1)

    // A week after the first email: one repeat.
    await day(420, 176)
    assert.equal(sent.length, 2)

    // Crossing 95% (476 MB): a second email the next day, marked urgent.
    await day(480, 176)
    assert.equal(sent.length, 3)
    assert.equal(sent[2].urgent, true)
    assert.match(sent[2].subject, /^Urgent: studio database is at 96%/)
    assert.match(sent[2].html, /reaches the limit in about \d+ days?/)

    // Dry run: says what it would send, saves nothing.
    const before = JSON.stringify(rows.get(STORAGE_JOB)!.state)
    r = await day(480, 1000, true)
    assert.ok(r.email)
    assert.equal(sent.length, 3)
    assert.equal(JSON.stringify(rows.get(STORAGE_JOB)!.state), before)

    // Files pass 80% too, while the mailer is down: nothing recorded as sent...
    mailerWorks = false
    r = await day(480, 900)
    assert.ok(r.email)
    assert.equal(r.emailed, false)
    assert.equal((rows.get(STORAGE_JOB)!.state as any).alerts.files, undefined)
    // ...so the next day tries again, and only the files are due (the database was emailed 2 days ago).
    mailerWorks = true
    await day(480, 905)
    assert.equal(sent.length, 4)
    assert.match(sent[3].subject, /^Studio file storage is at 88% of the free plan \(905 MB of 1 GB\)$/)
    assert.match(sent[3].html, /lesson_materials 300 MB \(114 files\)/)
    assert.match(sent[3].html, /database is 480 MB of 500 MB \(96%\), already emailed about/)

    // Cleaned up: both back under 80%, silent, and the alerts reset.
    await day(200, 300)
    assert.equal(sent.length, 4)
    assert.deepEqual((rows.get(STORAGE_JOB)!.state as any).alerts, {})
    // Passing 80% again later emails right away.
    await day(410, 300)
    assert.equal(sent.length, 5)

    // Readings: one per day, never more than five weeks.
    for (let i = 0; i < 40; i++) await day(100, 100)
    const readings = (rows.get(STORAGE_JOB)!.state as any).readings
    assert.ok(readings.length <= 36, `kept ${readings.length} readings`)
    assert.equal(new Set(readings.map((x: any) => x.date)).size, readings.length)

    // ---- Cloudflare R2 (#1072): the studio's two video buckets against the free 10 GB, decimal GB,
    // never "urgent"; other projects' buckets only ever show as the account total.
    {
        const { client: db2, rows: rows2 } = fakeDb()
        const mails: StorageEmail[] = []
        const send = async (e: StorageEmail) => { mails.push(e); return true }
        const GB = 1e9
        // `gb` is the studio's two buckets; the account also holds 13 GB of other projects.
        const r2At = (gb: number) => async () => ({
            bytes: gb * GB,
            files: 100,
            buckets: [
                { name: 'musicalbasics-recordings', bytes: (gb - 0.5) * GB, files: 90 },
                { name: 'studio-practice-videos', bytes: 0.5 * GB, files: 10 },
            ],
            account: { bytes: (gb + 13) * GB, buckets: 16 },
        })
        let at = Date.parse('2026-11-21T14:15:00Z')
        const run = async (gb: number | 'fail') => {
            const r = await runStorageCheck({
                client: db2, usage: usage(21, 176), now: new Date(at), sendAlert: send,
                measureR2: gb === 'fail' ? async () => { throw new Error('R2 list buckets: HTTP 403') } : r2At(gb),
            })
            at += 86_400_000
            return r
        }
        // Today's real sizes: the studio's 2.55 GB is fine even though the whole account is 15.5 GB.
        let r2 = await run(2.55)
        assert.equal(mails.length, 0)
        assert.match(r2.message, /classroom and practice video storage \(Cloudflare R2\) 2\.55 GB of 10 GB \(25%\)/)
        assert.match(r2.message, /whole Cloudflare account 15\.55 GB, other projects included, not checked/)
        r2 = await run(7.9)
        assert.equal(mails.length, 0)
        r2 = await run(8.2)
        assert.equal(mails.length, 1)
        assert.equal(mails[0].subject, 'Studio classroom and practice video storage (Cloudflare R2) is at 82% of the free 10 GB (8.2 GB of 10 GB)')
        assert.equal(mails[0].urgent, false)
        assert.match(mails[0].html, /musicalbasics-recordings \(classroom videos\) 7\.7 GB \(90 files\)/)
        assert.match(mails[0].html, /studio-practice-videos \(practice videos\) 500 MB \(10 files\)/)
        assert.match(mails[0].html, /whole Cloudflare account holds 21\.2 GB in 16 buckets/)
        assert.match(mails[0].html, /database is 21 MB of 500 MB \(4%\), fine/)
        // Over the free 10 GB: the 95% email, with the monthly cost, still not urgent.
        await run(15.5)
        assert.equal(mails.length, 2)
        assert.equal(mails[1].urgent, false)
        assert.match(mails[1].subject, /^Studio classroom and practice video storage \(Cloudflare R2\) is at 155%/)
        assert.match(mails[1].html, /costs about \$0\.09 a month \(6 GB over the free 10 GB\)/)
        // R2 cannot be measured: Supabase is still checked, the R2 alert state is kept, no email.
        r2 = await run('fail')
        assert.equal(mails.length, 2)
        assert.match(r2.message, /R2 not measured \(R2 list buckets: HTTP 403\)/)
        assert.ok((rows2.get(STORAGE_JOB)!.state as any).alerts.r2)
        assert.equal(r2.reports.length, 2)
    }

    // ---- Resend emails (#1073): this billing month's sends against the plan's limit, same 80% email,
    // urgent at 95% (sending stops at the limit); the count restarts each billing month.
    {
        const { client: db3, rows: rows3 } = fakeDb()
        const mails: StorageEmail[] = []
        const send = async (e: StorageEmail) => { mails.push(e); return true }
        const paid = (month: number): EmailQuota => ({ month, monthLimit: 50_000, day: null, dayLimit: 100, noDailyCount: true, limitFrom: 'setting' })
        let at = Date.parse('2026-11-21T14:15:00Z')
        const run = async (q: EmailQuota | 'fail') => {
            const r = await runStorageCheck({
                client: db3, usage: usage(21, 176), now: new Date(at), sendAlert: send,
                measureEmails: q === 'fail' ? async () => { throw new Error('Resend refused the usage check (HTTP 401)') } : async () => q,
            })
            at += 86_400_000
            return r
        }
        let r3 = await run(paid(79))
        assert.equal(mails.length, 0)
        assert.match(r3.message, /emails this month 79 of 50,000 emails \(0%\)/)
        assert.equal((rows3.get(STORAGE_JOB)!.state as any).readings[0].emails, 79)
        r3 = await run(paid(39_000))
        assert.equal(mails.length, 0)
        r3 = await run(paid(41_000))
        assert.equal(mails.length, 1)
        assert.equal(mails[0].subject, "Studio emails are at 82% of this month's Resend limit (41,000 of 50,000 emails)")
        assert.equal(mails[0].urgent, false)
        assert.match(mails[0].html, /<strong>41,000 emails<\/strong> went out this billing month, of the Resend plan's 50,000/)
        assert.match(mails[0].html, /About 20,461 a day went out over the last 2 days\. At that pace the limit is reached in about 1 day, unless/)
        assert.doesNotMatch(mails[0].html, /free plan/, 'a set limit is not explained')
        assert.match(mails[0].html, /Resend stops sending until the next billing month/)
        await run(paid(43_000))
        assert.equal(mails.length, 1, 'no repeat within the week')
        await run(paid(47_600))
        assert.equal(mails.length, 2)
        assert.equal(mails[1].urgent, true, 'sending stops at the limit')
        assert.match(mails[1].subject, /^Urgent: studio emails are at 95%/)
        // A new billing month: back to a low count, the alert resets, no growth from last month's readings.
        r3 = await run(paid(120))
        assert.equal(mails.length, 2)
        assert.equal((rows3.get(STORAGE_JOB)!.state as any).alerts.emails, undefined)
        assert.equal(r3.reports.find(x => x.resource === 'emails')!.perDay, null)
        // The free plan: the daily limit too.
        r3 = await run({ month: 900, monthLimit: 3_000, day: 85, dayLimit: 100, noDailyCount: false, limitFrom: 'free-default' })
        assert.equal(mails.length, 3)
        assert.equal(mails[2].subject, "Studio emails are at 85% of today's Resend limit (85 of 100 emails)")
        assert.match(r3.message, /emails this month 900 of 3,000 emails \(30%\), emails today 85 of 100 emails \(85%\)/)
        // No setting and no daily count (a paid plan, by Resend's headers): the free 3,000, and the email says how to set it.
        r3 = await run({ month: 2_500, monthLimit: 3_000, day: null, dayLimit: 100, noDailyCount: true, limitFrom: 'free-default' })
        assert.equal(mails.length, 4)
        assert.equal(mails[3].subject, "Studio emails are at 83% of this month's Resend limit (2,500 of 3,000 emails)")
        assert.match(mails[3].html, /free plan's 3,000 a month, used because RESEND_MONTHLY_LIMIT is not set\. Resend sends no daily count/)
        assert.equal(r3.reports.length, 3, 'no daily figure without the daily count')
        // Not readable: the rest is still checked, no email.
        r3 = await run('fail')
        assert.equal(mails.length, 4)
        assert.match(r3.message, /emails not measured \(Resend refused the usage check \(HTTP 401\)\)/)
        assert.equal(r3.reports.length, 2)

        // Reading the headers.
        const h = (o: Record<string, string>) => (name: string) => o[name] ?? null
        assert.deepEqual(quotaFromHeaders(h({ 'x-resend-monthly-quota': '79' })),
            { month: 79, monthLimit: 3_000, day: null, dayLimit: 100, noDailyCount: true, limitFrom: 'free-default' }, 'never assumes a paid plan')
        assert.deepEqual(quotaFromHeaders(h({ 'x-resend-monthly-quota': '900', 'x-resend-daily-quota': '12' })),
            { month: 900, monthLimit: 3_000, day: 12, dayLimit: 100, noDailyCount: false, limitFrom: 'free-default' })
        process.env.RESEND_MONTHLY_LIMIT = '100,000'
        process.env.RESEND_DAILY_LIMIT = '5000'
        assert.equal(quotaFromHeaders(h({ 'x-resend-monthly-quota': '79' }))!.monthLimit, 100_000)
        assert.equal(quotaFromHeaders(h({ 'x-resend-monthly-quota': '79' }))!.limitFrom, 'setting')
        assert.equal(quotaFromHeaders(h({ 'x-resend-monthly-quota': '79', 'x-resend-daily-quota': '12' }))!.dayLimit, 5_000)
        delete process.env.RESEND_MONTHLY_LIMIT
        delete process.env.RESEND_DAILY_LIMIT
        assert.equal(quotaFromHeaders(h({})), null)
        // The probe: one send to Resend's test inbox, usage read from the answer.
        process.env.RESEND_API_KEY = 're_test'
        let probe: { url: string; body: any } | null = null
        const q = await measureEmailQuota((async (url: string, init: RequestInit) => {
            probe = { url, body: JSON.parse(String(init.body)) }
            return new Response('{"id":"x"}', { headers: { 'x-resend-monthly-quota': '80' } })
        }) as unknown as typeof fetch)
        assert.equal(q.month, 80)
        assert.equal(probe!.url, 'https://api.resend.com/emails')
        assert.deepEqual(probe!.body.to, ['delivered@resend.dev'])
        await assert.rejects(measureEmailQuota((async () => new Response('{"message":"This API key is restricted"}', { status: 401 })) as unknown as typeof fetch),
            /Resend refused the usage check \(HTTP 401: This API key is restricted\)/)
    }

    console.log(`storage alert: all checks passed (${sent.length} emails in the scenario)`)
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
