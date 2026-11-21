import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { listClassroomRecordingsForAdmin, UUID_RE, type AdminRecordingRow } from '@/lib/classroom-recordings'
import { COPIES_TABLE } from '@/lib/classroom-dropbox-copies'
import { isClassroomTranscriptPath, isClassroomVideoUrl } from '@/lib/classroom-video-url'
import { shiftDateStr, studioToday, studioWallClockToISO } from '@/lib/studio-timezone'
import { folderLabel } from '@/lib/transcript-search'

/**
 * The admin Recordings view (Lionel's #1916): every lesson recording in one
 * list, classroom and Zoom together, newest first. Read only; the classroom
 * rows carry their library row so the tab keeps its actions (attach, delete
 * for no-shows, clip, markers, thumbnail).
 *
 * Where each row comes from:
 *   - classroom: classroom_recordings (listClassroomRecordingsForAdmin);
 *   - Zoom: a lesson whose video_url is not a classroom video (a Dropbox share
 *     link to the file in the student's folder);
 *   - a transcript (lesson_transcripts, #953) of a recording that is on no
 *     lesson's video_url: older Zoom files and the old in-browser classroom
 *     recorder's .webm parts. It plays through its Dropbox file.
 * A lesson whose video_url is a classroom link with no library row is listed
 * as classroom too, without the library actions.
 *
 * Transcript yes/no: a classroom row by its Dropbox copy's path (#1020), else
 * by the lesson it is on; a Zoom row by its lesson (every non-classroom
 * transcript on that lesson is that lesson's Zoom recording).
 */

export type RecordingSource = 'classroom' | 'zoom'

export type RecordingLessonRef = { lessonId: string; date: string; time: string }

export type RecordingsViewRow = {
    /** Unique in the list: "c:<library id>", "z:<lesson id>" or "t:<transcript id>". */
    key: string
    source: RecordingSource
    studentId: string | null
    /** The student's name, else the Dropbox folder; null when neither is known. */
    studentName: string | null
    /** When it was recorded (ISO): the classroom start stamp, else the lesson's start. */
    recordedAt: string
    /** False when only the day is known (a transcript of a recording on no lesson). */
    timeKnown: boolean
    minutes: number | null
    /** A link that plays it; null when it plays through its transcript's Dropbox file. */
    url: string | null
    /** Zoom and transcript rows: the lesson it is on or belongs to (classroom rows use classroom.status). */
    lesson: RecordingLessonRef | null
    /** That lesson's video is this recording (the family sees it on the lesson). */
    onLesson: boolean
    transcriptId: string | null
    /** The classroom library row, with its own actions; null for every other row. */
    classroom: AdminRecordingRow | null
}

export type RecordingsView = {
    rows: RecordingsViewRow[]
    /** The first studio date listed, or null when every recording is listed. */
    since: string | null
}

type LessonVideoRow = { id: string; student_id: string | null; date: string; time: string; video_url: string | null }
type TranscriptMeta = {
    id: string
    dropbox_path: string
    student_id: string | null
    student_folder: string | null
    recorded_on: string | null
    lesson_id: string | null
    duration_seconds: number | null
}

const PAGE = 1000
const TRANSCRIPT_COLUMNS = 'id, dropbox_path, student_id, student_folder, recorded_on, lesson_id, duration_seconds'

/** Every row of a query, a page at a time (PostgREST hands back at most 1000). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await page(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        out.push(...(data || []))
        if (!data || data.length < PAGE) return out
    }
}

function chunks<T>(items: T[], size = 150): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

function lessonRef(l: { id: string; date: string; time: string }): RecordingLessonRef {
    return { lessonId: l.id, date: l.date, time: String(l.time).slice(0, 5) }
}

/**
 * The list, newest first. days: only recordings from the last this many days
 * (studio dates); null lists everything.
 */
