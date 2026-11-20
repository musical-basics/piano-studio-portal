/**
 * Self-check for moving old classroom videos from R2 to Dropbox (#1020,
 * lib/classroom-r2-move.ts): only a finished, same-size Dropbox copy lets a
 * video move; the library row, its lesson and any piano-camera row switch to
 * the share link; the R2 file goes only after that; the start stamp and the
 * marker key survive the move; nothing changes in a dry run. In-memory
 * database, fake Dropbox and R2: no network.
 *
 *   npx tsx scripts/check_classroom_r2_move.ts
 */
import assert from 'node:assert/strict'
import { moveOldClassroomVideos } from '../lib/classroom-r2-move'
import { COPIES_TABLE } from '../lib/classroom-dropbox-copies'
import { recordingMinutes, recordingStampMs } from '../lib/classroom-recordings'
import { isClassroomVideoUrl, isR2VideoUrl, playableVideoUrl } from '../lib/classroom-video-url'
import { r2KeyFromUrl, type R2Api } from '../lib/classroom-r2'
import type { DbClient } from '../lib/supabase/admin'

// ---- Links.
const R2 = 'https://pub-example.r2.dev'
const MOVED = 'https://www.dropbox.com/scl/fi/abc/2026-09-02-Classroom-Lesson.mp4?rlkey=k&dl=0'
const ZOOM = 'https://www.dropbox.com/scl/fi/def/2026-11-19-Lesson-85022603562.mp4?rlkey=k&dl=0'
assert.ok(isClassroomVideoUrl(`${R2}/s_1788368646118.mp4`))
assert.ok(isClassroomVideoUrl(MOVED))
assert.ok(isClassroomVideoUrl('https://www.dropbox.com/s/x/2026-09-02%20-%20Classroom%20Lesson%20(2).mp4?dl=0'))
assert.ok(!isClassroomVideoUrl(ZOOM))
assert.ok(!isClassroomVideoUrl(null))
assert.ok(isR2VideoUrl(`${R2}/a.mp4`) && !isR2VideoUrl(MOVED))
assert.equal(playableVideoUrl(MOVED), 'https://dl.dropboxusercontent.com/scl/fi/abc/2026-09-02-Classroom-Lesson.mp4?rlkey=k&raw=1')
assert.equal(playableVideoUrl(`${R2}/a.mp4`), `${R2}/a.mp4`)
assert.equal(r2KeyFromUrl(`${R2}/s_1788368646118.mp4`), 's_1788368646118.mp4')
assert.equal(r2KeyFromUrl(MOVED), null)
// A moved video keeps its start stamp (and so its length) through r2_key.
const start = Date.parse('2026-09-02T17:04:06Z')
assert.equal(recordingStampMs({ url: MOVED, r2_key: `s_${start}.mp4` }), start)
assert.equal(recordingStampMs({ url: MOVED }), null)
assert.equal(Math.round(recordingMinutes({ url: MOVED, r2_key: `s_${start}.mp4`, created_at: '2026-09-02T17:58:52Z' })!), 55)

// ---- A tiny in-memory PostgREST stand-in: just the calls the module makes.
type Row = Record<string, any>
function fakeDb(tables: Record<string, Row[]>) {
    class Query {
        filters: ((r: Row) => boolean)[] = []
        op: 'select' | 'update' | 'insert' = 'select'
        payload: Row | null = null
        constructor(private table: string) {}
        select() { return this }
        order() { return this }
        limit() { return this }
        eq(col: string, v: any) { this.filters.push(r => r[col] === v); return this }
        lt(col: string, v: any) { this.filters.push(r => r[col] < v); return this }
        in(col: string, vs: any[]) { this.filters.push(r => vs.includes(r[col])); return this }
        update(p: Row) { this.op = 'update'; this.payload = p; return this }
        insert(p: Row) { this.op = 'insert'; this.payload = p; return this }
        then(resolve: (v: any) => unknown, reject?: (e: any) => unknown) { return Promise.resolve(this.run()).then(resolve, reject) }
        run() {
            const rows = tables[this.table] ??= []
            if (this.op === 'insert') {
                rows.push({ ...this.payload })
                return { data: null, error: null }
            }
            const hit = rows.filter(r => this.filters.every(f => f(r)))
            if (this.op === 'update') hit.forEach(r => Object.assign(r, this.payload))
            return { data: hit.map(r => ({ ...r })), error: null }
        }
    }
    return { from: (t: string) => new Query(t) } as unknown as DbClient
}

