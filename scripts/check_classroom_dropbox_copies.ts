/**
 * Self-check for classroom recordings copied into Dropbox
 * (lib/classroom-dropbox-copies.ts): names and dates, who is skipped, the
 * pending -> running -> done flow, the size check, retries, and that a file is
 * never copied twice. In-memory database and fake Dropbox: no network.
 *
 *   npx tsx scripts/check_classroom_dropbox_copies.ts
 */
import assert from 'node:assert/strict'
import {
    classroomCopyDate, freeCopyName, isClassroomCopyName, syncClassroomDropboxCopies, COPIES_TABLE,
    type CopyAlertEmail,
} from '../lib/classroom-dropbox-copies'
import type { DbClient } from '../lib/supabase/admin'

// ---- Names and dates.
assert.ok(isClassroomCopyName('2026-11-16 - Classroom Lesson.mp4'))
assert.ok(isClassroomCopyName('2026-11-16 - Classroom Lesson (2).mp4'))
assert.ok(!isClassroomCopyName('2026-11-16 - Lesson.mp4'))
assert.ok(!isClassroomCopyName('2026-10-25 - Lesson - 84928336006.mp4'))
assert.equal(freeCopyName('2026-11-16', '.mp4', new Set()), '2026-11-16 - Classroom Lesson.mp4')
assert.equal(freeCopyName('2026-11-16', '.mp4', new Set(['2026-11-16 - classroom lesson.mp4'])), '2026-11-16 - Classroom Lesson (2).mp4')
assert.equal(
    freeCopyName('2026-11-16', '.mp4', new Set(['2026-11-16 - classroom lesson.mp4', '2026-11-16 - classroom lesson (2).mp4'])),
    '2026-11-16 - Classroom Lesson (3).mp4',
)
const R2 = 'https://pub-example.r2.dev'
const S1 = '11111111-1111-4111-8111-111111111111'
// Started 9:04pm EST Sun Nov 15 (02:04 UTC Nov 16): the Eastern start date, not the UTC one.
assert.equal(classroomCopyDate({ url: `${R2}/${S1}_${Date.parse('2026-11-16T02:04:00Z')}.mp4`, created_at: '2026-11-16T03:00:00Z' }), '2026-11-15')
// Old recorder, no start stamp: the day it was saved (7:08pm EDT Mar 19).
assert.equal(classroomCopyDate({ url: `${R2}/${S1}_1773961666960_part1.mp4`, created_at: '2026-03-19T23:08:58Z' }), '2026-03-19')

// ---- A tiny in-memory PostgREST stand-in: just the calls the module makes.
type Row = Record<string, any>
function fakeDb(tables: Record<string, Row[]>) {
    let nextId = 1
    class Query {
        filters: ((r: Row) => boolean)[] = []
        op: 'select' | 'update' | 'insert' = 'select'
        payload: Row | null = null
        constructor(private table: string) {}
        select() { return this }
        order() { return this }
        eq(col: string, v: any) { this.filters.push(r => r[col] === v); return this }
        gte(col: string, v: any) { this.filters.push(r => r[col] >= v); return this }
        in(col: string, vs: any[]) { this.filters.push(r => vs.includes(r[col])); return this }
        not(col: string, _op: string, _v: null) { this.filters.push(r => r[col] !== null && r[col] !== undefined); return this }
        is(col: string, v: null) { this.filters.push(r => (r[col] ?? null) === v); return this }
        update(p: Row) { this.op = 'update'; this.payload = p; return this }
        insert(p: Row) { this.op = 'insert'; this.payload = p; return this }
        then(resolve: (v: any) => unknown, reject?: (e: any) => unknown) { return Promise.resolve(this.run()).then(resolve, reject) }
        run() {
            const rows = tables[this.table] ??= []
            if (this.op === 'insert') {
                const p = this.payload!
                if (this.table === COPIES_TABLE && rows.some(r => r.recording_id === p.recording_id || r.url === p.url)) {
                    return { data: null, error: { code: '23505', message: 'duplicate' } }
                }
                rows.push({
                    id: `copy-${nextId++}`, dropbox_path: null, job_id: null, size_bytes: null, dropbox_size: null,
                    attempts: 0, error: null, started_at: null, finished_at: null, created_at: new Date().toISOString(), ...p,
                })
                return { data: null, error: null }
            }
            const hit = rows.filter(r => this.filters.every(f => f(r)))
            if (this.op === 'update') hit.forEach(r => Object.assign(r, this.payload))
            return { data: hit.map(r => ({ ...r })), error: null }
        }
    }
    return { from: (t: string) => new Query(t) } as unknown as DbClient
}

