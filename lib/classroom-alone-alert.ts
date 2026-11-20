import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { isoToStudioWallClock, shiftDateStr, studioTzAbbr } from '@/lib/studio-timezone'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { CLASSROOM_BASE_URL, lessonVenue } from '@/lib/lesson-venue'
import { slotEndMs, slotStartMs, type LessonSlot } from '@/lib/core/classroom-lesson-attendance'
import {
    CLASSROOM_STALE_OPEN_MS, TEACHER_EARLY_MS, ALONE_ALERT_MINUTES, clockOf, waitingAlone,
    type AloneWait, type ClassroomAttendanceRow,
} from '@/lib/classroom-lesson-attendance'

/**
 * Lionel's #1104: a student waiting alone in the classroom for 5 minutes
 * emails the studio inbox right away, so a forgotten or late start is caught
 * while they are still there.
 *
 * The classroom records who is in each lesson room as it happens (#795, table
 * classroom_attendance, our own LiveKit server only). Every minute the cron
 * /api/cron/classroom-alone looks at the rooms with a student in them now.
 * For each, the student's lesson whose slot it is (from 30 minutes before the
 * start to the end): if Lionel has not been in the room since 30 minutes
 * before the start, the wait counts from the later of the student's arrival
 * and the start (joining early is not waiting). At 5 minutes: one email, with
 * the student's name, when they joined and the link to the classroom.
 *
 * One email per lesson: classroom_alone_alerts holds a row per lesson emailed,
 * claimed before sending (so the cron's two triggers never send twice) and
 * given back if the email fails (the next minute tries again). A student in
 * the room with no lesson then (off schedule) is left alone. Teacher accounts
 * are left out. Nothing at all happens before the classroom moves to our own
 * server: there are no attendance rows until then.
 */

export const ALERTS_TABLE = 'classroom_alone_alerts'

export type AloneCandidate = {
    studentId: string
    studentName: string
    lessonId: string
    date: string
    time: string
    wait: AloneWait
    classroomVenue: boolean
}

export type AloneRun = {
    /** Rooms with a student in them now. */
    rooms: number
    /** Students waiting for a lesson Lionel has not started (due or not yet). */
    waiting: { studentId: string; lessonId: string; minutes: number; due: boolean }[]
    /** Emails sent (or, in a dry run, that would be sent). */
    emailed: { lessonId: string; subject: string }[]
    /** Already emailed for that lesson earlier. */
    alreadyEmailed: string[]
    /** Students in their room with no lesson in its slot now. */
    noLesson: string[]
    failed: string[]
    dryRun: boolean
    message: string
}

