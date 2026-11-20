/**
 * Self-check for the weekly classroom library check (#1018,
 * lib/classroom-library-check.ts): which R2 files count as lesson videos, that a
 * missing one is added and put on its lesson only when the lesson has no video
 * (never logged), that its Dropbox copy is queued, that a dry run writes
 * nothing, and that it emails only when it found something. In-memory database
 * and fake R2: no network, nothing sent.
 *
 *   npx tsx scripts/check_classroom_library_check.ts
 */
import assert from 'node:assert/strict'
import { checkClassroomLibrary, notLessonLength, parseLessonFile } from '../lib/classroom-library-check'
import { COPIES_TABLE } from '../lib/classroom-dropbox-copies'
import type { R2Api, R2Object } from '../lib/classroom-r2'
import type { DbClient } from '../lib/supabase/admin'

const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'
const R2 = 'https://pub-example.r2.dev'
const ms = (iso: string) => Date.parse(iso)
const obj = (key: string, size: number, savedIso: string): R2Object => ({ key, size, lastModified: savedIso })

// ---- Names and lengths.
const egress = parseLessonFile(obj(`${S1}_${ms('2026-07-02T23:45:00Z')}.mp4`, 50e6, '2026-07-03T00:07:00Z'))!
assert.equal(egress.studentId, S1)
assert.equal(Math.round(egress.minutes!), 22)
assert.equal(notLessonLength(egress), null)
assert.equal(parseLessonFile(obj(`${S1}_${ms('2026-07-02T23:45:00Z')}_piano-${ms('2026-07-02T23:46:00Z')}.webm`, 9e8, '2026-07-03T00:07:00Z')), null)
assert.equal(parseLessonFile(obj('EG_abc.json', 300, '2026-07-03T00:07:00Z')), null)
assert.equal(parseLessonFile(obj('DreamPlay Hero 720p Video Hero 1 Loop (Top Hero).mp4', 4e6, '2026-03-07T13:31:01Z')), null)
const old = parseLessonFile(obj(`${S1}_1773961666960_part1.mp4`, 359e6, '2026-03-19T23:08:57Z'))!
assert.equal(old.minutes, null) // the old recorder stamped the upload, not the start
assert.equal(notLessonLength(old), null) // 100 MB or more
assert.match(notLessonLength(parseLessonFile(obj(`${S1}_1773961666960.webm`, 3e6, '2026-03-19T23:08:57Z'))!)!, /only 3 MB/)
assert.match(notLessonLength(parseLessonFile(obj(`${S1}_${ms('2026-07-04T18:13:43Z')}.mp4`, 36e6, '2026-07-04T18:15:30Z'))!)!, /no-show/)
assert.match(notLessonLength(parseLessonFile(obj(`${S1}_${ms('2026-07-04T18:00:00Z')}.mp4`, 300e6, '2026-07-04T18:12:00Z'))!)!, /12 min, under 20/)