export async function listRecordingsForAdmin(opts: { days?: number | null; client?: DbClient } = {}): Promise<RecordingsView> {
    const supabase = opts.client ?? createAdminClient()
    const since = opts.days ? shiftDateStr(studioToday(), -opts.days) : null
    const sinceIso = since ? studioWallClockToISO(since, '00:00') : undefined

    // Classroom library rows, and every library link (a lesson showing one of
    // them is listed through its library row, not again as a lesson video).
    const [classroom, libraryLinks, lessons] = await Promise.all([
        listClassroomRecordingsForAdmin(supabase, 1000, sinceIso),
        allRows<{ url: string }>((from, to) => supabase.from('classroom_recordings').select('url').order('id').range(from, to)),
        allRows<LessonVideoRow>((from, to) => {
            let q = supabase.from('lessons').select('id, student_id, date, time, video_url').not('video_url', 'is', null)
            if (since) q = q.gte('date', since)
            return q.order('date', { ascending: false }).order('id').range(from, to)
        }),
    ])
    const libraryUrls = new Set(libraryLinks.map(r => r.url))
    const lessonVideos = lessons.filter(l => l.video_url && !libraryUrls.has(l.video_url))

    // Transcripts (never their text): the window's, plus any on a listed lesson.
    const transcripts = new Map<string, TranscriptMeta>()
    const windowed = await allRows<TranscriptMeta>((from, to) => {
        let q = supabase.from('lesson_transcripts').select(TRANSCRIPT_COLUMNS)
        if (since) q = q.gte('recorded_on', shiftDateStr(since, -1))
        return q.order('id').range(from, to)
    })
    for (const t of windowed) transcripts.set(t.id, t)
    if (since) {
        const lessonIds = [
            ...lessonVideos.map(l => l.id),
            ...classroom.flatMap(r => (r.status.kind === 'attached' ? [r.status.lessonId] : [])),
        ]
        for (const ids of chunks([...new Set(lessonIds)])) {
            const { data, error } = await supabase.from('lesson_transcripts').select(TRANSCRIPT_COLUMNS).in('lesson_id', ids)
            if (error) throw new Error(`lesson_transcripts lookup failed: ${error.message}`)
            for (const t of (data || []) as TranscriptMeta[]) transcripts.set(t.id, t)
        }
    }
    const byPath = new Map<string, TranscriptMeta>()
    const byLesson = new Map<string, TranscriptMeta[]>()
    for (const t of transcripts.values()) {
        byPath.set(t.dropbox_path.toLowerCase(), t)
        if (t.lesson_id) byLesson.set(t.lesson_id, [...(byLesson.get(t.lesson_id) || []), t])
    }
    const claimed = new Set<string>()

    // A classroom recording's Dropbox copy is the file the Mac transcribed.
    const copyPath = new Map<string, string>()
    for (const ids of chunks(classroom.map(r => r.id))) {
        const { data, error } = await supabase.from(COPIES_TABLE).select('recording_id, dropbox_path').eq('status', 'done').in('recording_id', ids)
        if (error) throw new Error(`${COPIES_TABLE} lookup failed: ${error.message}`)
        for (const c of data || []) if (c.dropbox_path) copyPath.set(c.recording_id, c.dropbox_path)
    }

    const rows: RecordingsViewRow[] = []

    for (const rec of classroom) {
        const path = copyPath.get(rec.id)
        let t = path ? byPath.get(path.toLowerCase()) : undefined
        if (!t && rec.status.kind === 'attached') {
            t = (byLesson.get(rec.status.lessonId) || []).find(x => !claimed.has(x.id) && isClassroomTranscriptPath(x.dropbox_path))
        }
        if (t) claimed.add(t.id)
        const attached = rec.status.kind === 'attached'
        rows.push({
            key: `c:${rec.id}`,
            source: 'classroom',
            studentId: UUID_RE.test(rec.studentId || '') ? rec.studentId : null,
            studentName: rec.studentName,
            recordedAt: rec.recordedAt,
            timeKnown: true,
            minutes: rec.minutes ?? (t?.duration_seconds ? t.duration_seconds / 60 : null),
            url: rec.url,
            lesson: rec.status.kind === 'attached' ? { lessonId: rec.status.lessonId, date: rec.status.date, time: rec.status.time } : null,
            onLesson: attached,
            transcriptId: t?.id ?? null,
            classroom: rec,
        })
    }

    for (const l of lessonVideos) {
        const source: RecordingSource = isClassroomVideoUrl(l.video_url) ? 'classroom' : 'zoom'
        // Every unclaimed transcript of this lesson's kind is its recording; the longest one is shown.
        const mine = (byLesson.get(l.id) || []).filter(x => !claimed.has(x.id) && isClassroomTranscriptPath(x.dropbox_path) === (source === 'classroom'))
        for (const x of mine) claimed.add(x.id)
        const t = mine.sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))[0]
        const time = String(l.time).slice(0, 5)
        rows.push({
            key: `z:${l.id}`,
            source,
            studentId: l.student_id,
            studentName: null,
            recordedAt: studioWallClockToISO(l.date, time),
            timeKnown: true,
            minutes: t?.duration_seconds ? t.duration_seconds / 60 : null,
            url: l.video_url,
            lesson: lessonRef(l),
            onLesson: true,
            transcriptId: t?.id ?? null,
            classroom: null,
        })
    }

    // Transcribed recordings on no lesson's video: they play through their file.
    const loose = [...transcripts.values()].filter(t => !claimed.has(t.id) && (!since || (t.recorded_on && t.recorded_on >= since)))
    const looseLessonIds = [...new Set(loose.map(t => t.lesson_id).filter((x): x is string => !!x))]
    const looseLessons = new Map<string, { id: string; date: string; time: string }>()
    for (const ids of chunks(looseLessonIds)) {
        const { data, error } = await supabase.from('lessons').select('id, date, time').in('id', ids)
        if (error) throw new Error(`lessons lookup failed: ${error.message}`)
        for (const l of data || []) looseLessons.set(l.id, l)
    }
    for (const t of loose) {
        const lesson = t.lesson_id ? looseLessons.get(t.lesson_id) : undefined
        const date = lesson?.date ?? t.recorded_on
        if (!date) continue
        rows.push({
            key: `t:${t.id}`,
            source: isClassroomTranscriptPath(t.dropbox_path) ? 'classroom' : 'zoom',
            studentId: t.student_id,
            // The folder until the profile's name is found below.
            studentName: t.student_folder ? folderLabel(t.student_folder) : null,
            recordedAt: studioWallClockToISO(date, lesson ? String(lesson.time).slice(0, 5) : '12:00'),
            timeKnown: !!lesson,
            minutes: t.duration_seconds ? t.duration_seconds / 60 : null,
            url: null,
            lesson: lesson ? lessonRef(lesson) : null,
            onLesson: false,
            transcriptId: t.id,
            classroom: null,
        })
    }

    // Names (the classroom rows come with theirs).
    const needNames = [...new Set(rows.filter(r => !r.classroom && r.studentId && UUID_RE.test(r.studentId)).map(r => r.studentId as string))]
    const names = new Map<string, string>()
    for (const ids of chunks(needNames)) {
        const { data } = await supabase.from('profiles').select('id, name').in('id', ids)
        for (const p of data || []) if (p.name) names.set(p.id, p.name)
    }
    for (const r of rows) if (!r.classroom && r.studentId) r.studentName = names.get(r.studentId) ?? r.studentName

    rows.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
    return { rows, since }
}