/** "4:58pm EST" */
function clockTz(ms: number): string {
    const iso = new Date(ms).toISOString()
    return `${clockOf(iso)} ${studioTzAbbr(iso)}`
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** The email for one waiting student. The link opens the classroom as the teacher. */
export function aloneEmail(c: AloneCandidate, now: Date): { subject: string; lines: string[]; html: string; footer: string } {
    const minutes = Math.floor(c.wait.minutes)
    const startMs = slotStartMs(c)
    const link = `${CLASSROOM_BASE_URL}/start/${c.studentId}`
    const early = c.wait.joinedMs < startMs
    const joined = early
        ? `joined the classroom at ${clockTz(c.wait.joinedMs)}, before their ${clockTz(startMs)} lesson`
        : `joined the classroom at ${clockTz(c.wait.joinedMs)} for their ${clockTz(startMs)} lesson`
    const subject = `${c.studentName} is waiting alone in the classroom (${minutes} min)`
    const lines = [
        `${escapeHtml(c.studentName)} ${joined}, and you are not in the room yet. They have been waiting alone ${minutes} minutes${early ? ' since the start' : ''}.`,
        ...(c.classroomVenue ? [] : ["This student's lessons are set to Zoom, so they may be in the wrong place (or you may be waiting on Zoom)."]),
    ]
    const html = `${lines.map(l => `<p style="font-size:15px;margin:0 0 10px">${l}</p>`).join('\n')}
<p style="margin:14px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;background:#15803d;color:#ffffff;border:1px solid #15803d">Open the classroom</a></p>`
    const footer = `Sent once per lesson, when a student has been in the classroom ${ALONE_ALERT_MINUTES} minutes past the later of their arrival and the lesson's start ` +
        `with you not in the room since 30 minutes before the start. From the classroom's attendance record (our own call server). ` +
        `Checked every minute; nobody else is emailed. Sent at ${clockTz(now.getTime())}.`
    return { subject, lines, html, footer }
}

/**
 * One check of every classroom room (the cron, every minute). `dryRun` claims
 * nothing and sends nothing, and lists what it would send. `now` is for tests.
 */
export async function runClassroomAloneCheck(
    client: DbClient,
    { dryRun = false, now = new Date(), log = () => {} }: { dryRun?: boolean; now?: Date; log?: (msg: string) => void } = {},
): Promise<AloneRun> {
    const run: AloneRun = { rooms: 0, waiting: [], emailed: [], alreadyEmailed: [], noLesson: [], failed: [], dryRun, message: '' }
    const nowMs = now.getTime()

    // Every connection of the last few hours: enough to see who is in each room
    // now, and whether Lionel came for a lesson that started up to 2 hours ago.
    const { data, error } = await client
        .from('classroom_attendance')
        .select('student_id, role, joined_at, left_at')
        .gte('joined_at', new Date(nowMs - CLASSROOM_STALE_OPEN_MS - 60 * 60_000).toISOString())
        .lte('joined_at', now.toISOString())
        .order('joined_at', { ascending: true })
        .limit(5000)
    if (error) throw new Error(`classroom_attendance query failed: ${error.message}`)
    const byStudent = new Map<string, ClassroomAttendanceRow[]>()
    for (const r of (data || []) as ClassroomAttendanceRow[]) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r])
    const occupied = [...byStudent.entries()]
        .filter(([, rows]) => rows.some(r => r.role === 'student' && !r.left_at && nowMs - Date.parse(r.joined_at) < CLASSROOM_STALE_OPEN_MS))
        .map(([id]) => id)
    run.rooms = occupied.length
    if (occupied.length === 0) {
        run.message = 'No student in the classroom'
        return run
    }

    const today = isoToStudioWallClock(now.toISOString()).localDate
    const [{ data: lessons, error: lessonError }, { data: profiles, error: profileError }] = await Promise.all([
        client.from('lessons').select('id, student_id, date, time, duration, status')
            .in('student_id', occupied).in('date', [shiftDateStr(today, -1), today]).eq('status', 'scheduled'),
        client.from('profiles').select('id, name, credits, lesson_venue, public_id').in('id', occupied),
    ])
    if (lessonError) throw new Error(`lessons query failed: ${lessonError.message}`)
    if (profileError) throw new Error(`profiles query failed: ${profileError.message}`)
    const profileById = new Map((profiles || []).map(p => [p.id as string, p]))

    const candidates: AloneCandidate[] = []
    for (const studentId of occupied) {
        const profile = profileById.get(studentId)
        if (!profile || isUntrackedTeacherAccount(profile)) continue
        // The lesson whose slot it is: from 30 minutes before its start to its end, the nearest start.
        const slots = (lessons || [])
            .filter(l => l.student_id === studentId)
            .map(l => ({ id: l.id as string, studentId, date: l.date as string, time: String(l.time).slice(0, 5), duration: (l.duration as number) || 60 }) as LessonSlot)
            .filter(l => slotStartMs(l) - TEACHER_EARLY_MS <= nowMs && nowMs < slotEndMs(l))
            .sort((a, b) => Math.abs(slotStartMs(a) - nowMs) - Math.abs(slotStartMs(b) - nowMs))
        const lesson = slots[0]
        if (!lesson) {
            run.noLesson.push(studentId)
            continue
        }
        const wait = waitingAlone(byStudent.get(studentId) ?? [], { startMs: slotStartMs(lesson), endMs: slotEndMs(lesson) }, nowMs)
        if (!wait) continue
        run.waiting.push({ studentId, lessonId: lesson.id, minutes: Math.round(wait.minutes * 10) / 10, due: wait.due })
        if (!wait.due) continue
        candidates.push({
            studentId,
            studentName: (profile.name as string) || 'A student',
            lessonId: lesson.id,
            date: lesson.date,
            time: lesson.time,
            wait,
            classroomVenue: lessonVenue(profile) === 'classroom',
        })
    }

    for (const c of candidates) {
        const email = aloneEmail(c, now)
        if (dryRun) {
            const { data: sent } = await client.from(ALERTS_TABLE).select('lesson_id').eq('lesson_id', c.lessonId).maybeSingle()
            if (sent) run.alreadyEmailed.push(c.lessonId)
            else run.emailed.push({ lessonId: c.lessonId, subject: email.subject })
            log(`[dry run] ${sent ? 'already emailed' : 'would email'}: ${email.subject}`)
            continue
        }
        // Claim the lesson first, so two runs at once never both send.
        const { data: claimed, error: claimError } = await client
            .from(ALERTS_TABLE)
            .upsert({ lesson_id: c.lessonId, student_id: c.studentId, alone_since: new Date(c.wait.aloneSinceMs).toISOString(), joined_at: new Date(c.wait.joinedMs).toISOString() },
                { onConflict: 'lesson_id', ignoreDuplicates: true })
            .select('lesson_id')
        if (claimError) {
            run.failed.push(c.lessonId)
            log(`could not claim lesson ${c.lessonId}: ${claimError.message}`)
            continue
        }
        if (!claimed || claimed.length === 0) {
            run.alreadyEmailed.push(c.lessonId)
            continue
        }
        const sent = await sendCronAlert(client, email)
        if (sent) {
            run.emailed.push({ lessonId: c.lessonId, subject: email.subject })
            log(`emailed: ${email.subject}`)
        } else {
            // Give the claim back: the next minute tries again.
            await client.from(ALERTS_TABLE).delete().eq('lesson_id', c.lessonId)
            run.failed.push(c.lessonId)
            log(`email failed for lesson ${c.lessonId}; will try again next minute`)
        }
    }

    const waitingNow = run.waiting.length
    run.message = [
        `${run.rooms} room${run.rooms === 1 ? '' : 's'} with a student`,
        waitingNow ? `${waitingNow} waiting alone` : '',
        run.emailed.length ? `${dryRun ? 'would email' : 'emailed'} ${run.emailed.length}` : '',
        run.failed.length ? `${run.failed.length} failed` : '',
    ].filter(Boolean).join(', ')
    return run
}
