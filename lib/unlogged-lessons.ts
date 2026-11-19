import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { isoToStudioWallClock, shiftDateStr, studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { LINK_TTL_DAYS, appBaseUrl, lessonActionUrl, signLessonAction } from '@/lib/lesson-action-links'
import { MIN_LESSON_RECORDING_MINUTES, recordingMinutes, type ZoomRecordingFile } from '@/lib/zoom-recordings'
import { attendanceNote, looksLikeNoShow, zoomAttendance, type ZoomAttendance } from '@/lib/zoom-attendance'
import { autoLoggedSection, findAutoLoggedLessons, type AutoLoggedLesson } from '@/lib/auto-logged-lessons'
import { moveRequestsSection } from '@/lib/move-requests-email'
import type { PendingMoveRequest } from '@/lib/core/move-requests'
import type { LessonRow as ClassroomLessonRow } from '@/lib/classroom-recordings'
import { findDayLessons } from '@/lib/evening-preview'
import { todayScheduleSection, todaySubject, type TodaySchedule } from '@/lib/today-schedule-email'

/**
 * Lessons from a given studio day that nobody logged. A lesson takes its credit
 * only when it is logged (Zoom's webhook does it for lessons it recorded for 5+
 * minutes; everything else is logged by hand), so an unlogged lesson silently
 * costs the student nothing. In Nov 2026 eleven of them were found going back to
 * the previous December. Decision #426: email the studio each morning about
 * yesterday's, so none sits unnoticed again.
 *
 * Each lesson in the email carries two one-time buttons (#441): "Log it" and
 * "Didn't happen" (see app/api/lesson-action). Since #538 the same email also
 * goes out at 11pm about that day's lessons, leaving out those Zoom will log
 * itself. Since #736 the monthly credit check lists every older one still
 * unlogged (findPastUnloggedLessons).
 *
 * Teacher accounts are left out of all of these (#734, isUntrackedTeacherAccount).
 *
 * The morning email also lists what the portal logged by itself that day
 * (#793, lib/auto-logged-lessons.ts), and asks Zoom who joined each unlogged
 * Zoom lesson (#797, lib/zoom-attendance.ts): a lesson only Lionel joined is
 * marked "No-show?" with a one-tap No-Show button.
 *
 * Since #878 it also lists families asking to move a lesson, with one-tap
 * Approve / Decline buttons (lib/move-requests-email.ts), and goes out on a
 * morning with only those too.
 *
 * Since #940 each unlogged lesson with a recording (on the lesson, or a
 * classroom video made in its slot) carries a "Watch" button, and since #942
 * the email opens with today's lessons (lib/today-schedule-email.ts) and goes
 * out on any morning with a lesson today, even with nothing unlogged.
 */

export type UnloggedLesson = {
    id: string
    date: string
    time: string
    duration: number
    status: string
    studentId: string
    studentName: string
    accountStatus: string | null
    /** What decides whether Zoom's webhook will log it on its own (tonight's list). */
    zoomMeetingId: string | null
    hasVideo: boolean
    hasDropboxFolder: boolean
    /** Who joined on Zoom (morning email only, #797); undefined when not asked. */
    attendance?: ZoomAttendance
    /** A classroom recording of this student was made around the lesson. */
    classroomRecording?: boolean
    /**
     * The recording to watch before choosing (#940): the lesson's own video_url,
     * else (morning email) a classroom video made in its slot. See addRecordingLinks.
     */
    recordingUrl?: string | null
    /** That recording's length, when known (classroom videos with a start stamp). */
    recordingMinutes?: number | null
}

/** Offer the No-Show button (#797): Zoom shows only Lionel, and no recording says otherwise. */
export function suggestsNoShow(lesson: UnloggedLesson): boolean {
    return looksLikeNoShow(lesson.attendance) && !lesson.hasVideo && !lesson.classroomRecording
}

// Statuses a lesson has before it is logged. 'logging' is a log that started and
// never finished, which still took no credit.
export const UNLOGGED_STATUSES = ['scheduled', 'logging']

export async function findUnloggedLessons(client: DbClient, date: string): Promise<UnloggedLesson[]> {
    const { data: lessons, error } = await client
        .from('lessons')
        .select('id, date, time, duration, status, student_id, zoom_meeting_id, video_url')
        .eq('date', date)
        .in('status', UNLOGGED_STATUSES)
        .order('time', { ascending: true })
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    return withStudents(client, lessons || [])
}

/** A past lesson is listed in the monthly check once it is this many days old. */
export const PAST_UNLOGGED_MIN_DAYS = 2

/**
 * Every lesson more than two days old that is still unlogged, from any date,
 * oldest first (#736: the monthly credit check lists them). The two-day wait
 * leaves recent ones to the 8:30am and 11pm emails and to Zoom.
 */
export async function findPastUnloggedLessons(client: DbClient, now: Date = new Date()): Promise<UnloggedLesson[]> {
    const cutoffMs = now.getTime() - PAST_UNLOGGED_MIN_DAYS * 24 * 60 * 60 * 1000
    const lastDate = isoToStudioWallClock(new Date(cutoffMs).toISOString()).localDate
    const { data: lessons, error } = await client
        .from('lessons')
        .select('id, date, time, duration, status, student_id, zoom_meeting_id, video_url')
        .lte('date', lastDate)
        .in('status', UNLOGGED_STATUSES)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(1000)
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    const found = await withStudents(client, lessons || [])
    return found.filter(l => Date.parse(studioWallClockToISO(l.date, l.time)) < cutoffMs)
}

/** Adds each lesson's student and drops the teacher accounts (#734). */
async function withStudents(client: DbClient, lessons: any[]): Promise<UnloggedLesson[]> {
    if (lessons.length === 0) return []
    const ids = [...new Set(lessons.map(l => l.student_id as string))]
    const { data: students, error: studentError } = await client
        .from('profiles')
        .select('id, name, status, dropbox_recording_folder, credits')
        .in('id', ids)
    if (studentError) throw new Error(`profiles query failed: ${studentError.message}`)
    const byId = new Map((students || []).map(s => [s.id as string, s]))

    return lessons
        .filter(l => !isUntrackedTeacherAccount(byId.get(l.student_id as string)))
        .map(l => {
            const s = byId.get(l.student_id as string)
            const meeting = l.zoom_meeting_id ? String(l.zoom_meeting_id).replace(/\D/g, '') : ''
            return {
                id: l.id as string,
                date: l.date as string,
                time: String(l.time).slice(0, 5),
                duration: (l.duration as number) || 60,
                status: l.status as string,
                studentId: l.student_id as string,
                studentName: (s?.name as string) || 'Unknown student',
                accountStatus: (s?.status as string) ?? null,
                zoomMeetingId: meeting || null,
                hasVideo: !!l.video_url,
                hasDropboxFolder: !!s?.dropbox_recording_folder,
                recordingUrl: watchableUrl(l.video_url),
            }
        })
}

/** A link the Watch button can open: a web address, nothing else. */
function watchableUrl(url: unknown): string | null {
    const s = typeof url === 'string' ? url.trim() : ''
    return /^https?:\/\/\S+$/i.test(s) ? s : null
}

export function formatClock(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function shortDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** One lesson as a line of the email. `withDate` for lists that span many days. */
export function describeUnlogged(lesson: UnloggedLesson, { withDate = false }: { withDate?: boolean } = {}): string {
    const zone = studioTzAbbr(studioWallClockToISO(lesson.date, lesson.time))
    const account = lesson.accountStatus && lesson.accountStatus !== 'active' ? ` (account: ${lesson.accountStatus})` : ''
    const half = lesson.status === 'logging' ? ', logging started but never finished' : ''
    const day = withDate ? `${shortDay(lesson.date)}, ` : ''
    return `${escapeHtml(lesson.studentName)}${account}: ${day}${formatClock(lesson.time)} ${zone}, ${lesson.duration} min${half}${zoomSuffix(lesson)}`
}

/** What Zoom says about the lesson (#797), as the end of its email line. */
function zoomSuffix(lesson: UnloggedLesson): string {
    const a = lesson.attendance
    if (!a) return ''
    let note = attendanceNote(a)
    if (looksLikeNoShow(a) && !suggestsNoShow(lesson)) {
        // Zoom alone, but a recording says the lesson may have happened elsewhere.
        note = note.replace(/^No-show\? /, '')
        note += lesson.classroomRecording ? ', but a classroom recording was made then' : ', but a recording is attached'
    }
    const strong = suggestsNoShow(lesson)
    return `<br><span style="color:${strong ? '#92400e' : '#57534e'};font-size:14px">${strong ? '<b>' : ''}${escapeHtml(note)}${strong ? '</b>' : ''}</span>`
}

export type UnloggedEmailKind = 'morning' | 'tonight'

const BUTTON = 'display:inline-block;padding:11px 18px;margin:0 8px 6px 0;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;line-height:1.2'
const LOG_STYLE = `${BUTTON};background:#15803d;color:#ffffff;border:1px solid #15803d`
const REMOVE_STYLE = `${BUTTON};background:#ffffff;color:#b91c1c;border:1px solid #b91c1c`
const MISSED_STYLE = `${BUTTON};background:#ffffff;color:#92400e;border:1px solid #b45309`
const NO_SHOW_STYLE = `${BUTTON};background:#92400e;color:#ffffff;border:1px solid #92400e`
const WATCH_STYLE = `${BUTTON};background:#ffffff;color:#1d4ed8;border:1px solid #1d4ed8`

/** "Watch" or "Watch (32 min)" (#940): opens the recording itself, changes nothing. */
function watchLabel(lesson: UnloggedLesson): string {
    const m = lesson.recordingMinutes
    return typeof m === 'number' && m > 0 ? `Watch (${Math.round(m)} min)` : 'Watch'
}

function watchButton(lesson: UnloggedLesson): string {
    return lesson.recordingUrl
        ? `<a href="${escapeHtml(lesson.recordingUrl)}" style="${WATCH_STYLE}">${watchLabel(lesson)}</a>`
        : ''
}

/**
 * The lessons as email blocks, each with its one-time buttons (#441). Falls back
 * to a plain list when links cannot be signed (no CRON_SECRET).
 */
export function unloggedLessonBlocks(
    lessons: UnloggedLesson[],
    { now = new Date(), baseUrl = appBaseUrl(), withDate = false }: { now?: Date; baseUrl?: string; withDate?: boolean } = {},
): { lines: string[]; html: string; buttons: boolean } {
    const lines = lessons.map(l => describeUnlogged(l, { withDate }))
    let buttons = true
    const blocks = lessons.map((lesson, i) => {
        const log = signLessonAction({ lessonId: lesson.id, action: 'log', date: lesson.date, time: lesson.time }, now)
        const remove = signLessonAction({ lessonId: lesson.id, action: 'remove', date: lesson.date, time: lesson.time }, now)
        // "I missed it" (#752) only once the lesson is over.
        const missed = lessonEndMs(lesson) <= now.getTime()
            ? signLessonAction({ lessonId: lesson.id, action: 'missed', date: lesson.date, time: lesson.time }, now)
            : null
        // "No-Show" (#797) only where Zoom shows nobody but Lionel joined.
        const noShow = suggestsNoShow(lesson)
            ? signLessonAction({ lessonId: lesson.id, action: 'noshow', date: lesson.date, time: lesson.time }, now)
            : null
        if (!log || !remove) {
            buttons = false
            const watch = lesson.recordingUrl ? ` (<a href="${escapeHtml(lesson.recordingUrl)}">${watchLabel(lesson)}</a>)` : ''
            return `<li>${lines[i]}${watch}</li>`
        }
        const missedButton = missed ? `<a href="${escapeHtml(lessonActionUrl(missed, baseUrl))}" style="${MISSED_STYLE}">I missed it</a>` : ''
        const noShowButton = noShow ? `<a href="${escapeHtml(lessonActionUrl(noShow, baseUrl))}" style="${NO_SHOW_STYLE}">No-Show</a>` : ''
        return `<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px">
<div style="font-size:15px;margin:0 0 10px">${lines[i]}</div>
${watchButton(lesson)}${noShowButton}<a href="${escapeHtml(lessonActionUrl(log, baseUrl))}" style="${LOG_STYLE}">Log it</a><a href="${escapeHtml(lessonActionUrl(remove, baseUrl))}" style="${REMOVE_STYLE}">Didn't happen</a>${missedButton}
</div>`
    })
    const html = buttons ? blocks.join('\n') : `<ul>${blocks.join('')}</ul>`
    return { lines, html, buttons }
}

/** The "I missed it" button (#752), for the footers. */
export const MISSED_IT_NOTE = `<b>I missed it</b> is for a lesson you missed: it removes the lesson (no cancellation email), ` +
    `puts $15 Account Credit on the family's next purchase and sends your apology. Each press: 1 family, 1 portal message ` +
    `(with the usual email notice, and a text if they opted in). Its page shows the exact message first.`

/** The "No-Show" button (#797), for the footer when a lesson carries it. */
export const NO_SHOW_NOTE = `<b>No-Show</b> (only where Zoom shows nobody but you joined) keeps the lesson as a no-show and ` +
    `takes 1 credit, no refund. Nobody is emailed, messaged or texted.`

/** The "Watch" button (#940), for the footer when a lesson carries it. */
export const WATCH_NOTE = `<b>Watch</b> opens the lesson's recording (the one on the lesson, or the classroom video made ` +
    `in its slot) so you can see what happened before choosing. It changes nothing.`

/** What the buttons do, for the footer of any email that carries them. */
export function unloggedButtonsNote(n: number): string {
    const these = n === 1 ? 'this lesson' : 'these lessons'
    return `Nobody logged ${these}, so no credit was taken. <b>Log it</b> if it happened: that takes 1 credit, the usual log ` +
        `(1 family gets the usual lesson email; its page has optional boxes for notes and homework). ` +
        `<b>Didn't happen</b> removes it quietly: no credit, nobody is told. ${MISSED_IT_NOTE} ` +
        `Each button asks you to confirm, works once, and expires in ${LINK_TTL_DAYS} days.`
}

/**
 * Subject, body and footer of the unlogged-lessons email, without sending it,
 * so a dry run can render exactly what would go out.
 */
export function buildUnloggedEmail(
    date: string,
    lessons: UnloggedLesson[],
    { kind = 'morning', now = new Date(), baseUrl = appBaseUrl() }: { kind?: UnloggedEmailKind; now?: Date; baseUrl?: string } = {},
): { subject: string; lines: string[]; html: string; footer: string; buttons: boolean } {
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
    const n = lessons.length
    const plural = n === 1 ? '' : 's'
    const subject = kind === 'tonight'
        ? `Tonight: ${n} lesson${plural} from today not logged yet`
        : `${n} lesson${plural} from ${day} not logged yet`
    const { lines, html, buttons } = unloggedLessonBlocks(lessons, { now, baseUrl })

    const admin = `${baseUrl}/admin`
    const these = n === 1 ? 'this lesson' : 'these lessons'
    const when = kind === 'tonight'
        ? 'This email comes only on evenings with a lesson from today still unlogged. Lessons Zoom recorded are left out, since Zoom logs those itself. The 8:30am email is the backstop.'
        : MORNING_WHEN
    const noShow = lessons.some(suggestsNoShow) ? ` ${NO_SHOW_NOTE}` : ''
    const watch = lessons.some(l => l.recordingUrl) ? ` ${WATCH_NOTE}` : ''
    const footer = buttons
        ? `${unloggedButtonsNote(n)}${noShow}${watch} The <a href="${admin}">admin dashboard</a> works too. ${when}`
        : `Nobody logged ${these}, so no credit was taken. If it happened, log it in the <a href="${admin}">admin dashboard</a> (that takes the credit). If it didn't, cancel it there. ${when}`

    return { subject, lines, html, footer, buttons }
}

const MORNING_WHEN = 'This email comes only on mornings with a lesson today, a lesson unlogged or logged automatically, or a family asking to move a lesson.'

/** Emails the studio inbox about the day's unlogged lessons. No email when there are none. */
export async function alertUnloggedLessons(
    client: DbClient,
    date: string,
    lessons: UnloggedLesson[],
    { kind = 'morning' }: { kind?: UnloggedEmailKind } = {},
): Promise<boolean> {
    if (lessons.length === 0) return false
    const { subject, lines, html, footer } = buildUnloggedEmail(date, lessons, { kind })
    return sendCronAlert(client, { subject, lines, html, footer })
}

// ---------------------------------------------------------------------------
// The morning email: yesterday's unlogged lessons with what Zoom saw (#797),
// and what the portal logged by itself that day (#793).
// ---------------------------------------------------------------------------

/**
 * Asks Zoom who joined each unlogged Zoom lesson that is over (#797), and
 * notes classroom recordings made around them (a lesson moved to the classroom
 * looks like a no-show on Zoom). Fills lesson.attendance in place. Never
 * throws: without Zoom the email simply goes out without the notes.
 */
export async function addZoomAttendance(client: DbClient, lessons: UnloggedLesson[], now: Date = new Date()): Promise<void> {
    const over = lessons.filter(l => lessonEndMs(l) <= now.getTime())
    const zoomLessons = over.filter(l => l.zoomMeetingId)
    if (zoomLessons.length === 0) return

    let token: string | null = null
    try {
        const { getZoomAccessToken } = await import('@/lib/zoom')
        token = await getZoomAccessToken()
    } catch (e) {
        console.error('[unlogged-lessons] Zoom token failed:', e instanceof Error ? e.message : e)
    }
    for (const lesson of zoomLessons) {
        const start = Date.parse(studioWallClockToISO(lesson.date, lesson.time))
        lesson.attendance = token
            ? await zoomAttendance(lesson.zoomMeetingId!, token, start, lessonEndMs(lesson))
            : { kind: 'unknown', reason: 'Zoom could not be reached' }
    }

    try {
        const studentIds = [...new Set(zoomLessons.map(l => l.studentId))]
        const starts = zoomLessons.map(l => Date.parse(studioWallClockToISO(l.date, l.time)))
        const ends = zoomLessons.map(l => lessonEndMs(l))
        const { data: recs, error } = await client
            .from('classroom_recordings')
            .select('student_id, created_at')
            .in('student_id', studentIds)
            .gte('created_at', new Date(Math.min(...starts) - 30 * 60_000).toISOString())
            .lte('created_at', new Date(Math.max(...ends) + 3 * 60 * 60_000).toISOString())
        if (error) throw new Error(error.message)
        for (const lesson of zoomLessons) {
            const start = Date.parse(studioWallClockToISO(lesson.date, lesson.time))
            const end = lessonEndMs(lesson)
            lesson.classroomRecording = (recs || []).some(r => {
                const at = Date.parse(r.created_at as string)
                return r.student_id === lesson.studentId && at >= start - 30 * 60_000 && at <= end + 3 * 60 * 60_000
            })
        }
    } catch (e) {
        // Unknown: keep the No-Show button off rather than guess.
        console.error('[unlogged-lessons] classroom recordings lookup failed:', e instanceof Error ? e.message : e)
        for (const lesson of zoomLessons) lesson.classroomRecording = true
    }
}

/**
 * Finds a recording to watch for each unlogged lesson that has none on it yet
 * (#940): a classroom lesson video made in its slot, matched the way the
 * hand-off attaches one (matchLesson in lib/classroom-recordings.ts, against
 * all of the student's lessons around then) and not already on another
 * lesson. Recordings under 5 minutes are no-shows and never linked; one
 * without a start stamp needs its saved size to pass as a lesson. Several in
 * one slot (a restart): the longest. Zoom recordings still on their way to
 * Dropbox are not looked for; they show once attached. Never throws.
 */
export async function addRecordingLinks(client: DbClient, lessons: UnloggedLesson[]): Promise<void> {
    const missing = lessons.filter(l => !l.recordingUrl)
    if (missing.length === 0) return
    try {
        const cr = await import('@/lib/classroom-recordings')
        const studentIds = [...new Set(missing.map(l => l.studentId))]
        const starts = missing.map(l => Date.parse(studioWallClockToISO(l.date, l.time)))
        const ends = missing.map(l => lessonEndMs(l))
        // A stamped recording starts at most 30 minutes early and is saved when
        // it stops; three hours after the slot covers a long one.
        const { data: recs, error } = await client
            .from('classroom_recordings')
            .select('id, student_id, url, created_at, size_bytes')
            .eq('kind', cr.LESSON_KIND)
            .in('student_id', studentIds)
            .gte('created_at', new Date(Math.min(...starts) - 30 * 60_000).toISOString())
            .lte('created_at', new Date(Math.max(...ends) + 3 * 60 * 60_000).toISOString())
        if (error) throw new Error(`classroom_recordings query failed: ${error.message}`)
        if (!recs || recs.length === 0) return

        const dates = missing.map(l => l.date).sort()
        const { data: around, error: lessonError } = await client
            .from('lessons')
            .select('id, student_id, date, time, duration, status, video_url')
            .in('student_id', studentIds)
            .gte('date', shiftDateStr(dates[0], -1))
            .lte('date', shiftDateStr(dates[dates.length - 1], 1))
        if (lessonError) throw new Error(`lessons query failed: ${lessonError.message}`)
        const onALesson = new Set((around || []).map(l => l.video_url as string | null).filter(Boolean))

        for (const rec of recs) {
            const url = watchableUrl(rec.url)
            if (!url || onALesson.has(rec.url)) continue
            const minutes = cr.recordingMinutes(rec)
            if (minutes !== null && minutes < MIN_LESSON_RECORDING_MINUTES) continue
            if (minutes === null && !(Number(rec.size_bytes) >= cr.MIN_BYTES_WITHOUT_START)) continue
            const studentLessons = (around || []).filter(l => l.student_id === rec.student_id) as ClassroomLessonRow[]
            const match = cr.matchLesson(rec, studentLessons)
            const lesson = match ? missing.find(l => l.id === match.id) : undefined
            if (!lesson) continue
            if (!lesson.recordingUrl || (minutes ?? 0) > (lesson.recordingMinutes ?? 0)) {
                lesson.recordingUrl = url
                lesson.recordingMinutes = minutes
                lesson.classroomRecording = true
            }
        }
    } catch (e) {
        // The email still goes out, just without these Watch buttons.
        console.error('[unlogged-lessons] recording links failed:', e instanceof Error ? e.message : e)
    }
}

export type MorningEmail = { subject: string; lines: string[]; html: string; footer: string }

const TODAY_NOTE = "Today's list: Eastern times, with the family's own time when their profile's zone reads differently. Teacher and test accounts are left out."

/**
 * The whole morning email, without sending it (dry runs render this). Today's
 * lessons (#942) come first when `today` is given, then families asking to
 * move a lesson (#878), who wait on Lionel's answer.
 */
export function buildMorningEmail(
    date: string,
    unlogged: UnloggedLesson[],
    autoLogged: AutoLoggedLesson[],
    { now = new Date(), baseUrl = appBaseUrl(), moveRequests = [], today }: {
        now?: Date
        baseUrl?: string
        moveRequests?: PendingMoveRequest[]
        today?: TodaySchedule
    } = {},
): MorningEmail {
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
    const n = unlogged.length
    const m = autoLogged.length
    const k = moveRequests.length
    const schedule = today ? todayScheduleSection(today) : { lines: [], html: '' }
    const auto = autoLoggedSection(autoLogged, date, { baseUrl })
    const moves = moveRequestsSection(moveRequests, { now, baseUrl, heading: n > 0 || m > 0 || !!today })
    const movesSubject = k ? `${k === 1 ? '1 family asks' : `${k} families ask`} to move a lesson` : ''
    const admin = `${baseUrl}/admin`
    const todayNote = today ? ` ${TODAY_NOTE}` : ''

    if (n === 0) {
        const autoSubject = m ? `${m} lesson${m === 1 ? '' : 's'} logged automatically on ${day}` : ''
        const parts = [movesSubject, autoSubject].filter(Boolean)
        return {
            subject: parts.length
                ? [...parts, todaySubject(today, { lead: false })].filter(Boolean).join('; ')
                : todaySubject(today, { lead: true }),
            lines: [...schedule.lines, ...moves.lines, ...auto.lines],
            html: [schedule.html, moves.html, m ? auto.html : ''].filter(Boolean).join('\n'),
            footer: `${m ? `Everything from ${day} is logged.` : `Nothing from ${day} is waiting to be logged.`} The <a href="${admin}">admin dashboard</a> has the rest.${todayNote} ${MORNING_WHEN}`,
        }
    }

    const unloggedEmail = buildUnloggedEmail(date, unlogged, { kind: 'morning', now, baseUrl })
    const noShows = unlogged.filter(suggestsNoShow).length
    const todayPart = todaySubject(today, { lead: false })
    const subject = (k ? `${movesSubject}; ` : '') +
        unloggedEmail.subject +
        (noShows ? ` (${noShows} No-show?)` : '') +
        (m ? `, ${m} logged automatically` : '') +
        (todayPart ? `; ${todayPart}` : '')
    const unloggedHtml = m || k || today
        ? `<h3 style="font-size:16px;margin:4px 0 8px">Not logged yet (${n})</h3>\n${unloggedEmail.html}`
        : unloggedEmail.html
    const html = [schedule.html, moves.html, unloggedHtml, m ? auto.html : ''].filter(Boolean).join('\n')
    return {
        subject,
        lines: [...schedule.lines, ...moves.lines, ...unloggedEmail.lines, ...auto.lines],
        html,
        footer: `${unloggedEmail.footer}${todayNote}`,
    }
}

export type MorningRun = {
    unlogged: UnloggedLesson[]
    autoLogged: AutoLoggedLesson[]
    moveRequests: PendingMoveRequest[]
    today: TodaySchedule
    email: MorningEmail | null
    emailed: boolean
}

/**
 * The 8:30am email about `date` (yesterday): sent when there is a lesson
 * today (#942), an unlogged lesson, an automatic log, or a family's move
 * request (#878) to show. It opens with today's lessons. `dryRun` builds it
 * without sending.
 */
export async function runMorningEmail(
    client: DbClient,
    date: string,
    { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
): Promise<MorningRun> {
    const unlogged = await findUnloggedLessons(client, date)
    await addZoomAttendance(client, unlogged, now)
    await addRecordingLinks(client, unlogged)
    const today: TodaySchedule = { date: shiftDateStr(date, 1), lessons: null }
    try {
        today.lessons = await findDayLessons(client, today.date)
    } catch (e) {
        // The rest still goes out, saying the list could not be loaded.
        console.error("[unlogged-lessons] today's lessons lookup failed:", e instanceof Error ? e.message : e)
    }
    const autoLogged = await findAutoLoggedLessons(client, date)
    let moveRequests: PendingMoveRequest[] = []
    try {
        // Loaded lazily: the reschedule code it brings is only needed here.
        const { listPendingMoveRequestsCore } = await import('@/lib/core/move-requests')
        moveRequests = await listPendingMoveRequestsCore(client)
    } catch (e) {
        // The rest of the email still goes out; admin shows the requests.
        console.error('[unlogged-lessons] move requests lookup failed:', e instanceof Error ? e.message : e)
    }
    if (unlogged.length === 0 && autoLogged.length === 0 && moveRequests.length === 0 && !today.lessons?.length) {
        return { unlogged, autoLogged, moveRequests, today, email: null, emailed: false }
    }
    const email = buildMorningEmail(date, unlogged, autoLogged, { now, moveRequests, today })
    const emailed = dryRun ? false : await sendCronAlert(client, email)
    return { unlogged, autoLogged, moveRequests, today, email, emailed }
}

// ---------------------------------------------------------------------------
// Tonight's list (#538): which of today's unlogged lessons Zoom will log itself.
// ---------------------------------------------------------------------------

/**
 * Zoom's webhook logs a recorded lesson once the cloud recording finishes
 * processing. Measured Aug-Nov 2026: almost always 2-30 minutes after the
 * scheduled end, rarely up to two hours. A recording that finished more than
 * this long ago without logging the lesson is not going to.
 */
export const ZOOM_SETTLE_MINUTES = 60

export type ZoomRecordingInfo = {
    /** Longest recorded span, null when Zoom gives no timing. */
    minutes: number | null
    /** When the recording ended (ms), null while unknown. */
    endMs: number | null
    /** Zoom is still processing it; the webhook fires when it is done. */
    processing: boolean
}

export function lessonEndMs(lesson: Pick<UnloggedLesson, 'date' | 'time' | 'duration'>): number {
    return Date.parse(studioWallClockToISO(lesson.date, lesson.time)) + lesson.duration * 60_000
}

/**
 * Whether Zoom's webhook will log this lesson on its own soon.
 *
 * The real signal is Zoom's own list of cloud recordings for the day: a 5+
 * minute recording of the lesson's meeting that is still processing, or that
 * finished under an hour ago, is about to be logged. A recording under 5
 * minutes is a no-show by the webhook's rule and never logs. Zoom may not list
 * a recording until it is processed, so a lesson that ended under an hour ago
 * with nothing listed yet is also given the hour. When Zoom could not be asked
 * (`recordings` null) that timing rule is all there is.
 *
 * Whatever Zoom says, the webhook only logs lessons it can file: the student
 * needs a Dropbox recording folder, unless a recording is already attached.
 */
export function zoomWillLog(
    lesson: UnloggedLesson,
    now: Date,
    recordings: Map<string, ZoomRecordingInfo> | null,
): boolean {
    if (!lesson.zoomMeetingId) return false
    if (!lesson.hasDropboxFolder && !lesson.hasVideo) return false
    const settle = ZOOM_SETTLE_MINUTES * 60_000
    const rec = recordings?.get(lesson.zoomMeetingId)
    if (rec) {
        if (rec.processing) return true
        if (rec.minutes !== null && rec.minutes < MIN_LESSON_RECORDING_MINUTES) return false
        const ended = rec.endMs ?? lessonEndMs(lesson)
        return now.getTime() - ended < settle
    }
    return now.getTime() - lessonEndMs(lesson) < settle
}

export type TonightSplit = {
    /** Goes in tonight's email. */
    send: UnloggedLesson[]
    /** Left out: Zoom will log it within the hour. */
    zoomWillLog: UnloggedLesson[]
    /** Left out: not over yet. */
    notEnded: UnloggedLesson[]
}

export function splitForTonight(
    lessons: UnloggedLesson[],
    now: Date,
    recordings: Map<string, ZoomRecordingInfo> | null,
): TonightSplit {
    const split: TonightSplit = { send: [], zoomWillLog: [], notEnded: [] }
    for (const lesson of lessons) {
        if (lessonEndMs(lesson) > now.getTime()) split.notEnded.push(lesson)
        else if (zoomWillLog(lesson, now, recordings)) split.zoomWillLog.push(lesson)
        else split.send.push(lesson)
    }
    return split
}

type ZoomListedMeeting = {
    id?: number | string
    start_time?: string
    duration?: number
    recording_files?: ZoomRecordingFile[]
}

/**
 * Zoom's cloud recordings for a studio day, keyed by meeting number (what
 * lessons.zoom_meeting_id holds). Null when Zoom cannot be asked, so the
 * caller falls back to timing alone.
 */
export async function fetchZoomRecordings(date: string): Promise<Map<string, ZoomRecordingInfo> | null> {
    try {
        const { getZoomAccessToken } = await import('@/lib/zoom')
        const token = await getZoomAccessToken()
        if (!token) return null
        // Zoom's from/to are UTC dates; an Eastern evening runs into the next UTC day.
        const nextDay = new Date(`${date}T00:00:00Z`)
        nextDay.setUTCDate(nextDay.getUTCDate() + 1)
        const to = nextDay.toISOString().slice(0, 10)

        const map = new Map<string, ZoomRecordingInfo>()
        let pageToken = ''
        for (let page = 0; page < 10; page++) {
            const url = `https://api.zoom.us/v2/users/me/recordings?from=${date}&to=${to}&page_size=300${pageToken ? `&next_page_token=${encodeURIComponent(pageToken)}` : ''}`
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
            if (!res.ok) {
                console.error(`[unlogged-lessons] Zoom recordings list failed: ${res.status}`)
                return null
            }
            const body = await res.json() as { meetings?: ZoomListedMeeting[]; next_page_token?: string }
            for (const m of body.meetings || []) {
                const key = String(m.id ?? '').replace(/\D/g, '')
                if (!key) continue
                const files = m.recording_files || []
                const ends = files.map(f => (f.recording_end ? Date.parse(f.recording_end) : NaN)).filter(Number.isFinite)
                const fallbackEnd = m.start_time && typeof m.duration === 'number' ? Date.parse(m.start_time) + m.duration * 60_000 : NaN
                const info: ZoomRecordingInfo = {
                    minutes: recordingMinutes(files, m.duration),
                    endMs: ends.length ? Math.max(...ends) : (Number.isFinite(fallbackEnd) ? fallbackEnd : null),
                    processing: files.length === 0 || files.some(f => f.status && f.status !== 'completed'),
                }
                const prev = map.get(key)
                map.set(key, prev ? {
                    minutes: Math.max(prev.minutes ?? 0, info.minutes ?? 0) || null,
                    endMs: Math.max(prev.endMs ?? 0, info.endMs ?? 0) || null,
                    processing: prev.processing || info.processing,
                } : info)
            }
            pageToken = body.next_page_token || ''
            if (!pageToken) break
        }
        return map
    } catch (e) {
        console.error('[unlogged-lessons] Zoom recordings list threw:', e instanceof Error ? e.message : e)
        return null
    }
}
