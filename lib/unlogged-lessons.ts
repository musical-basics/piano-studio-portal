import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import { LINK_TTL_DAYS, appBaseUrl, lessonActionUrl, signLessonAction } from '@/lib/lesson-action-links'
import { MIN_LESSON_RECORDING_MINUTES, recordingMinutes, type ZoomRecordingFile } from '@/lib/zoom-recordings'

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
 * itself.
 */

export type UnloggedLesson = {
    id: string
    date: string
    time: string
    duration: number
    status: string
    studentName: string
    accountStatus: string | null
    /** What decides whether Zoom's webhook will log it on its own (tonight's list). */
    zoomMeetingId: string | null
    hasVideo: boolean
    hasDropboxFolder: boolean
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
    if (!lessons || lessons.length === 0) return []

    const ids = [...new Set(lessons.map(l => l.student_id as string))]
    const { data: students, error: studentError } = await client
        .from('profiles')
        .select('id, name, status, dropbox_recording_folder')
        .in('id', ids)
    if (studentError) throw new Error(`profiles query failed: ${studentError.message}`)
    const byId = new Map((students || []).map(s => [s.id as string, s]))

    return lessons.map(l => {
        const s = byId.get(l.student_id as string)
        const meeting = l.zoom_meeting_id ? String(l.zoom_meeting_id).replace(/\D/g, '') : ''
        return {
            id: l.id as string,
            date: l.date as string,
            time: String(l.time).slice(0, 5),
            duration: (l.duration as number) || 60,
            status: l.status as string,
            studentName: (s?.name as string) || 'Unknown student',
            accountStatus: (s?.status as string) ?? null,
            zoomMeetingId: meeting || null,
            hasVideo: !!l.video_url,
            hasDropboxFolder: !!s?.dropbox_recording_folder,
        }
    })
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

export function describeUnlogged(lesson: UnloggedLesson): string {
    const zone = studioTzAbbr(studioWallClockToISO(lesson.date, lesson.time))
    const account = lesson.accountStatus && lesson.accountStatus !== 'active' ? ` (account: ${lesson.accountStatus})` : ''
    const half = lesson.status === 'logging' ? ', logging started but never finished' : ''
    return `${escapeHtml(lesson.studentName)}${account}: ${formatClock(lesson.time)} ${zone}, ${lesson.duration} min${half}`
}

export type UnloggedEmailKind = 'morning' | 'tonight'

const BUTTON = 'display:inline-block;padding:11px 18px;margin:0 8px 6px 0;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;line-height:1.2'
const LOG_STYLE = `${BUTTON};background:#15803d;color:#ffffff;border:1px solid #15803d`
const REMOVE_STYLE = `${BUTTON};background:#ffffff;color:#b91c1c;border:1px solid #b91c1c`

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
    const lines = lessons.map(describeUnlogged)

    let buttons = true
    const blocks = lessons.map((lesson, i) => {
        const log = signLessonAction({ lessonId: lesson.id, action: 'log', date: lesson.date, time: lesson.time }, now)
        const remove = signLessonAction({ lessonId: lesson.id, action: 'remove', date: lesson.date, time: lesson.time }, now)
        if (!log || !remove) {
            buttons = false
            return `<li>${lines[i]}</li>`
        }
        return `<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px">
<div style="font-size:15px;margin:0 0 10px">${lines[i]}</div>
<a href="${escapeHtml(lessonActionUrl(log, baseUrl))}" style="${LOG_STYLE}">Log it</a><a href="${escapeHtml(lessonActionUrl(remove, baseUrl))}" style="${REMOVE_STYLE}">Didn't happen</a>
</div>`
    })
    const html = buttons ? blocks.join('\n') : `<ul>${blocks.join('')}</ul>`

    const admin = `${baseUrl}/admin`
    const these = n === 1 ? 'this lesson' : 'these lessons'
    const when = kind === 'tonight'
        ? 'This email comes only on evenings with a lesson from today still unlogged. Lessons Zoom recorded are left out, since Zoom logs those itself. The 8:30am email is the backstop.'
        : 'This email comes only on mornings with something unlogged.'
    const footer = buttons
        ? `Nobody logged ${these}, so no credit was taken. <b>Log it</b> if it happened: that takes 1 credit, the usual log. <b>Didn't happen</b> removes it quietly: no credit, nobody is told. Each button asks you to confirm, works once, and expires in ${LINK_TTL_DAYS} days. The <a href="${admin}">admin dashboard</a> works too. ${when}`
        : `Nobody logged ${these}, so no credit was taken. If it happened, log it in the <a href="${admin}">admin dashboard</a> (that takes the credit). If it didn't, cancel it there. ${when}`

    return { subject, lines, html, footer, buttons }
}

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
