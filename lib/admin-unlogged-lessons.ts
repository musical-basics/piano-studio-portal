import { revalidatePath } from 'next/cache'
import type { DbClient } from '@/lib/supabase/admin'
import { logLessonCore } from '@/lib/core/lessons'
import { LATE_LOG_SOURCE_ADMIN, isTooOldForUsualLog, logOldLessonQuietly } from '@/lib/late-lesson-log'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import { UNLOGGED_STATUSES, formatClock, lessonEndMs, zoomWillLog, type UnloggedLesson } from '@/lib/unlogged-lessons'

/**
 * The red "N unlogged" badge on the admin home (Lionel's #760) and the list it
 * opens, with the same three buttons as the unlogged-lessons emails: Log it,
 * Didn't happen, I missed it. Here they act from the admin's own session
 * instead of signed links, but through the same server logic as the email
 * buttons (app/api/lesson-action): logLessonCore, or the quiet late log for a
 * lesson over a week old, a plain delete for Didn't happen, and
 * missedLessonCore (via app/actions/missed-lesson) for I missed it.
 *
 * Unlogged means the same as in lib/unlogged-lessons.ts: still 'scheduled' or
 * 'logging', teacher accounts left out (#734). Here also: already over, from
 * any date. A Zoom lesson that ended under an hour ago is left out for that
 * hour, since Zoom's webhook usually logs it itself by then (the same timing
 * rule as the 11pm email when Zoom cannot be asked).
 */

export type AdminUnloggedLesson = {
    id: string
    studentId: string
    studentName: string
    /** Set when the account is not 'active' (for example 'inactive', 'other'). */
    accountStatus: string | null
    date: string
    /** HH:MM, studio wall clock. */
    time: string
    duration: number
    status: string
    /** "Tue, Nov 18, 4:45pm EST, 60 min" */
    label: string
    notes: string | null
    hasVideo: boolean
    /** Over a week old: Log it logs quietly (no email, no booking). */
    quietLog: boolean
}

function shortDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function weekday(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

/** "Tue, Nov 18, 4:45pm EST" */
function whenLabel(date: string, time: string): string {
    return `${shortDay(date)}, ${formatClock(time)} ${studioTzAbbr(studioWallClockToISO(date, time))}`
}

/** "Tue, Nov 18, 4:45pm EST, 60 min" */
export function lessonLabel(date: string, time: string, duration: number): string {
    return `${whenLabel(date, time)}, ${duration} min`
}

/** Every lesson that is over and still unlogged, oldest first. `client` must be the service-role client. */
export async function findUnloggedForAdmin(client: DbClient, now: Date = new Date()): Promise<AdminUnloggedLesson[]> {
    // A day ahead in UTC covers today's studio date in any case; the end-time
    // check below does the real cut.
    const lastDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: lessons, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, status, notes, zoom_meeting_id, video_url')
        .lte('date', lastDate)
        .in('status', UNLOGGED_STATUSES)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(1000)
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    if (!lessons || lessons.length === 0) return []

    const ids = [...new Set(lessons.map(l => l.student_id as string))]
    const { data: students, error: studentError } = await client
        .from('profiles')
        .select('id, name, status, dropbox_recording_folder, credits')
        .in('id', ids)
    if (studentError) throw new Error(`profiles query failed: ${studentError.message}`)
    const byId = new Map((students || []).map(s => [s.id as string, s]))

    const found: AdminUnloggedLesson[] = []
    for (const l of lessons) {
        const s = byId.get(l.student_id as string)
        if (isUntrackedTeacherAccount(s)) continue
        const time = String(l.time).slice(0, 5)
        const duration = (l.duration as number) || 60
        const meeting = l.zoom_meeting_id ? String(l.zoom_meeting_id).replace(/\D/g, '') : ''
        const asUnlogged: UnloggedLesson = {
            id: l.id as string,
            date: l.date as string,
            time,
            duration,
            status: l.status as string,
            studentId: l.student_id as string,
            studentName: (s?.name as string) || 'Unknown student',
            accountStatus: (s?.status as string) ?? null,
            zoomMeetingId: meeting || null,
            hasVideo: !!l.video_url,
            hasDropboxFolder: !!s?.dropbox_recording_folder,
        }
        if (lessonEndMs(asUnlogged) > now.getTime()) continue
        if (zoomWillLog(asUnlogged, now, null)) continue
        found.push({
            id: asUnlogged.id,
            studentId: l.student_id as string,
            studentName: asUnlogged.studentName,
            accountStatus: asUnlogged.accountStatus && asUnlogged.accountStatus !== 'active' ? asUnlogged.accountStatus : null,
            date: asUnlogged.date,
            time,
            duration,
            status: asUnlogged.status,
            label: lessonLabel(asUnlogged.date, time, duration),
            notes: (l.notes as string) || null,
            hasVideo: asUnlogged.hasVideo,
            quietLog: isTooOldForUsualLog(asUnlogged.date),
        })
    }
    return found
}

export type UnloggedActionResult = { ok: true; text: string } | { ok: false; text: string }

/** What the admin saw when pressing the button; a lesson moved since is refused. */
export type ExpectedLesson = { lessonId: string; date: string; time: string }

type Checked =
    | { ok: true; lesson: { id: string; student_id: string; date: string; time: string; notes: string | null }; label: string }
    | { ok: false; text: string }

/** Is the lesson still the unlogged lesson the list showed? Same checks as the email buttons. */
async function checkStillUnlogged(client: DbClient, expected: ExpectedLesson): Promise<Checked> {
    const { data: lesson, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, status, notes')
        .eq('id', expected.lessonId)
        .maybeSingle()
    if (error) return { ok: false, text: 'The lesson could not be looked up just now. Nothing changed. Please try again in a minute.' }
    if (!lesson) return { ok: false, text: 'This lesson is already gone (removed or cancelled). Nothing changed.' }
    if (lesson.status === 'completed') return { ok: false, text: 'This lesson was logged already, so its credit was already taken. Nothing changed.' }
    if (!UNLOGGED_STATUSES.includes(lesson.status as string)) {
        return { ok: false, text: `This lesson is marked "${lesson.status}" now. Nothing changed.` }
    }
    const time = String(lesson.time).slice(0, 5)
    if (lesson.date !== expected.date || time !== expected.time.slice(0, 5)) {
        return { ok: false, text: `This lesson was moved to ${whenLabel(lesson.date as string, time)}. Nothing changed.` }
    }
    const { data: student } = await client.from('profiles').select('name').eq('id', lesson.student_id).maybeSingle()
    return {
        ok: true,
        lesson: { id: lesson.id as string, student_id: lesson.student_id as string, date: lesson.date as string, time, notes: (lesson.notes as string) ?? null },
        label: `${weekday(lesson.date as string)}'s ${formatClock(time)} lesson for ${(student?.name as string) || 'this student'}`,
    }
}

/** Caps for the notes and homework boxes, as on the email's Log it page. */
export const NOTES_MAX = 5000
export const HOMEWORK_MAX = 2000

/**
 * "Log it": the usual log (credit, family's lesson email, next-week booking),
 * or for a lesson over a week old the quiet log (credit only, labelled ledger
 * row, no email, no booking). `client` must be the service-role client.
 */
export async function logUnloggedLessonForAdmin(
    client: DbClient,
    adminId: string,
    expected: ExpectedLesson,
    { notes = '', homework = '' }: { notes?: string; homework?: string } = {},
): Promise<UnloggedActionResult> {
    const checked = await checkStillUnlogged(client, expected)
    if (!checked.ok) return checked
    const { lesson, label } = checked
    const typedNotes = notes.trim().slice(0, NOTES_MAX)
    const typedHomework = homework.trim().slice(0, HOMEWORK_MAX)

    if (isTooOldForUsualLog(lesson.date)) {
        const quiet = await logOldLessonQuietly(client, lesson.id, {
            notes: typedNotes || undefined,
            homework: typedHomework || undefined,
            source: LATE_LOG_SOURCE_ADMIN,
        })
        if (!quiet.ok && quiet.changed) return { ok: false, text: 'This lesson changed while you were confirming (logged or removed elsewhere). Nothing changed.' }
        if (!quiet.ok) {
            console.error(`[admin-unlogged] quiet log failed for ${lesson.id}: ${quiet.error}`)
            return { ok: false, text: `Logging did not finish: ${quiet.error}. Please check this lesson before trying again.` }
        }
        console.log(`[admin-unlogged] logged old lesson ${lesson.id} quietly from admin (credits ${quiet.previousCredits} -> ${quiet.newCredits})`)
        return { ok: true, text: `${label} is logged and 1 credit was taken (${quiet.newCredits} left). Nobody was emailed and no lesson was booked.` }
    }

    const result = await logLessonCore({
        client,
        adminId,
        lessonId: lesson.id,
        notes: typedNotes || lesson.notes || '',
        homework: typedHomework || undefined,
        completedSource: 'admin_ui',
        // Serverless: finish the usual emails before the action returns.
        awaitNotifications: true,
    })
    if ('error' in result) {
        console.error(`[admin-unlogged] log failed for ${lesson.id}: ${result.error}`)
        return { ok: false, text: `Logging did not finish: ${result.error}. Please check this lesson before trying again.` }
    }
    const left = result.new_credits
    console.log(`[admin-unlogged] logged ${lesson.id} from admin (credits ${result.previous_credits} -> ${left})`)
    return { ok: true, text: `${label} is logged and 1 credit was taken${typeof left === 'number' ? ` (${left} left)` : ''}.` }
}

/** "Didn't happen": deletes the lesson row only, while it is still unlogged. Nobody is told. */
export async function removeUnloggedLessonForAdmin(client: DbClient, expected: ExpectedLesson): Promise<UnloggedActionResult> {
    const checked = await checkStillUnlogged(client, expected)
    if (!checked.ok) return checked
    const { lesson, label } = checked
    const { data: deleted, error } = await client
        .from('lessons')
        .delete()
        .eq('id', lesson.id)
        .in('status', UNLOGGED_STATUSES)
        .select('id')
    if (error) {
        console.error(`[admin-unlogged] remove failed for ${lesson.id}: ${error.message}`)
        return { ok: false, text: 'The lesson was not removed. Nothing changed. Please try again in a minute.' }
    }
    if (!deleted || deleted.length === 0) return { ok: false, text: 'This lesson changed while you were confirming (logged or removed elsewhere). Nothing changed.' }
    console.log(`[admin-unlogged] removed ${lesson.id} from admin (no one notified)`)
    try {
        revalidatePath('/admin')
        revalidatePath('/student')
    } catch {
        // Outside a request (scripts): nothing to revalidate.
    }
    return { ok: true, text: `${label} is removed. No credit was taken and nobody was told.` }
}
