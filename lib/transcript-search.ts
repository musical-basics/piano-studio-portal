import type { DbClient } from '@/lib/supabase/admin'

/**
 * Searching lesson transcripts (Lionel's #954). The Mac writes a transcript of
 * every lesson recording overnight (scripts/transcribe_lessons.py, #953) into
 * lesson_transcripts; search_lesson_transcripts() (Postgres full-text search,
 * English stemming, so "pedal" also finds "pedaling") returns the matching
 * lessons with the lines that matched. The table and function are
 * service-role only, so every caller checks who is asking first: the admin
 * search (app/actions/transcripts.ts), and since #1342 each family's own
 * transcripts in their History tab (app/actions/my-transcripts.ts, which
 * passes only_student so a family only ever sees its own lessons).
 */

/** One transcript line: start and end in seconds from the start of the recording. */
export type TranscriptSegment = { s: number; e: number; t: string }

export type TranscriptSearchResult = {
    id: string
    studentId: string | null
    /** The student's name, or the Dropbox folder when no student matches it. */
    studentName: string
    /** The lesson's date (studio time), else the date in the recording's name. */
    recordedOn: string | null
    lessonId: string | null
    /** "18:30" when the lesson is known. */
    lessonTime: string | null
    durationSeconds: number | null
    /** The matching lines, in order (at most 30). */
    hits: TranscriptSegment[]
    hitCount: number
}

export type TranscriptSearchAnswer = {
    results: TranscriptSearchResult[]
    /** Every matching lesson; results holds the newest MAX_RESULTS of them. */
    total: number
    /** How many recordings have a transcript so far. */
    transcribed: number
}

export const MAX_RESULTS = 50
export const MAX_QUERY_LENGTH = 200

/** Runs the search with a service-role client. The caller checks who is asking. */
export async function searchTranscriptsCore(client: DbClient, query: string): Promise<TranscriptSearchAnswer> {
    const q = query.trim().slice(0, MAX_QUERY_LENGTH)
    const [{ data, error }, { count }] = await Promise.all([
        client.rpc('search_lesson_transcripts', { q, max_lessons: MAX_RESULTS }),
        client.from('lesson_transcripts').select('id', { count: 'exact', head: true }),
    ])
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
        id: string
        student_id: string | null
        student_folder: string | null
        recorded_on: string | null
        lesson_id: string | null
        duration_seconds: number | null
        hits: TranscriptSegment[] | null
        hit_count: number | null
        total: number | string | null
    }[]

    const studentIds = [...new Set(rows.map(r => r.student_id).filter((x): x is string => !!x))]
    const lessonIds = [...new Set(rows.map(r => r.lesson_id).filter((x): x is string => !!x))]
    const [students, lessons] = await Promise.all([
        studentIds.length
            ? client.from('profiles').select('id, name').in('id', studentIds)
            : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
        lessonIds.length
            ? client.from('lessons').select('id, time').in('id', lessonIds)
            : Promise.resolve({ data: [] as { id: string; time: string | null }[] }),
    ])
    const nameOf = new Map((students.data ?? []).map(p => [p.id as string, (p.name as string | null) ?? null]))
    const timeOf = new Map((lessons.data ?? []).map(l => [l.id as string, (l.time as string | null) ?? null]))

    return {
        results: rows.map(r => ({
            id: r.id,
            studentId: r.student_id,
            studentName: (r.student_id && nameOf.get(r.student_id)) || folderLabel(r.student_folder),
            recordedOn: r.recorded_on,
            lessonId: r.lesson_id,
            lessonTime: r.lesson_id ? (timeOf.get(r.lesson_id)?.slice(0, 5) ?? null) : null,
            durationSeconds: r.duration_seconds,
            hits: r.hits ?? [],
            hitCount: r.hit_count ?? 0,
        })),
        total: Number(rows[0]?.total ?? 0),
        transcribed: count ?? 0,
    }
}

/** "Jane Doe Recordings" -> "Jane Doe" (the Dropbox folder, when no student matches it). */
export function folderLabel(folder: string | null): string {
    if (!folder) return 'Unknown student'
    return folder.replace(/\s*(lesson\s+)?recordings$/i, '').trim() || folder
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function clockTime(totalSeconds: number): string {
    const t = Math.max(0, Math.floor(totalSeconds))
    const h = Math.floor(t / 3600)
    const m = Math.floor((t % 3600) / 60)
    const s = t % 60
    const mmss = `${h ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`
    return h ? `${h}:${mmss}` : mmss
}

/**
 * The words to highlight for a query in web-search syntax: quoted phrases are
 * split into words, "-word" is left out, "or" is not a word. Each comes back
 * as a rough stem, so "pedals" highlights "pedal" and "pedaling".
 */
export function queryTerms(query: string): string[] {
    const words = query
        .toLowerCase()
        .replace(/"/g, ' ')
        .split(/\s+/)
        .filter(w => w && !w.startsWith('-') && w !== 'or')
        .map(w => w.replace(/[^\p{L}\p{N}']/gu, ''))
        .filter(w => w.length >= 2)
    const stems = words.map(w => (w.length > 4 ? w.replace(/(ing|ed|es|s|ly)$/, '') : w))
    return [...new Set(stems)]
}

/** text split into runs, hit = true where a word starts with one of the terms. */
export function highlightParts(text: string, terms: string[]): { text: string; hit: boolean }[] {
    if (!terms.length) return [{ text, hit: false }]
    const parts: { text: string; hit: boolean }[] = []
    for (const piece of text.split(/(\s+)/)) {
        const word = piece.toLowerCase().replace(/^[^\p{L}\p{N}]+/u, '')
        const hit = !/^\s*$/.test(piece) && terms.some(t => word.startsWith(t))
        const last = parts[parts.length - 1]
        if (last && last.hit === hit) last.text += piece
        else parts.push({ text: piece, hit })
    }
    return parts
}
