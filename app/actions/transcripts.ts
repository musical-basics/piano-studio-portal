'use server'

import { requireAdmin } from '@/lib/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDropboxClient } from '@/lib/zoom-recordings'
import {
    MAX_QUERY_LENGTH,
    searchTranscriptsCore,
    type TranscriptSearchAnswer,
    type TranscriptSegment,
} from '@/lib/transcript-search'

/**
 * Admin search over lesson transcripts (#954). Both actions use the service
 * key, so each checks the caller is the admin first (requireAdmin): a server
 * action can be called by anyone who has its id.
 */
export async function searchLessonTranscripts(query: string): Promise<TranscriptSearchAnswer | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    const q = (typeof query === 'string' ? query : '').trim()
    if (q.length < 2) return { error: 'Type a word or a phrase to look for' }
    if (q.length > MAX_QUERY_LENGTH) return { error: `Keep it under ${MAX_QUERY_LENGTH} characters` }
    try {
        return await searchTranscriptsCore(createAdminClient(), q)
    } catch (err: any) {
        console.error('[transcripts] search failed:', err?.message || err)
        return { error: 'The search did not work, try again' }
    }
}

export type OpenedTranscript = {
    /** A link that plays the recording (Dropbox, valid for 4 hours), or null. */
    url: string | null
    segments: TranscriptSegment[]
    /** Why there is no link, when there isn't one. */
    playError: string | null
}

/** One transcript in full, with a link that plays the recording it came from. */
export async function openLessonTranscript(id: string): Promise<OpenedTranscript | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Unknown transcript' }
    const admin = createAdminClient()
    const { data: row, error } = await admin
        .from('lesson_transcripts')
        .select('dropbox_path, video_path, lesson_id, segments')
        .eq('id', id)
        .maybeSingle()
    if (error || !row) return { error: 'That transcript is gone' }
    const { url, playError } = await transcribedRecordingLink(row)
    return { url, segments: (row.segments ?? []) as TranscriptSegment[], playError }
}

/**
 * Just the link that plays a transcribed recording (the Recordings view, #1916,
 * for a recording on no lesson's video): no transcript text.
 */
export async function transcriptRecordingLink(id: string): Promise<{ url: string } | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Unknown recording' }
    const { data: row, error } = await createAdminClient()
        .from('lesson_transcripts')
        .select('dropbox_path, video_path, lesson_id')
        .eq('id', id)
        .maybeSingle()
    if (error || !row) return { error: 'That recording is gone' }
    const { url, playError } = await transcribedRecordingLink(row)
    return url ? { url } : { error: playError || 'No recording to play' }
}

/**
 * The very recording that was transcribed, so the times line up: the meeting's
 * video, else the audio itself (a Dropbox link valid for 4 hours). The lesson's
 * own link is the fallback (it may be a different copy of the same lesson).
 */
async function transcribedRecordingLink(row: { dropbox_path: string; video_path: string | null; lesson_id: string | null }): Promise<{ url: string | null; playError: string | null }> {
    try {
        const res = await getDropboxClient().filesGetTemporaryLink({ path: row.video_path || row.dropbox_path })
        return { url: res.result.link, playError: null }
    } catch (err: any) {
        console.error('[transcripts] no Dropbox link:', err?.error?.error_summary || err?.message || err)
        if (row.lesson_id) {
            const { data: lesson } = await createAdminClient().from('lessons').select('video_url').eq('id', row.lesson_id).maybeSingle()
            if (lesson?.video_url) return { url: lesson.video_url as string, playError: null }
        }
        return { url: null, playError: 'The recording is no longer in Dropbox' }
    }
}
