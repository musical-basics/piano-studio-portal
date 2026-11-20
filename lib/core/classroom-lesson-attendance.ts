import type { DbClient } from '@/lib/supabase/admin'
import { studioWallClockToISO } from '@/lib/studio-timezone'
import { lessonVenue } from '@/lib/lesson-venue'
import {
    CLASSROOM_WINDOW_MS, anyoneCame, classroomAttendanceNote, summarizeClassroomAttendance,
    type ClassroomAttendance, type ClassroomAttendanceRow,
} from '@/lib/classroom-lesson-attendance'

/**
 * Loading the classroom attendance (#795, table classroom_attendance, service
 * role only) for lessons: the morning email's "No-show?" (#1066), the admin
 * line (#1103) and the No-Show page. The sums are in
 * lib/classroom-lesson-attendance.ts.
 *
 * The classroom records attendance only on our own call server, so before the
 * switch there are no rows at all. "No one joined" is only said of a classroom
 * lesson from after the first row ever (attendance was being recorded then).
 */

const TABLE = 'classroom_attendance'
const PAGE = 1000

export type LessonSlot = { id: string; studentId: string; date: string; time: string; duration: number }

export const slotStartMs = (l: Pick<LessonSlot, 'date' | 'time'>) => Date.parse(studioWallClockToISO(l.date, String(l.time).slice(0, 5)))
export const slotEndMs = (l: Pick<LessonSlot, 'date' | 'time' | 'duration'>) => slotStartMs(l) + (l.duration || 60) * 60_000

/** When the classroom began recording attendance (its first row), null while it never has. */
export async function attendanceTrackedSince(client: DbClient): Promise<number | null> {
    const { data, error } = await client.from(TABLE).select('joined_at').order('joined_at', { ascending: true }).limit(1)
    if (error) throw new Error(`${TABLE} query failed: ${error.message}`)
    const first = data?.[0]?.joined_at
    return first ? Date.parse(first as string) : null
}

/** The rows of these students' rooms that joined between fromMs and toMs, every page. */
export async function loadAttendanceRows(client: DbClient, studentIds: string[], fromMs: number, toMs: number): Promise<ClassroomAttendanceRow[]> {
    const ids = [...new Set(studentIds)].filter(Boolean)
    const out: ClassroomAttendanceRow[] = []
    for (let i = 0; i < ids.length; i += 100) {
        for (let page = 0; page < 20; page++) {
            const { data, error } = await client
                .from(TABLE)
                .select('student_id, role, joined_at, left_at')
                .in('student_id', ids.slice(i, i + 100))
                .gte('joined_at', new Date(fromMs).toISOString())
                .lte('joined_at', new Date(toMs).toISOString())
                .order('joined_at', { ascending: true })
                .range(page * PAGE, page * PAGE + PAGE - 1)
            if (error) throw new Error(`${TABLE} query failed: ${error.message}`)
            out.push(...((data || []) as ClassroomAttendanceRow[]))
            if (!data || data.length < PAGE) break
        }
    }
    return out
}

export type ClassroomLessonAttendance = {
    /** Null when nobody used the room and that is no news (a Zoom lesson, or before attendance was recorded). */
    attendance: ClassroomAttendance | null
    /** The student's lessons are set to the classroom (#980). */
    classroomVenue: boolean
}

/**
 * Each started lesson's classroom attendance, by lesson id. A lesson's entry
 * has attendance when someone was in the room around it, or when it is a
 * classroom lesson from after attendance recording began (then "no one
 * joined" is real). Lessons not started yet are left out.
 */
export async function classroomAttendanceByLesson(
    client: DbClient,
    lessons: LessonSlot[],
    now: Date = new Date(),
): Promise<Map<string, ClassroomLessonAttendance>> {
    const out = new Map<string, ClassroomLessonAttendance>()
    const started = lessons.filter(l => slotStartMs(l) <= now.getTime())
    if (started.length === 0) return out

    const studentIds = [...new Set(started.map(l => l.studentId))]
    const venues = new Map<string, boolean>()
    for (let i = 0; i < studentIds.length; i += 200) {
        const { data, error } = await client.from('profiles').select('id, lesson_venue, public_id').in('id', studentIds.slice(i, i + 200))
        if (error) throw new Error(`profiles query failed: ${error.message}`)
        for (const p of data || []) venues.set(p.id as string, lessonVenue(p) === 'classroom')
    }

    const trackedSince = await attendanceTrackedSince(client)
    const relevant = trackedSince === null ? [] : started.filter(l => slotEndMs(l) + CLASSROOM_WINDOW_MS >= trackedSince)
    const rows = relevant.length
        ? await loadAttendanceRows(
            client,
            relevant.map(l => l.studentId),
            Math.min(...relevant.map(slotStartMs)) - CLASSROOM_WINDOW_MS,
            Math.max(...relevant.map(slotEndMs)) + CLASSROOM_WINDOW_MS,
        )
        : []
    const byStudent = new Map<string, ClassroomAttendanceRow[]>()
    for (const r of rows) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r])

    for (const l of started) {
        const classroomVenue = venues.get(l.studentId) ?? false
        let attendance: ClassroomAttendance | null = null
        if (trackedSince !== null && slotEndMs(l) + CLASSROOM_WINDOW_MS >= trackedSince) {
            const a = summarizeClassroomAttendance(byStudent.get(l.studentId) ?? [], slotStartMs(l), slotEndMs(l), now.getTime())
            if (anyoneCame(a) || (classroomVenue && slotStartMs(l) >= trackedSince)) attendance = a
        }
        out.set(l.id, { attendance, classroomVenue })
    }
    return out
}

/**
 * A last look at the classroom for the No-Show page (#1066), like its Zoom
 * line: null when nobody used the room and it is not a classroom lesson.
 * Never throws.
 */
export async function classroomNoteForLesson(client: DbClient, lesson: LessonSlot): Promise<string | null> {
    try {
        const got = (await classroomAttendanceByLesson(client, [lesson])).get(lesson.id)
        return got?.attendance ? classroomAttendanceNote(got.attendance).replace(/^No-show\? /, '') : null
    } catch {
        return null
    }
}
