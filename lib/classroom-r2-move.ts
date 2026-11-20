import type { Dropbox } from 'dropbox'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { getDropboxClient, getOrCreateSharedLink, MIN_LESSON_RECORDING_MINUTES } from '@/lib/zoom-recordings'
import { COPIES_TABLE } from '@/lib/classroom-dropbox-copies'
import { LESSON_KIND, MIN_BYTES_WITHOUT_START, recordingMinutes, UUID_RE } from '@/lib/classroom-recordings'
import { liveR2, r2KeyFromUrl, RECORDINGS_BUCKET, type R2Api } from '@/lib/classroom-r2'
import { isR2VideoUrl } from '@/lib/classroom-video-url'

/**
 * Old classroom videos move from Cloudflare R2 to their Dropbox copy (Lionel's
 * #1020): R2's free tier is 10 GB and each lesson adds 0.5 to 1.3 GB, while
 * every lesson video already has a copy in the student's Dropbox folder (#726,
 * lib/classroom-dropbox-copies.ts). Once a day, for each recording saved more
 * than 60 days ago that is still on R2:
 *
 *   1. its Dropbox copy must be finished (copy row 'done') and the file at that
 *      path must be exactly the R2 file's size; otherwise nothing changes;
 *   2. a Dropbox share link is made (or the existing one reused);
 *   3. the library row's url, every lesson whose video_url was the R2 link and
 *      any piano-camera row pointing at it switch to the share link; the row
 *      keeps the R2 file name in r2_key (start time, markers) and gets
 *      moved_to_dropbox_at;
 *   4. only when no row points at the R2 link any more is the R2 file deleted.
 *
 * Never deletes without a verified copy. A lesson-length recording with no copy
 * row yet (older than the copy job's 14-day look-back) is queued for Dropbox
 * and moves on a later run. Kept on R2 and listed: no-shows (under 5 minutes),
 * files too small for a copy, piano-camera videos (#792, never copied), guests
 * and students without a Dropbox folder, and any copy that failed or no longer
 * matches. A run that stopped between the switch and the delete is finished by
 * the next run. Families are never emailed; their Play button keeps working
 * (components/video-player.tsx plays Dropbox share links).
 */

export const MOVE_AFTER_DAYS = 60
/** Moves per run; the rest wait for the next day. */
const MOVES_PER_RUN = 25
const DAY_MS = 24 * 60 * 60 * 1000

type RecRow = {
    id: string
    student_id: string
    url: string
    created_at: string
    size_bytes: number | null
    kind: string | null
    r2_key: string | null
    moved_to_dropbox_at: string | null
}
type CopyRow = { recording_id: string; url: string; status: string; dropbox_path: string | null; size_bytes: number | null; error: string | null }

export type MovedItem = { recordingId: string; key: string; bytes: number; dropboxPath: string; lessonIds: string[]; link: string | null }
export type KeptItem = { recordingId: string; key: string; bytes: number | null; reason: string; problem: boolean }

export type MoveResult = {
    dryRun: boolean
    /** Saved before this moves (ISO). */
    cutoff: string
    /** Moved this run (dry run: would move). */
    moved: MovedItem[]
    movedBytes: number
    /** R2 files of recordings moved on an earlier run, deleted now (that run stopped before the delete). */
    finished: { recordingId: string; key: string; bytes: number }[]
    /** Copies queued for Dropbox this run; they move once copied. */
    queued: { recordingId: string; key: string }[]
    /** Left on R2, with why. problem = something to look at (not by design). */
    kept: KeptItem[]
}

export type MoveOptions = {
    client?: DbClient
    dbx?: Dropbox
    r2?: R2Api
    bucket?: string
    dryRun?: boolean
    /** Move recordings saved more than this many days ago. Default 60. */
    days?: number
    limit?: number
    now?: Date
    log?: (msg: string) => void
}

function dropboxError(err: any): string {
    const summary = err?.error?.error_summary ?? err?.error?.error ?? err?.message ?? err
    return typeof summary === 'string' ? summary : JSON.stringify(summary)
}

async function dropboxSize(dbx: Dropbox, path: string): Promise<{ size: number; path: string } | null> {
    try {
        const res = await dbx.filesGetMetadata({ path })
        const meta = res.result as any
        if (meta['.tag'] !== 'file') return null
        return { size: Number(meta.size), path: meta.path_display || path }
    } catch (err) {
        if (dropboxError(err).includes('not_found')) return null
        throw err
    }
}

/** The share link already on the file, if any (dry runs never make one). */
async function existingLink(dbx: Dropbox, path: string): Promise<string | null> {
    try {
        const res = await dbx.sharingListSharedLinks({ path, direct_only: true })
        return res.result.links?.[0]?.url ?? null
    } catch {
        return null
    }
}

