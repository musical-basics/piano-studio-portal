import { createAdminClient } from '@/lib/supabase/admin'
import { isClassroomVideoUrl } from '@/lib/classroom-video-url'

/**
 * #874: moments Lionel marked during a recorded classroom lesson (the "Mark"
 * button in the classroom, music-lesson-dashboard /api/recording/mark). Each is
 * stored against the lesson video's file name on R2, "<studentId>_<startMs>.mp4",
 * which is also the last part of lessons.video_url once the video is attached.
 * Shown under the video on the family's lesson page; tapping one jumps there.
 * A video older than 60 days moves to its Dropbox copy (#1020): its video_url is
 * then a Dropbox link and the file name is found through the library row's
 * r2_key.
 */
export type RecordingMarker = {
    id: string
    offset_seconds: number
    label: string | null
}

/** Classroom egress file names; Zoom (Dropbox) links never match. */
const CLASSROOM_KEY_RE = /^[^/]+_\d{13}\.mp4$/i

/** The marker key of a library row: its R2 file name, kept in r2_key once the video moved to Dropbox (#1020). */
export function recordingKeyOf(rec: { url: string; r2_key?: string | null }): string | null {
    if (rec.r2_key) return CLASSROOM_KEY_RE.test(rec.r2_key) ? rec.r2_key : null
    return recordingKeyFromUrl(rec.url)
}

/** Markers by recording key, in video order (the admin Classroom recordings tab, #1321). Service role. */
export async function getMarkersForKeys(keys: string[]): Promise<Record<string, RecordingMarker[]>> {
    const unique = [...new Set(keys.filter(Boolean))]
    if (unique.length === 0) return {}
    const { data, error } = await createAdminClient()
        .from('classroom_recording_markers')
        .select('id, recording_key, offset_seconds, label')
        .in('recording_key', unique)
        .order('offset_seconds', { ascending: true })
    if (error) {
        console.error('[recording-markers] could not read markers:', error.message)
        return {}
    }
    const byKey: Record<string, RecordingMarker[]> = {}
    for (const m of data || []) (byKey[m.recording_key] ||= []).push({ id: m.id, offset_seconds: m.offset_seconds, label: m.label })
    return byKey
}

/** The classroom recording's file name in a lesson's video_url, or null. */
export function recordingKeyFromUrl(url: string | null | undefined): string | null {
    if (!url) return null
    try {
        const last = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
        return CLASSROOM_KEY_RE.test(last) ? last : null
    } catch {
        return null
    }
}

/**
 * Markers for these lessons, by lesson id, in video order. The caller must only
 * pass lessons the viewer may see (the student page reads them with the family's
 * own session); the table itself is service-role only.
 */
export async function getMarkersForLessons(
    lessons: { id: string; video_url?: string | null }[],
): Promise<Record<string, RecordingMarker[]>> {
    let adminClient: ReturnType<typeof createAdminClient> | null = null
    const admin = () => (adminClient ??= createAdminClient())
    const keyToLessons = new Map<string, string[]>()
    const add = (key: string, lessonId: string) => keyToLessons.set(key, [...(keyToLessons.get(key) || []), lessonId])
    const moved: { id: string; url: string }[] = []
    for (const l of lessons) {
        const key = recordingKeyFromUrl(l.video_url)
        if (key) add(key, l.id)
        else if (l.video_url && isClassroomVideoUrl(l.video_url)) moved.push({ id: l.id, url: l.video_url })
    }
    if (moved.length > 0) {
        const { data: recs, error: movedError } = await admin()
            .from('classroom_recordings')
            .select('url, r2_key')
            .in('url', [...new Set(moved.map(m => m.url))])
            .not('r2_key', 'is', null)
        if (movedError) console.error('[recording-markers] could not read moved recordings:', movedError.message)
        const keyByUrl = new Map((recs || []).map(r => [r.url as string, r.r2_key as string]))
        for (const m of moved) {
            const key = keyByUrl.get(m.url)
            if (key && CLASSROOM_KEY_RE.test(key)) add(key, m.id)
        }
    }
    if (keyToLessons.size === 0) return {}

    const { data, error } = await admin()
        .from('classroom_recording_markers')
        .select('id, recording_key, offset_seconds, label')
        .in('recording_key', [...keyToLessons.keys()])
        .order('offset_seconds', { ascending: true })
    if (error) {
        console.error('[recording-markers] could not read markers:', error.message)
        return {}
    }

    const byLesson: Record<string, RecordingMarker[]> = {}
    for (const m of data || []) {
        for (const lessonId of keyToLessons.get(m.recording_key) || []) {
            ;(byLesson[lessonId] ||= []).push({ id: m.id, offset_seconds: m.offset_seconds, label: m.label })
        }
    }
    return byLesson
}

