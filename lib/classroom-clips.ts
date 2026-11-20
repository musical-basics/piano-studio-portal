import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Dropbox } from 'dropbox'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { getDropboxClient } from '@/lib/zoom-recordings'
import { classroomCopyDate } from '@/lib/classroom-dropbox-copies'
export { isClipName } from '@/lib/classroom-dropbox-copies'
import { LESSON_KIND } from '@/lib/classroom-recordings'
import { playableVideoUrl } from '@/lib/classroom-video-url'
import { runFfmpeg } from '@/lib/ffmpeg'

/**
 * Clips from a classroom recording (Lionel's #1094): in the admin Classroom
 * recordings player he marks a start and an end, and a 15 to 45 second video
 * is cut on the server (ffmpeg, lib/ffmpeg.ts, reading only that stretch of the
 * file from R2 or from Dropbox for a moved video) and saved to the student's
 * Dropbox folder as "YYYY-MM-DD - Clip 12m30s.mp4" (the recording's date and
 * where the clip starts; Dropbox adds " (1)" when the name is taken).
 *
 * Re-encoded (H.264 and AAC, at most 1280 pixels wide, fast start) so it starts
 * exactly where marked and plays anywhere. Families are not emailed: the
 * new-recordings cron and the organizer skip clip names (isClassroomCopyName).
 */

export const CLIP_MIN_SECONDS = 15
export const CLIP_MAX_SECONDS = 45
/** "2026-07-09 - Clip 12m30s.mp4" for a clip starting 750 s in. */
export function clipName(date: string, startSeconds: number): string {
    const s = Math.floor(startSeconds)
    return `${date} - Clip ${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s.mp4`
}

export type ClipResult = { success: true; path: string; name: string; seconds: number } | { error: string }

export async function makeClassroomClip(
    recordingId: string,
    startSeconds: number,
    endSeconds: number,
    opts: { client?: DbClient; dbx?: Dropbox; log?: (msg: string) => void } = {},
): Promise<ClipResult> {
    const supabase = opts.client ?? createAdminClient()
    const log = opts.log ?? (() => {})
    const start = Math.round(Number(startSeconds) * 10) / 10
    const seconds = Math.round((Number(endSeconds) - start) * 10) / 10
    if (!Number.isFinite(start) || start < 0) return { error: 'Pick a start point' }
    if (!Number.isFinite(seconds) || seconds < CLIP_MIN_SECONDS - 0.5 || seconds > CLIP_MAX_SECONDS + 0.5) {
        return { error: `A clip is ${CLIP_MIN_SECONDS} to ${CLIP_MAX_SECONDS} seconds; this one is ${Number.isFinite(seconds) ? Math.round(seconds) : '?'}` }
    }

    const { data: rec } = await supabase
        .from('classroom_recordings')
        .select('id, student_id, url, created_at, kind, r2_key')
        .eq('id', recordingId)
        .maybeSingle()
    if (!rec?.url) return { error: 'Recording not found' }
    if ((rec.kind || LESSON_KIND) !== LESSON_KIND) return { error: 'Clips are made from lesson recordings' }
    const { data: profile } = await supabase.from('profiles').select('dropbox_recording_folder').eq('id', rec.student_id).maybeSingle()
    const folder = profile?.dropbox_recording_folder as string | undefined
    if (!folder) return { error: 'This student has no Dropbox folder yet' }

    const name = clipName(classroomCopyDate(rec), start)
    const dir = await mkdtemp(path.join(tmpdir(), 'clip-'))
    const out = path.join(dir, 'clip.mp4')
    try {
        await runFfmpeg([
            '-ss', String(start), '-i', playableVideoUrl(rec.url), '-t', String(seconds),
            '-map', '0:v:0', '-map', '0:a:0?',
            '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', out,
        ], 240_000)
        const video = await readFile(out)
        if (video.length < 10_000) return { error: 'The clip came out empty (is the start past the end of the video?)' }
        const dbx = opts.dbx ?? getDropboxClient()
        const res = await dbx.filesUpload({ path: `/Lesson Recordings/${folder}/${name}`, contents: video, mode: { '.tag': 'add' }, autorename: true })
        const saved = res.result.path_display || res.result.path_lower || name
        log(`clip of ${rec.id} at ${start}s for ${seconds}s saved (${Math.round(video.length / 1e6)} MB)`)
        return { success: true, path: saved, name: saved.split('/').pop() || name, seconds }
    } catch (err) {
        const message = (err as any)?.error?.error_summary || (err instanceof Error ? err.message : String(err))
        return { error: `Could not make the clip: ${message}` }
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
}