/** Rows that still point at the R2 link (must be none before the file goes). */
async function stillPointingAt(supabase: DbClient, url: string): Promise<string[]> {
    const where: string[] = []
    const [lessons, recs, piano] = await Promise.all([
        supabase.from('lessons').select('id').eq('video_url', url).limit(5),
        supabase.from('classroom_recordings').select('id').eq('url', url).limit(5),
        supabase.from('classroom_recordings').select('id').eq('lesson_recording_url', url).limit(5),
    ])
    for (const [name, res] of [['lesson', lessons], ['library row', recs], ['piano-camera row', piano]] as const) {
        if (res.error) throw new Error(`${name} lookup failed: ${res.error.message}`)
        for (const r of res.data || []) where.push(`${name} ${r.id}`)
    }
    return where
}

/** Points every row that used the R2 link at the Dropbox link. Returns the lessons switched. */
async function switchLinks(supabase: DbClient, from: string, to: string): Promise<string[]> {
    const { data: lessons, error: lessonError } = await supabase
        .from('lessons').update({ video_url: to }).eq('video_url', from).select('id')
    if (lessonError) throw new Error(`lessons update failed: ${lessonError.message}`)
    const { error: pianoError } = await supabase
        .from('classroom_recordings').update({ lesson_recording_url: to }).eq('lesson_recording_url', from)
    if (pianoError) throw new Error(`piano-camera rows update failed: ${pianoError.message}`)
    return (lessons || []).map(l => l.id as string)
}