// ---- A tiny in-memory PostgREST stand-in.
type Row = Record<string, any>
function fakeDb(tables: Record<string, Row[]>) {
    let n = 1
    class Query {
        filters: ((r: Row) => boolean)[] = []
        op: 'select' | 'update' | 'insert' = 'select'
        payload: Row | null = null
        single = false
        constructor(private table: string) {}
        select() { return this }
        limit() { return this }
        eq(col: string, v: any) { this.filters.push(r => r[col] === v); return this }
        gte(col: string, v: any) { this.filters.push(r => r[col] >= v); return this }
        lte(col: string, v: any) { this.filters.push(r => r[col] <= v); return this }
        in(col: string, vs: any[]) { this.filters.push(r => vs.includes(r[col])); return this }
        is(col: string, v: null) { this.filters.push(r => (r[col] ?? null) === v); return this }
        ilike(col: string, pattern: string) {
            const re = new RegExp(`^${pattern.split('%').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i')
            this.filters.push(r => re.test(String(r[col] ?? '')))
            return this
        }
        maybeSingle() { this.single = true; return this }
        update(p: Row) { this.op = 'update'; this.payload = p; return this }
        insert(p: Row) { this.op = 'insert'; this.payload = p; return this }
        then(resolve: (v: any) => unknown, reject?: (e: any) => unknown) { return Promise.resolve(this.run()).then(resolve, reject) }
        run() {
            const rows = tables[this.table] ??= []
            if (this.op === 'insert') {
                rows.push({ id: `${this.table}-${n++}`, ...this.payload })
                return { data: null, error: null }
            }
            const hit = rows.filter(r => this.filters.every(f => f(r)))
            if (this.op === 'update') hit.forEach(r => Object.assign(r, this.payload))
            const data = hit.map(r => ({ ...r }))
            return { data: this.single ? (data[0] ?? null) : data, error: null }
        }
    }
    return { from: (t: string) => new Query(t) } as unknown as DbClient
}

function world() {
    // S1: lost hand-off on Jul 2 (lesson 20:45 EDT = 00:45Z, recording 00:55Z to 01:17Z), lesson has no video.
    // S2: a lost video whose lesson already has another video; plus a library row whose file is gone.
    const lost = `${S1}_${ms('2026-07-03T00:55:07Z')}.mp4`
    const other = `${S2}_${ms('2026-08-10T22:00:00Z')}.mp4`
    const known = `${S1}_${ms('2026-11-16T01:30:00Z')}.mp4`
    const objects: R2Object[] = [
        obj(lost, 50e6, '2026-07-03T01:17:14Z'),
        obj(other, 900e6, '2026-08-10T22:58:00Z'),
        obj(known, 700e6, '2026-11-16T02:10:00Z'),
        obj(`${S1}_${ms('2026-07-04T18:13:43Z')}.mp4`, 36e6, '2026-07-04T18:15:30Z'), // no-show
        obj(`guest_${ms('2026-07-04T18:00:00Z')}.mp4`, 900e6, '2026-07-04T19:00:00Z'), // guest
        obj('EG_x.json', 100, '2026-07-04T19:00:00Z'),
    ]
    const tables: Record<string, Row[]> = {
        classroom_recordings: [
            { id: 'known', student_id: S1, url: `${R2}/${known}`, created_at: '2026-11-16T02:10:00Z', r2_key: null, moved_to_dropbox_at: null },
            { id: 'gone', student_id: S2, url: `${R2}/${S2}_${ms('2026-10-01T22:00:00Z')}.mp4`, created_at: '2026-10-01T23:00:00Z', r2_key: null, moved_to_dropbox_at: null },
            { id: 'moved', student_id: S2, url: 'https://www.dropbox.com/scl/fi/x/2026-09-01-Classroom-Lesson.mp4?dl=0', created_at: '2026-09-01T23:00:00Z', r2_key: `${S2}_${ms('2026-09-01T22:00:00Z')}.mp4`, moved_to_dropbox_at: '2026-11-20T00:00:00Z' },
        ],
        [COPIES_TABLE]: [{ recording_id: 'known', url: `${R2}/${known}` }],
        lessons: [
            { id: 'l1', student_id: S1, date: '2026-07-02', time: '20:45:00', duration: 30, status: 'scheduled', video_url: null },
            { id: 'l2', student_id: S2, date: '2026-08-10', time: '18:00:00', duration: 60, status: 'completed', video_url: 'https://www.dropbox.com/zoom.mp4' },
        ],
        profiles: [
            { id: S1, name: 'Student One', role: 'student', dropbox_recording_folder: 'One' },
            { id: S2, name: 'Student Two', role: 'student', dropbox_recording_folder: null },
        ],
    }
    const r2: R2Api = { listObjects: async () => objects, objectSize: async () => null, deleteObject: async () => {} }
    return { tables, r2, lost, other }
}

async function main() {
    // Dry run: the plan, nothing written, nothing sent.
    {
        const w = world()
        const before = JSON.stringify(w.tables)
        const mails: unknown[] = []
        const res = await checkClassroomLibrary({ client: fakeDb(w.tables), r2: w.r2, dryRun: true, alert: async m => { mails.push(m); return true } })
        assert.deepEqual(res.added.map(a => a.key).sort(), [w.lost, w.other].sort())
        assert.equal(JSON.stringify(w.tables), before)
        assert.equal(mails.length, 0)
    }

    const w = world()
    const mails: { subject: string; lines: string[] }[] = []
    const res = await checkClassroomLibrary({ client: fakeDb(w.tables), r2: w.r2, alert: async m => { mails.push(m); return true } })

    // The lost Jul 2 video: added (dated when saved), on its lesson (video only), Dropbox copy queued.
    const added = w.tables.classroom_recordings.find(r => r.url === `${R2}/${w.lost}`)!
    assert.equal(added.created_at, '2026-07-03T01:17:14.000Z')
    assert.equal(added.kind, 'lesson')
    assert.equal(added.filename, 'Lesson - 7/2/2026')
    const l1 = w.tables.lessons.find(l => l.id === 'l1')!
    assert.equal(l1.video_url, `${R2}/${w.lost}`)
    assert.equal(l1.status, 'scheduled', 'the check must never log a lesson')
    assert.ok(w.tables[COPIES_TABLE].some(c => c.recording_id === added.id && c.status === 'pending'))

    // A lesson that already has a video keeps it; the student without a folder gets no copy queued.
    assert.equal(w.tables.lessons.find(l => l.id === 'l2')!.video_url, 'https://www.dropbox.com/zoom.mp4')
    const otherRow = w.tables.classroom_recordings.find(r => r.url === `${R2}/${w.other}`)!
    assert.ok(otherRow)
    assert.ok(!w.tables[COPIES_TABLE].some(c => c.recording_id === otherRow.id))
    assert.equal(res.added.find(a => a.key === w.other)!.lesson!.note, 'the lesson already has another video')

    // Ignored: the no-show and the guest. Missing: the row whose file is gone (the moved one is fine).
    assert.equal(res.added.length, 2)
    assert.deepEqual(res.missingFiles.map(m => m.recordingId), ['gone'])
    assert.ok(res.ignored.some(i => /no-show/.test(i.reason)))
    assert.ok(res.ignored.some(i => /guest/.test(i.reason)))

    // One email to the studio.
    assert.equal(mails.length, 1)
    assert.equal(mails[0].subject, '2 classroom videos found outside the recordings library')
    assert.ok(mails[0].lines.some(l => /Student One, recorded Thu, Jul 2, 2026 \(22 min\)/.test(l)))
    assert.ok(mails[0].lines.some(l => /File gone from R2: Student Two/.test(l)))

    // The next week: nothing new except the still-missing file, so the email is only about that.
    const again = await checkClassroomLibrary({ client: fakeDb(w.tables), r2: w.r2, alert: async m => { mails.push(m); return true } })
    assert.equal(again.added.length, 0)
    assert.equal(mails.length, 2)
    assert.equal(mails[1].subject, '1 classroom recording missing from R2')

    // Nothing found at all: no email.
    w.tables.classroom_recordings = w.tables.classroom_recordings.filter(r => r.id !== 'gone')
    const quiet = await checkClassroomLibrary({ client: fakeDb(w.tables), r2: w.r2, alert: async m => { mails.push(m); return true } })
    assert.equal(quiet.added.length + quiet.missingFiles.length, 0)
    assert.equal(mails.length, 2)

    console.log('check_classroom_library_check: all good')
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