function fakeDropbox(files: Record<string, number>) {
    const links: string[] = []
    const notFound = () => Object.assign(new Error('not found'), { error: { error_summary: 'path/not_found/..' } })
    return {
        links,
        dbx: {
            filesGetMetadata: async ({ path }: { path: string }) => {
                if (!(path in files)) throw notFound()
                return { result: { '.tag': 'file', size: files[path], path_display: path } }
            },
            sharingCreateSharedLinkWithSettings: async ({ path }: { path: string }) => {
                const name = path.split('/').pop()!.replace(/ /g, '-').replace(/-+/g, '-')
                const url = `https://www.dropbox.com/scl/fi/x${links.length}/${name}?rlkey=k&dl=0`
                links.push(url)
                return { result: { url } }
            },
            sharingListSharedLinks: async () => ({ result: { links: [] } }),
        } as any,
    }
}

function fakeR2(objects: Record<string, number>) {
    const deleted: string[] = []
    const r2: R2Api = {
        listObjects: async () => Object.entries(objects).map(([key, size]) => ({ key, size, lastModified: '' })),
        objectSize: async (_b, key) => (key in objects ? objects[key] : null),
        deleteObject: async (_b, key) => { deleted.push(key); delete objects[key] },
    }
    return { r2, deleted, objects }
}

const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-20T18:00:00Z')
const OLD = '2026-09-02T17:58:52Z'
const k = (s: string, iso: string) => `${s}_${Date.parse(iso) - 50 * 60_000}.mp4`
const GB = 1_000_000_000

function world() {
    const kGood = k(S1, OLD), kBad = k(S1, '2026-08-01T18:00:00Z'), kNoCopy = k(S2, '2026-07-01T18:00:00Z')
    const kNew = k(S1, '2026-11-16T18:00:00Z'), kShort = `${S1}_${Date.parse('2026-08-10T17:58:00Z')}.mp4`
    const recs: Row[] = [
        { id: 'r-good', student_id: S1, url: `${R2}/${kGood}`, created_at: OLD, size_bytes: GB, kind: 'lesson', r2_key: null, moved_to_dropbox_at: null, lesson_recording_url: null },
        { id: 'r-piano', student_id: S1, url: `${R2}/piano_${kGood}`, created_at: OLD, size_bytes: 5, kind: 'piano', r2_key: null, moved_to_dropbox_at: null, lesson_recording_url: `${R2}/${kGood}` },
        { id: 'r-bad', student_id: S1, url: `${R2}/${kBad}`, created_at: '2026-08-01T18:00:00Z', size_bytes: GB, kind: 'lesson', r2_key: null, moved_to_dropbox_at: null, lesson_recording_url: null },
        { id: 'r-nocopy', student_id: S2, url: `${R2}/${kNoCopy}`, created_at: '2026-07-01T18:00:00Z', size_bytes: GB, kind: 'lesson', r2_key: null, moved_to_dropbox_at: null, lesson_recording_url: null },
        { id: 'r-short', student_id: S1, url: `${R2}/${kShort}`, created_at: '2026-08-10T18:00:00Z', size_bytes: 9e6, kind: 'lesson', r2_key: null, moved_to_dropbox_at: null, lesson_recording_url: null },
        { id: 'r-new', student_id: S1, url: `${R2}/${kNew}`, created_at: '2026-11-16T18:00:00Z', size_bytes: GB, kind: 'lesson', r2_key: null, moved_to_dropbox_at: null, lesson_recording_url: null },
    ]
    const tables: Record<string, Row[]> = {
        classroom_recordings: recs,
        [COPIES_TABLE]: [
            { recording_id: 'r-good', url: `${R2}/${kGood}`, status: 'done', dropbox_path: '/Lesson Recordings/A/2026-09-02 - Classroom Lesson.mp4', size_bytes: GB, error: null },
            { recording_id: 'r-bad', url: `${R2}/${kBad}`, status: 'done', dropbox_path: '/Lesson Recordings/A/2026-08-01 - Classroom Lesson.mp4', size_bytes: GB, error: null },
            { recording_id: 'r-new', url: `${R2}/${kNew}`, status: 'done', dropbox_path: '/Lesson Recordings/A/2026-11-16 - Classroom Lesson.mp4', size_bytes: GB, error: null },
        ],
        lessons: [
            { id: 'l-good', video_url: `${R2}/${kGood}` },
            { id: 'l-bad', video_url: `${R2}/${kBad}` },
        ],
        profiles: [
            { id: S1, role: 'student', dropbox_recording_folder: 'A' },
            { id: S2, role: 'student', dropbox_recording_folder: 'B' },
        ],
    }
    const dropbox = fakeDropbox({
        '/Lesson Recordings/A/2026-09-02 - Classroom Lesson.mp4': GB,
        '/Lesson Recordings/A/2026-08-01 - Classroom Lesson.mp4': GB - 1, // short copy: must not move
        '/Lesson Recordings/A/2026-11-16 - Classroom Lesson.mp4': GB,
    })
    const r2 = fakeR2({ [kGood]: GB, [`piano_${kGood}`]: 5, [kBad]: GB, [kNoCopy]: GB, [kShort]: 9e6, [kNew]: GB })
    return { tables, dropbox, r2, kGood, kBad, kNoCopy, kShort, kNew }
}

