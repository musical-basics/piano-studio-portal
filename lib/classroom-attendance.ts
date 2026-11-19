import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { isoToStudioWallClock, shiftDateStr } from '@/lib/studio-timezone'
import {
    AUTO_LOG_MIN_MINUTES, UUID_RE, lessonAutoLogBlock, matchLessonByStart, type LessonRow,
} from '@/lib/classroom-recordings'
import { autoLogClassroomLesson, studioAdminId } from '@/lib/classroom-auto-log'

/**
 * Lionel's #795: log a classroom lesson by ATTENDANCE, so a recording that
 * failed (or never started) no longer leaves it unlogged. The classroom, on our
 * own LiveKit server only, writes who was in each lesson room from LiveKit's
 * participant_joined / participant_left / room_finished webhooks into
 * `classroom_attendance` (one row per connection: room `lesson-<student id>`,
 * role teacher or student, joined_at, left_at) and calls
 * /api/webhooks/classroom-attendance when someone leaves. The 30-minute
 * classroom cron sweeps the last 7 days too, for calls that never arrived.
 *
 * Here: the time the teacher and the student were in the room TOGETHER is
 * summed per lesson (each stretch together goes on the lesson whose slot holds
 * its start, same rule as a classroom video's start). At 20 minutes or more,
 * the lesson is logged the usual way (lib/classroom-auto-log.ts: one credit,
 * next week booked, lesson email; completed_source 'classroom_attendance', the
 * ledger row labelled "logged by attendance"), only while it is still
 * unlogged and from the last 7 days. One log per lesson whether the video or
 * attendance gets there first.
 *
 * Nothing is decided while someone is still in the student's room (a
 * reconnect mid-lesson is not the end of it); the last one out triggers it. A
 * connection with no "left" that is over 4 hours old is treated as unknown
 * (counts nothing), so a lost webhook can only leave a lesson unlogged (the
 * morning email then lists it), never charge one.
 */

const MINUTE = 60_000
/** An open connection older than this lost its "left" webhook: it counts nothing. */
export const STALE_OPEN_MS = 4 * 60 * MINUTE

export type AttendanceRow = {
    student_id: string
    role: string
    joined_at: string
    left_at: string | null
}

export type Segment = { startMs: number; endMs: number }

/**
 * The stretches when a teacher and a student were both in the room, merged
 * (two teacher devices never count twice), plus whether anyone is in it now.
 */
export function togetherSegments(rows: AttendanceRow[], nowMs: number): { inRoom: boolean; segments: Segment[] } {
    let inRoom = false
    const spans: Record<'teacher' | 'student', Segment[]> = { teacher: [], student: [] }
    for (const r of rows) {
        if (r.role !== 'teacher' && r.role !== 'student') continue
        const startMs = Date.parse(r.joined_at)
        let endMs: number
        if (r.left_at) {
            endMs = Date.parse(r.left_at)
        } else if (nowMs - startMs < STALE_OPEN_MS) {
            inRoom = true
            endMs = nowMs
        } else {
            continue
        }
        if (endMs > startMs) spans[r.role].push({ startMs, endMs })
    }
    const overlaps: Segment[] = []
    for (const t of spans.teacher) {
        for (const s of spans.student) {
            const startMs = Math.max(t.startMs, s.startMs)
            const endMs = Math.min(t.endMs, s.endMs)
            if (endMs > startMs) overlaps.push({ startMs, endMs })
        }
    }
    overlaps.sort((a, b) => a.startMs - b.startMs)
    const segments: Segment[] = []
    for (const o of overlaps) {
        const last = segments[segments.length - 1]
        if (last && o.startMs <= last.endMs) last.endMs = Math.max(last.endMs, o.endMs)
        else segments.push({ ...o })
    }
    return { inRoom, segments }
}

/** Minutes together per lesson; stretches that fit no lesson are listed apart. */
export function minutesPerLesson<L extends LessonRow>(segments: Segment[], lessons: L[]) {
    const perLesson = new Map<string, { lesson: L; minutes: number }>()
    const unmatched: Segment[] = []
    for (const seg of segments) {
        const lesson = matchLessonByStart(seg.startMs, lessons)
        if (!lesson) {
            unmatched.push(seg)
            continue
        }
        const entry = perLesson.get(lesson.id) ?? { lesson, minutes: 0 }
        entry.minutes += (seg.endMs - seg.startMs) / MINUTE
        perLesson.set(lesson.id, entry)
    }
    return { perLesson: [...perLesson.values()], unmatched }
}

