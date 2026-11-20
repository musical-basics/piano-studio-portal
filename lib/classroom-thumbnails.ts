import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { LESSON_KIND, recordingMinutes } from '@/lib/classroom-recordings'
import { PRACTICE_BUCKET, putR2Object } from '@/lib/classroom-r2'
import { playableVideoUrl } from '@/lib/classroom-video-url'
import { runFfmpeg } from '@/lib/ffmpeg'

/**
 * A small picture of each classroom recording (Lionel's #1095), so the admin
 * Classroom recordings tab shows who and what at a glance. Made once per
 * recording by the hourly classroom-thumbnails cron: ffmpeg reads one frame
 * about a third of the way in (straight from R2, or from Dropbox for a video
 * moved there, using range requests, so it never downloads the whole lesson),
 * scales it to 320 pixels wide, and the JPEG (about 15 KB) goes to the studio's
 * private R2 bucket under classroom-thumbnails/. The tab shows it through an
 * hour-long signed link (listClassroomRecordingsForAdmin). A recording that fails 3 times is left without one.
 */

export const THUMBNAIL_PREFIX = 'classroom-thumbnails/'
const MAX_TRIES = 3
const PER_RUN = 8

type Row = { id: string; url: string; created_at: string; r2_key: string | null; thumbnail_tries: number | null }

/** Where to take the picture: a third of the way in, at most 5 minutes; 20 s when the length is unknown. */
export function thumbnailSecond(minutes: number | null): number {
    if (minutes === null || !(minutes > 0)) return 20
    return Math.max(1, Math.min(300, Math.round(minutes * 60 / 3)))
}

/** One frame of the video as a 320px JPEG. Tries near the start when the first point is past the end. */
export async function grabFrame(videoUrl: string, second: number): Promise<Buffer> {
    const dir = await mkdtemp(path.join(tmpdir(), 'thumb-'))
    const out = path.join(dir, 'frame.jpg')
    try {
        for (const at of second > 2 ? [second, 1] : [second]) {
            await runFfmpeg(['-ss', String(at), '-i', videoUrl, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', '-y', out], 90_000)
            const jpg = await readFile(out).catch(() => null)
            if (jpg && jpg.length > 0) return jpg
        }
        throw new Error('no frame came out')
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
}

export type ThumbnailRun = { made: string[]; failed: { id: string; error: string }[]; left: number }

export async function makeClassroomThumbnails(opts: {
    client?: DbClient
    limit?: number
    /** Only these recordings (tests). */
    ids?: string[]
    log?: (msg: string) => void
    store?: (key: string, jpg: Buffer) => Promise<void>
} = {}): Promise<ThumbnailRun> {
    const supabase = opts.client ?? createAdminClient()
    const log = opts.log ?? (() => {})
    const store = opts.store ?? ((key: string, jpg: Buffer) => putR2Object(PRACTICE_BUCKET, key, jpg, 'image/jpeg'))
    const limit = opts.limit ?? PER_RUN

    let query = supabase
        .from('classroom_recordings')
        .select('id, url, created_at, r2_key, thumbnail_tries', { count: 'exact' })
        .eq('kind', LESSON_KIND)
        .is('thumbnail_key', null)
        .lt('thumbnail_tries', MAX_TRIES)
        .order('created_at', { ascending: false })
        .limit(limit)
    if (opts.ids) query = query.in('id', opts.ids)
    const { data, error, count } = await query
    if (error) throw new Error(`classroom_recordings query failed: ${error.message}`)
    const rows = (data || []) as Row[]
    const result: ThumbnailRun = { made: [], failed: [], left: Math.max(0, (count ?? rows.length) - rows.length) }

    for (const rec of rows) {
        try {
            const jpg = await grabFrame(playableVideoUrl(rec.url), thumbnailSecond(recordingMinutes(rec)))
            const key = `${THUMBNAIL_PREFIX}${rec.id}.jpg`
            await store(key, jpg)
            const { error: upError } = await supabase.from('classroom_recordings').update({ thumbnail_key: key }).eq('id', rec.id)
            if (upError) throw new Error(`row update failed: ${upError.message}`)
            result.made.push(rec.id)
            log(`thumbnail for ${rec.id} (${Math.round(jpg.length / 1024)} KB)`)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            await supabase.from('classroom_recordings').update({ thumbnail_tries: (rec.thumbnail_tries ?? 0) + 1 }).eq('id', rec.id)
            result.failed.push({ id: rec.id, error: message })
            log(`no thumbnail for ${rec.id}: ${message}`)
        }
    }
    return result
}