async function main() {
    // ---- Dry run: the plan, nothing written, nothing deleted.
    {
        const w = world()
        const before = JSON.stringify(w.tables)
        const res = await moveOldClassroomVideos({ client: fakeDb(w.tables), dbx: w.dropbox.dbx, r2: w.r2.r2, dryRun: true, now: NOW })
        assert.deepEqual(res.moved.map(m => m.key), [w.kGood])
        assert.equal(res.movedBytes, GB)
        assert.deepEqual(res.moved[0].lessonIds, ['l-good'])
        assert.deepEqual(res.queued.map(q => q.key), [w.kNoCopy])
        assert.equal(JSON.stringify(w.tables), before, 'dry run wrote')
        assert.deepEqual(w.r2.deleted, [])
        assert.equal(w.dropbox.links.length, 0, 'dry run made a share link')
    }

    // ---- The real run.
    const w = world()
    const res = await moveOldClassroomVideos({ client: fakeDb(w.tables), dbx: w.dropbox.dbx, r2: w.r2.r2, now: NOW })
    const rec = (id: string) => w.tables.classroom_recordings.find(r => r.id === id)!
    const link = w.dropbox.links[0]
    assert.equal(w.dropbox.links.length, 1)
    assert.ok(isClassroomVideoUrl(link))

    // Moved: row, lesson and piano-camera row on the link; key and stamp kept; R2 file gone.
    assert.deepEqual(res.moved.map(m => m.key), [w.kGood])
    assert.equal(rec('r-good').url, link)
    assert.equal(rec('r-good').r2_key, w.kGood)
    assert.equal(rec('r-good').moved_to_dropbox_at, NOW.toISOString())
    assert.equal(w.tables.lessons.find(l => l.id === 'l-good')!.video_url, link)
    assert.equal(rec('r-piano').lesson_recording_url, link)
    assert.equal(recordingStampMs(rec('r-good') as { url: string; r2_key: string }), Date.parse(OLD) - 50 * 60_000)
    assert.deepEqual(w.r2.deleted, [w.kGood])

    // Copy one byte short: nothing changes, flagged as a problem.
    assert.equal(rec('r-bad').url.startsWith(R2), true)
    assert.equal(w.tables.lessons.find(l => l.id === 'l-bad')!.video_url.startsWith(R2), true)
    const bad = res.kept.find(x => x.recordingId === 'r-bad')!
    assert.ok(bad.problem && /bytes/.test(bad.reason))
    assert.ok(w.kBad in w.r2.objects)

    // No copy yet: queued for Dropbox, stays on R2.
    assert.deepEqual(res.queued.map(q => q.key), [w.kNoCopy])
    assert.ok(w.tables[COPIES_TABLE].some(c => c.recording_id === 'r-nocopy' && c.status === 'pending'))
    assert.ok(w.kNoCopy in w.r2.objects)

    // No-show and piano camera stay; recent video untouched.
    assert.ok(res.kept.some(x => x.recordingId === 'r-short' && /no-show/.test(x.reason)))
    assert.ok(res.kept.some(x => x.recordingId === 'r-piano' && /piano/.test(x.reason)))
    assert.ok(w.kNew in w.r2.objects && rec('r-new').url.startsWith(R2))

    // ---- A run that stopped before the delete: the next run deletes the R2 file.
    {
        const w2 = world()
        const db = fakeDb(w2.tables)
        await moveOldClassroomVideos({ client: db, dbx: w2.dropbox.dbx, r2: w2.r2.r2, now: NOW })
        w2.r2.objects[w2.kGood] = GB // as if the delete never happened
        const again = await moveOldClassroomVideos({ client: db, dbx: w2.dropbox.dbx, r2: w2.r2.r2, now: NOW })
        assert.deepEqual(again.finished.map(f => f.key), [w2.kGood])
        assert.ok(!(w2.kGood in w2.r2.objects))
        assert.equal(again.moved.length, 0)
    }

    console.log('check_classroom_r2_move: all good')
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
