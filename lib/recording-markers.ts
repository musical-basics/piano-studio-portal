import { createAdminClient } from '@/lib/supabase/admin'

/**
 * #874: moments Lionel marked during a recorded classroom lesson (the "Mark"
 * button in the classroom, music-lesson-dashboard /api/recording/mark). Each is
 * stored against the lesson video's file name on R2, "<studentId>_<startMs>.mp4",
 * which is also the last part of lessons.video_url once the video is attached.
 * Shown under the video on the family's lesson page; tapping one jumps there.
 */
export type RecordingMarker = {
    id: string
    offset_seconds: number
    label: string | null
}

/** Classroom egress file names; Zoom (Dropbox) links never match. */
const CLASSROOM_KEY_RE = /^[^/]+_\d{13}\.mp4$/i

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
    const keyToLessons = new Map<string, string[]>()
    for (const l of lessons) {
        const key = recordingKeyFromUrl(l.video_url)
        if (key) keyToLessons.set(key, [...(keyToLessons.get(key) || []), l.id])
    }
    if (keyToLessons.size === 0) return {}

    const { data, error } = await createAdminClient()
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