// ---- Fake Dropbox: save_url jobs finish when told to.
function fakeDropbox(existing: Record<string, number>) {
    const files = new Map(Object.entries(existing).map(([p, size]) => [p.toLowerCase(), { path: p, size }]))
    const jobs = new Map<string, { path: string; size: number; state: 'in_progress' | 'complete' | 'failed' }>()
    let n = 0
    const saveUrlCalls: string[] = []
    const notFound = () => Object.assign(new Error('not found'), { error: { error_summary: 'path/not_found/..' } })
    const dbx = {
        filesListFolder: async ({ path }: { path: string }) => {
            const prefix = path.toLowerCase() + '/'
            const entries = [...files.values()].filter(f => f.path.toLowerCase().startsWith(prefix)).map(f => ({ '.tag': 'file', name: f.path.slice(path.length + 1) }))
            if (entries.length === 0 && ![...files.keys()].some(k => k.startsWith(prefix))) throw notFound()
            return { result: { entries, has_more: false, cursor: '' } }
        },
        filesListFolderContinue: async () => { throw new Error('unused') },
        filesGetMetadata: async ({ path }: { path: string }) => {
            const f = files.get(path.toLowerCase())
            if (!f) throw notFound()
            return { result: { '.tag': 'file', size: f.size, path_display: f.path } }
        },
        filesSaveUrl: async ({ path, url }: { path: string; url: string }) => {
            saveUrlCalls.push(url)
            const id = `job-${++n}`
            jobs.set(id, { path, size: sizes[url], state: 'in_progress' })
            return { result: { '.tag': 'async_job_id', async_job_id: id } }
        },
        filesSaveUrlCheckJobStatus: async ({ async_job_id }: { async_job_id: string }) => {
            const j = jobs.get(async_job_id)!
            if (j.state === 'complete') {
                files.set(j.path.toLowerCase(), { path: j.path, size: j.size })
                return { result: { '.tag': 'complete', size: j.size, path_display: j.path } }
            }
            if (j.state === 'failed') return { result: { '.tag': 'failed', failed: { '.tag': 'download_failed' } } }
            return { result: { '.tag': 'in_progress' } }
        },
    }
    return { dbx: dbx as any, jobs, files, saveUrlCalls }
}

const S2 = '22222222-2222-4222-8222-222222222222' // no Dropbox folder
const GUEST = 'guest'
const NOW = new Date('2026-11-18T20:00:00Z')
const stamp = (iso: string) => Date.parse(iso)
const rec = (id: string, student: string, startIso: string | null, stopIso: string, suffix = '') => ({
    id, student_id: student, created_at: stopIso, size_bytes: null, filename: '', teacher_id: '', kind: 'lesson',
    url: startIso ? `${R2}/${student}_${stamp(startIso)}${suffix}.mp4` : `${R2}/${student}_1773961666960_part1.mp4`,
})
// The piano camera alone (#792): stays in the classroom library, never copied.
const piano = {
    ...rec('r-piano', S1, '2026-11-16T17:00:00Z', '2026-11-16T17:52:30Z'),
    kind: 'piano',
    url: `${R2}/${S1}_${stamp('2026-11-16T17:00:00Z')}_piano-${stamp('2026-11-16T17:00:05Z')}.webm`,
}
const recordings = [
    rec('r-lesson', S1, '2026-11-16T17:00:00Z', '2026-11-16T17:52:00Z'),          // 52 min: copy
    rec('r-same-day', S1, '2026-11-16T19:00:00Z', '2026-11-16T19:40:00Z'),        // same day: " (2)"
    rec('r-noshow', S1, '2026-11-17T17:00:00Z', '2026-11-17T17:03:00Z'),          // 3 min: skip
    rec('r-nofolder', S2, '2026-11-17T18:00:00Z', '2026-11-17T18:45:00Z'),        // no folder: skip, listed
    rec('r-guest', GUEST, '2026-11-17T18:00:00Z', '2026-11-17T18:45:00Z'),        // guest id: skip
    rec('r-old', S1, null, '2026-11-10T23:08:58Z'),                               // no stamp, big: copy
    rec('r-empty', S1, '2026-11-12T01:17:17Z', '2026-11-12T01:23:36Z'),           // 6 min but 6 MB: skip
]
const sizes: Record<string, number> = {
    [recordings[0].url]: 1_002_792_113,
    [recordings[1].url]: 800_000_000,
    [recordings[5].url]: 358_705_900,
    [recordings[6].url]: 6_645_798,
}
const folder = '/Lesson Recordings/Student One Recordings'