export type AttendanceLogResult = {
    students: number
    /** Students whose room still has someone in it: decided on a later call. */
    waiting: string[]
    lessons: {
        studentId: string
        lessonId: string
        date: string
        time: string
        minutes: number
        action: 'logged' | 'would log' | 'not logged'
        reason?: string
        creditDeducted?: boolean
    }[]
    /** Time together that fits no lesson (a room used off-schedule). */
    unmatched: { studentId: string; start: string; minutes: number }[]
}

export type AttendanceLogOptions = {
    studentId?: string
    /** How far back to look at connections. Default 7 days (the auto-log limit). */
    days?: number
    dryRun?: boolean
    client?: DbClient
    log?: (msg: string) => void
    now?: Date
}

export async function logByClassroomAttendance(opts: AttendanceLogOptions = {}): Promise<AttendanceLogResult> {
    const supabase = opts.client ?? createAdminClient()
    const log = opts.log ?? (() => {})
    const now = opts.now ?? new Date()
    const days = opts.days ?? 7
    const result: AttendanceLogResult = { students: 0, waiting: [], lessons: [], unmatched: [] }
    let adminId: string | null | undefined

    let query = supabase
        .from('classroom_attendance')
        .select('student_id, role, joined_at, left_at')
        .gte('joined_at', new Date(now.getTime() - days * 24 * 60 * MINUTE - STALE_OPEN_MS).toISOString())
        .order('joined_at', { ascending: true })
    if (opts.studentId) query = query.eq('student_id', opts.studentId)
    const { data, error } = await query
    if (error) throw new Error(`classroom_attendance query failed: ${error.message}`)

    const byStudent = new Map<string, AttendanceRow[]>()
    for (const row of (data || []) as AttendanceRow[]) {
        if (!UUID_RE.test(row.student_id || '')) continue
        const list = byStudent.get(row.student_id) ?? []
        list.push(row)
        byStudent.set(row.student_id, list)
    }
    result.students = byStudent.size

    for (const [studentId, rows] of byStudent) {
        const { inRoom, segments } = togetherSegments(rows, now.getTime())
        if (inRoom) {
            result.waiting.push(studentId)
            log(`student ${studentId}: someone is still in the room, deciding later`)
            continue
        }
        if (segments.length === 0) continue

        const day = (ms: number) => isoToStudioWallClock(new Date(ms).toISOString()).localDate
        const { data: lessonRows, error: lessonError } = await supabase
            .from('lessons')
            .select('id, date, time, duration, status, video_url')
            .eq('student_id', studentId)
            .gte('date', shiftDateStr(day(segments[0].startMs), -1))
            .lte('date', shiftDateStr(day(segments[segments.length - 1].startMs), 1))
        if (lessonError) {
            log(`student ${studentId}: lesson query failed: ${lessonError.message}`)
            continue
        }

        const { perLesson, unmatched } = minutesPerLesson(segments, (lessonRows || []) as LessonRow[])
        for (const seg of unmatched) {
            result.unmatched.push({ studentId, start: new Date(seg.startMs).toISOString(), minutes: Math.round((seg.endMs - seg.startMs) / MINUTE) })
        }

        for (const { lesson, minutes } of perLesson) {
            const base = { studentId, lessonId: lesson.id, date: lesson.date, time: String(lesson.time).slice(0, 5), minutes: Math.round(minutes) }
            const block = minutes < AUTO_LOG_MIN_MINUTES
                ? `together ${Math.round(minutes)} min, under ${AUTO_LOG_MIN_MINUTES}`
                : lessonAutoLogBlock(lesson, now)
            if (block) {
                // Lessons already logged are the normal case; only say so in dry runs.
                if (opts.dryRun || lesson.status === 'scheduled') log(`not logging lesson ${lesson.id}: ${block}`)
                result.lessons.push({ ...base, action: 'not logged', reason: block })
                continue
            }
            if (opts.dryRun) {
                log(`[dry run] would LOG lesson ${lesson.id} (${lesson.date} ${base.time}): together ${base.minutes} min`)
                result.lessons.push({ ...base, action: 'would log' })
                continue
            }
            const logged = await autoLogClassroomLesson(supabase, lesson, {
                source: 'classroom_attendance',
                minutes,
                log,
                getAdminId: async () => {
                    if (adminId === undefined) adminId = await studioAdminId(supabase)
                    return adminId
                },
            })
            result.lessons.push(logged
                ? { ...base, action: 'logged', creditDeducted: logged.creditDeducted }
                : { ...base, action: 'not logged', reason: 'see logs (logged meanwhile, or the log failed)' })
        }
    }
    return result
}
