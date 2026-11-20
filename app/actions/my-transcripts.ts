'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImpersonationTarget } from '@/app/actions/impersonate'
import { MAX_QUERY_LENGTH, type TranscriptSegment } from '@/lib/transcript-search'

/**
 * Lesson transcripts in the family's History tab (#1342): the transcript under
 * a lesson's video, and a search over the family's own transcripts. The table
 * and search function are service-role only, so both actions first work out
 * whose lessons these are (the signed-in student, or the student an admin is
 * previewing) and only ever read that student's rows.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LESSONS = 30
const MAX_LINES_PER_LESSON = 8

async function viewerStudentId(): Promise<string | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in again.' }
    const { studentId } = await getImpersonationTarget()
    if (studentId) return studentId
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'student') return { error: 'Transcripts are in the student portal.' }
    return user.id
}

/** The transcript of one of this family's lessons (the longest, if the lesson has more than one recording). */
export async function getMyLessonTranscript(lessonId: string): Promise<{ segments: TranscriptSegment[] } | { error: string }> {
    if (typeof lessonId !== 'string' || !UUID.test(lessonId)) return { error: 'Unknown lesson' }
    const studentId = await viewerStudentId()
    if (typeof studentId !== 'string') return studentId
    const { data, error } = await createAdminClient()
        .from('lesson_transcripts')
        .select('segments, duration_seconds')
        .eq('lesson_id', lessonId)
        .eq('student_id', studentId)
        .order('duration_seconds', { ascending: false, nullsFirst: false })
        .limit(1)
    if (error) {
        console.error('[my-transcripts] read failed:', error.message)
        return { error: 'The transcript did not load, try again' }
    }
    if (!data?.[0]) return { error: 'No transcript for this lesson yet' }
    return { segments: (data[0].segments ?? []) as TranscriptSegment[] }
}

export type MyTranscriptHit = {
    lessonId: string
    /** The lines that matched, in order (at most MAX_LINES_PER_LESSON). */
    hits: TranscriptSegment[]
    hitCount: number
}

/** This family's lessons whose transcript mentions the query, newest first. */
export async function searchMyTranscripts(query: string): Promise<{ results: MyTranscriptHit[]; total: number } | { error: string }> {
    const q = (typeof query === 'string' ? query : '').trim()
    if (q.length < 2) return { error: 'Type a word or a phrase to look for' }
    if (q.length > MAX_QUERY_LENGTH) return { error: `Keep it under ${MAX_QUERY_LENGTH} characters` }
    const studentId = await viewerStudentId()
    if (typeof studentId !== 'string') return studentId
    const { data, error } = await createAdminClient().rpc('search_lesson_transcripts', {
        q,
        max_lessons: MAX_LESSONS,
        only_student: studentId,
    })
    if (error) {
        console.error('[my-transcripts] search failed:', error.message)
        return { error: 'The search did not work, try again' }
    }
    const rows = (data ?? []) as { lesson_id: string | null; hits: TranscriptSegment[] | null; hit_count: number | null; total: number | string | null }[]
    // Only transcripts tied to one of this family's lessons: that is what the History tab lists.
    const seen = new Set<string>()
    const results: MyTranscriptHit[] = []
    for (const r of rows) {
        if (!r.lesson_id || seen.has(r.lesson_id)) continue
        seen.add(r.lesson_id)
        results.push({ lessonId: r.lesson_id, hits: (r.hits ?? []).slice(0, MAX_LINES_PER_LESSON), hitCount: r.hit_count ?? 0 })
    }
    return { results, total: results.length }
}