async function main() {
    const db = fakeDb({
        classroom_recordings: [...recordings, piano].map(r => ({ ...r })),
        profiles: [
            { id: S1, role: 'student', name: 'Student One', dropbox_recording_folder: 'Student One Recordings' },
            { id: S2, role: 'student', dropbox_recording_folder: null },
        ],
        [COPIES_TABLE]: [],
    })
    // The Zoom video of the same day is already there and must not be touched.
    const box = fakeDropbox({ [`${folder}/2026-11-16 - Lesson.mp4`]: 500_000_000 })
    const headSize = async (url: string) => sizes[url] ?? null
    // The studio emails (#952), captured; a send can be made to fail.
    const emails: CopyAlertEmail[] = []
    let sendWorks = true
    const alert = async (email: CopyAlertEmail) => {
        if (!sendWorks) return false
        emails.push(email)
        return true
    }
    const run = (extra: Partial<Parameters<typeof syncClassroomDropboxCopies>[0]> = {}) =>
        syncClassroomDropboxCopies({ client: db, dbx: box.dbx, headSize, now: NOW, days: 14, alert, ...extra })

    // Dry run: the plan, nothing queued or started.
    const dry = await run({ dryRun: true })
    assert.deepEqual(dry.started.map(s => s.path).sort(), [
        `${folder}/2026-11-10 - Classroom Lesson.mp4`,
        `${folder}/2026-11-16 - Classroom Lesson (2).mp4`,
        `${folder}/2026-11-16 - Classroom Lesson.mp4`,
    ])
    assert.deepEqual(dry.noFolder, [S2])
    assert.ok(dry.skipped.some(s => s.recordingId === 'r-noshow' && /under 5 min/.test(s.reason)))
    assert.ok(!dry.skipped.some(s => s.recordingId === 'r-guest'), 'guest ids are dropped before anything else')
    assert.ok(dry.skipped.some(s => s.recordingId === 'r-empty' && /too small/.test(s.reason)))
    assert.equal(box.saveUrlCalls.length, 0)
    assert.ok(!dry.skipped.some(s => s.recordingId === 'r-piano'), 'piano-camera files are not even looked at')

    // First run: three queued and three Dropbox jobs started.
    const first = await run()
    assert.equal(first.queued, 4, 'the small one is queued, then marked skipped once its size is known')
    assert.ok(first.skipped.some(s => s.recordingId === 'r-empty'))
    assert.equal(first.started.length, 3)
    assert.equal(box.saveUrlCalls.length, 3)
    assert.equal(first.inProgress, 3)

    // Second run while Dropbox works: nothing new started, all still running.
    const second = await run()
    assert.equal(second.queued, 0)
    assert.equal(second.started.length, 0)
    assert.equal(second.inProgress, 3)
    assert.equal(box.saveUrlCalls.length, 3, 'never a second copy of a file')

    // Jobs finish: one with the right size, one short (size check fails), one failed transfer (retried).
    const jobs = [...box.jobs.entries()]
    const jobFor = (url: string) => jobs.find(([, j]) => j.size === sizes[url])!
    jobFor(recordings[0].url)[1].state = 'complete'
    const short = jobFor(recordings[1].url)[1]
    short.state = 'complete'
    short.size -= 1
    jobFor(recordings[5].url)[1].state = 'failed'
    sendWorks = false // the studio email can't go out this time
    const third = await run()
    sendWorks = true
    assert.deepEqual(third.alerted, [], 'a send that failed is not counted')
    assert.equal(emails.length, 0)
    assert.deepEqual(third.done.map(d => d.recordingId), ['r-lesson'])
    assert.equal(third.failed.length, 1)
    assert.match(third.failed[0].error, /size mismatch/)
    const copies = (await db.from(COPIES_TABLE).select()) as any
    const byRec = (id: string) => copies.data.find((c: any) => c.recording_id === id)
    assert.equal(byRec('r-lesson').status, 'done')
    assert.equal(byRec('r-lesson').dropbox_size, sizes[recordings[0].url])
    assert.equal(byRec('r-same-day').status, 'failed')
    assert.equal(byRec('r-old').status, 'pending', 'a failed transfer goes back in the queue')
    assert.equal(byRec('r-same-day').alerted_at ?? null, null, 'the failed send left it to be emailed next run')

    // Next run retries the failed transfer at the same path, once, and emails
    // the studio about the copy that gave up (#952).
    const fourth = await run()
    assert.deepEqual(fourth.alerted, ['r-same-day'])
    assert.equal(emails.length, 1)
    assert.equal(emails[0].subject, 'Classroom video not copied to Dropbox: Student One, Mon, Nov 16, 2026')
    assert.ok(emails[0].lines.some(l => /size mismatch/.test(l)), 'names the error')
    assert.ok(emails[0].lines.some(l => l.includes('Student One')))
    assert.equal(fourth.started.length, 1)
    assert.equal(fourth.started[0].path, `${folder}/2026-11-10 - Classroom Lesson.mp4`)
    assert.equal(box.saveUrlCalls.length, 4)
    ;[...box.jobs.values()].at(-1)!.state = 'complete'
    const fifth = await run()
    assert.deepEqual(fifth.done.map(d => d.recordingId), ['r-old'])

    // Settled: later runs do nothing at all.
    const sixth = await run({ days: 400 })
    assert.equal(sixth.queued + sixth.started.length + sixth.done.length + sixth.inProgress, 0)
    assert.equal(box.saveUrlCalls.length, 4, "nothing copied again")
    assert.equal(box.files.get(`${folder}/2026-11-16 - lesson.mp4`.toLowerCase())?.size, 500_000_000, 'Zoom video untouched')
    assert.equal(emails.length, 1, 'never emailed twice for the same copy')
    const EM_DASH = String.fromCharCode(0x2014)
    assert.ok(!emails.some(e => e.subject.includes(EM_DASH) || e.lines.some(l => l.includes(EM_DASH)) || e.footer.includes(EM_DASH)))

    // ---- A copy Dropbox refuses three times: gives up on the third, one email.
    const R3 = rec('r-refused', S1, '2026-11-17T22:00:00Z', '2026-11-17T22:50:00Z')
    const db2 = fakeDb({
        classroom_recordings: [{ ...R3 }],
        profiles: [{ id: S1, role: 'student', name: 'Student One', dropbox_recording_folder: 'Student One Recordings' }],
        [COPIES_TABLE]: [],
    })
    const box2 = fakeDropbox({})
    box2.dbx.filesSaveUrl = async () => { throw Object.assign(new Error('refused'), { error: { error_summary: 'too_many_write_operations/..' } }) }
    const emails2: CopyAlertEmail[] = []
    const run2 = () => syncClassroomDropboxCopies({
        client: db2, dbx: box2.dbx, headSize: async () => 900_000_000, now: NOW, days: 14,
        alert: async (e) => { emails2.push(e); return true },
    })
    for (let i = 1; i <= 2; i++) {
        const r = await run2()
        assert.equal(r.failed.length, 0, `try ${i} goes back in the queue`)
        assert.equal(emails2.length, 0)
    }
    const third2 = await run2()
    assert.equal(third2.failed.length, 1, 'the third try gives up')
    assert.deepEqual(third2.alerted, ['r-refused'])
    assert.equal(emails2.length, 1)
    assert.equal(emails2[0].subject, 'Classroom video not copied to Dropbox: Student One, Tue, Nov 17, 2026')
    assert.ok(emails2[0].lines.some(l => /Gave up after 3 tries\. Error: save_url: too_many_write_operations/.test(l)), emails2[0].lines.join(' | '))
    await run2()
    await run2()
    assert.equal(emails2.length, 1, 'never emailed twice for the same copy')

    // A dry run never emails.
    const db3 = fakeDb({
        classroom_recordings: [],
        profiles: [],
        [COPIES_TABLE]: [{ id: 'c-x', recording_id: 'r-x', url: 'u', student_id: S1, status: 'failed', attempts: 3, error: 'e', alerted_at: null }],
    })
    let dryEmails = 0
    await syncClassroomDropboxCopies({ client: db3, dbx: fakeDropbox({}).dbx, now: NOW, dryRun: true, alert: async () => { dryEmails++; return true } })
    assert.equal(dryEmails, 0)

    console.log('classroom Dropbox copies: all checks passed')
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