export async function moveOldClassroomVideos(opts: MoveOptions = {}): Promise<MoveResult> {
    const supabase = opts.client ?? createAdminClient()
    const r2 = opts.r2 ?? liveR2
    const bucket = opts.bucket ?? RECORDINGS_BUCKET
    const log = opts.log ?? (() => {})
    const now = opts.now ?? new Date()
    const dryRun = !!opts.dryRun
    const limit = opts.limit ?? MOVES_PER_RUN
    const cutoff = new Date(now.getTime() - (opts.days ?? MOVE_AFTER_DAYS) * DAY_MS).toISOString()
    let dbxClient = opts.dbx ?? null
    const dbx = () => (dbxClient ??= getDropboxClient())
    const result: MoveResult = { dryRun, cutoff, moved: [], movedBytes: 0, finished: [], queued: [], kept: [] }
    const keep = (rec: RecRow, key: string, bytes: number | null, reason: string, problem = false) => {
        result.kept.push({ recordingId: rec.id, key, bytes, reason, problem })
        log(`kept ${key}: ${reason}`)
    }

    const { data: recRows, error: recError } = await supabase
        .from('classroom_recordings')
        .select('id, student_id, url, created_at, size_bytes, kind, r2_key, moved_to_dropbox_at')
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true })
    if (recError) throw new Error(`classroom_recordings query failed: ${recError.message}`)
    const recordings = (recRows || []) as RecRow[]
    if (recordings.length === 0) return result

    const { data: copyRows, error: copyError } = await supabase
        .from(COPIES_TABLE)
        .select('recording_id, url, status, dropbox_path, size_bytes, error')
        .in('recording_id', recordings.map(r => r.id))
    if (copyError) throw new Error(`${COPIES_TABLE} query failed: ${copyError.message}`)
    const copyOf = new Map(((copyRows || []) as CopyRow[]).map(c => [c.recording_id, c]))

    const studentIds = [...new Set(recordings.map(r => r.student_id).filter(id => UUID_RE.test(id || '')))]
    const folderOf = new Map<string, string | null>()
    if (studentIds.length > 0) {
        const { data, error } = await supabase.from('profiles').select('id, role, dropbox_recording_folder').in('id', studentIds)
        if (error) throw new Error(`profiles query failed: ${error.message}`)
        for (const p of data || []) folderOf.set(p.id, p.role === 'student' ? p.dropbox_recording_folder : null)
    }

    /** The Dropbox copy, checked against the R2 size; a reason when it does not qualify. */
    const verifiedCopy = async (copy: CopyRow | undefined, r2Size: number | null): Promise<{ path: string; size: number } | { reason: string; problem: boolean }> => {
        if (!copy) return { reason: 'no Dropbox copy', problem: false }
        if (copy.status !== 'done' || !copy.dropbox_path) {
            return { reason: `Dropbox copy is ${copy.status}${copy.error ? ` (${copy.error})` : ''}`, problem: copy.status === 'failed' }
        }
        const meta = await dropboxSize(dbx(), copy.dropbox_path)
        if (!meta) return { reason: `Dropbox copy not found at ${copy.dropbox_path}`, problem: true }
        const expected = r2Size ?? (copy.size_bytes !== null ? Number(copy.size_bytes) : null)
        if (expected === null) return { reason: 'R2 size unknown, cannot check the copy', problem: true }
        if (meta.size !== expected) return { reason: `Dropbox copy is ${meta.size} bytes, R2 has ${expected}`, problem: true }
        return meta
    }

    let moves = 0
    for (const rec of recordings) {
        // ---- Moved on an earlier run: make sure its R2 file is gone.
        if (rec.moved_to_dropbox_at && rec.r2_key) {
            const size = await r2.objectSize(bucket, rec.r2_key)
            if (size === null) continue
            const copy = copyOf.get(rec.id)
            const ok = await verifiedCopy(copy, size)
            if ('reason' in ok) {
                keep(rec, rec.r2_key, size, `moved, but the R2 file stays: ${ok.reason}`, true)
                continue
            }
            if (dryRun) {
                result.finished.push({ recordingId: rec.id, key: rec.r2_key, bytes: size })
                continue
            }
            const oldUrl = copy!.url
            await switchLinks(supabase, oldUrl, rec.url)
            const left = await stillPointingAt(supabase, oldUrl)
            if (left.length) {
                keep(rec, rec.r2_key, size, `moved, but still linked from ${left.join(', ')}`, true)
                continue
            }
            await r2.deleteObject(bucket, rec.r2_key)
            result.finished.push({ recordingId: rec.id, key: rec.r2_key, bytes: size })
            log(`deleted ${rec.r2_key} from R2 (moved earlier)`)
            continue
        }

        if (!isR2VideoUrl(rec.url)) continue
        const key = r2KeyFromUrl(rec.url)
        if (!key) continue
        if (moves >= limit) {
            keep(rec, key, rec.size_bytes, 'per-run limit, next run')
            continue
        }

        const size = await r2.objectSize(bucket, key)
        const copy = copyOf.get(rec.id)

        if (!copy) {
            const minutes = recordingMinutes(rec)
            const bytes = size ?? (rec.size_bytes ? Number(rec.size_bytes) : null)
            if (rec.kind && rec.kind !== LESSON_KIND) { keep(rec, key, bytes, 'piano-camera video, never copied to Dropbox'); continue }
            if (!UUID_RE.test(rec.student_id || '') || !folderOf.has(rec.student_id)) { keep(rec, key, bytes, 'not a student (guest or test)'); continue }
            if (!folderOf.get(rec.student_id)) { keep(rec, key, bytes, 'student has no Dropbox folder', true); continue }
            if (minutes !== null && minutes < MIN_LESSON_RECORDING_MINUTES) { keep(rec, key, bytes, `no-show, under ${MIN_LESSON_RECORDING_MINUTES} min`); continue }
            if (size === null) { keep(rec, key, bytes, 'not in the R2 bucket and no Dropbox copy', true); continue }
            if (size < MIN_BYTES_WITHOUT_START) { keep(rec, key, size, `too small for a Dropbox copy (${Math.round(size / 1e6)} MB)`); continue }
            // Lesson-length, never queued (older than the copy job looks): queue it now.
            if (!dryRun) {
                const { error } = await supabase.from(COPIES_TABLE).insert({ recording_id: rec.id, url: rec.url, student_id: rec.student_id, status: 'pending' })
                if (error && error.code !== '23505') { keep(rec, key, size, `could not queue a Dropbox copy: ${error.message}`, true); continue }
            }
            result.queued.push({ recordingId: rec.id, key })
            log(`${dryRun ? '[dry run] would queue' : 'queued'} a Dropbox copy of ${key}; it moves once copied`)
            continue
        }

        const ok = await verifiedCopy(copy, size)
        if ('reason' in ok) {
            keep(rec, key, size, ok.reason, ok.problem)
            continue
        }
        const bytes = size ?? 0
        moves++

        if (dryRun) {
            const { data: on } = await supabase.from('lessons').select('id').eq('video_url', rec.url)
            const link = await existingLink(dbx(), ok.path)
            result.moved.push({ recordingId: rec.id, key, bytes, dropboxPath: ok.path, lessonIds: (on || []).map(l => l.id as string), link })
            result.movedBytes += bytes
            log(`[dry run] would move ${key} (${(bytes / 1e9).toFixed(2)} GB) to ${ok.path}${link ? '' : ' (new share link)'}`)
            continue
        }

        let link: string
        try {
            link = await getOrCreateSharedLink(dbx(), ok.path)
        } catch (err) {
            keep(rec, key, size, `could not make a Dropbox share link: ${dropboxError(err)}`, true)
            continue
        }

        // Switch the library row first (only if it still points at R2), then the lessons.
        const { data: switched, error: switchError } = await supabase
            .from('classroom_recordings')
            .update({ url: link, r2_key: key, moved_to_dropbox_at: now.toISOString(), ...(rec.size_bytes ? {} : { size_bytes: bytes }) })
            .eq('id', rec.id)
            .eq('url', rec.url)
            .select('id')
        if (switchError) { keep(rec, key, size, `library row update failed: ${switchError.message}`, true); continue }
        if (!switched || switched.length === 0) { keep(rec, key, size, 'library row changed meanwhile'); continue }
        const lessonIds = await switchLinks(supabase, rec.url, link)

        if (size !== null) {
            const left = await stillPointingAt(supabase, rec.url)
            if (left.length) {
                keep(rec, key, size, `moved, but the R2 file stays: still linked from ${left.join(', ')}`, true)
                continue
            }
            await r2.deleteObject(bucket, key)
        }
        result.moved.push({ recordingId: rec.id, key, bytes, dropboxPath: ok.path, lessonIds, link })
        result.movedBytes += bytes
        log(`moved ${key} (${(bytes / 1e9).toFixed(2)} GB) to ${ok.path}; ${lessonIds.length} lesson link(s) switched`)
    }

    return result
}
