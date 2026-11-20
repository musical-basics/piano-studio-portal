import { studioWallClockToISO } from '@/lib/studio-timezone'
import { familyLocalTime, formatStudioTime } from '@/lib/family-time'
import { isClassroomVideoUrl } from '@/lib/classroom-video-url'

/**
 * The family's "Lesson history" tab (#737): every lesson on their account,
 * whether it took a lesson from their balance, and what was left after.
 * Read-only, built from the family's own lessons rows (the page reads them
 * with the family's own session, so row security keeps it to their rows).
 *
 *   - Counted: logged (status 'completed'), or a no-show ('cancelled'), which
 *     forfeits the lesson. "Left after" is the balance the log recorded
 *     (credit_snapshot), when it recorded one.
 *   - Free: logged with "Free, don't take a credit" (#756, free_reason set).
 *     Nothing was taken; "Left after" is the unchanged balance.
 *   - Not counted: over, but never logged, so nothing was taken for it.
 *   - Upcoming: not over yet.
 * Cancelled lessons are deleted, so they never show.
 *
 * Since #1065 each held lesson also says how it was counted (countedByLine):
 * automatically from the Zoom recording, the classroom recording or classroom
 * attendance, or logged by Lionel, plus the minutes Zoom saw the student in the
 * lesson when Zoom's saved attendance shows they joined. Attendance that shows
 * no student is left out: many of those were classroom lessons where only the
 * Zoom meeting went unused, so it would read as a missed lesson that wasn't.
 *
 * Since #937-#939 each held lesson also carries its notes, homework and a
 * recording link, and the balance changes that are not lessons (purchases,
 * plan renewals, a free trial, Lionel's adjustments with their reason) are
 * listed between them (balanceChangesFromLedger, from credit_transactions).
 */

export type LessonHistoryStatus = 'counted' | 'free' | 'not_counted' | 'upcoming'

export type LessonHistoryRow = {
    id: string
    /** YYYY-MM-DD, studio (Eastern) date. */
    date: string
    /** "8:15pm EST", Eastern. */
    clock: string
    /** "5:15pm your time" from profiles.timezone (#930), or null when it reads the same as Eastern or is unknown. */
    familyClock: string | null
    /** Minutes. */
    duration: number
    status: LessonHistoryStatus
    /** Lessons left on the balance after this one, when it was counted and recorded. */
    leftAfter: number | null
    /** What Lionel wrote for this lesson (#938), held lessons only. */
    notes: string | null
    homework: string | null
    /** The lesson's recording (#937), held lessons only. */
    videoUrl: string | null
    /** How the lesson was counted (#1065), held lessons only. */
    countedBy: string | null
    /** A transcript of the lesson's recording exists (#1342), held lessons only. */
    hasTranscript: boolean
}

/** Zoom's saved attendance for one lesson, as much as the history needs. */
export type LessonAttendance = { kind: string | null; studentSeconds: number | null }

/** Extra records the page reads with the service key, for this family's lessons only. */
export type LessonHistoryExtras = {
    attendance?: Record<string, LessonAttendance>
    transcriptLessonIds?: Set<string>
}

/** A change to the balance that is not a lesson (#939). */
export type BalanceChange = {
    id: string
    /** YYYY-MM-DD, studio (Eastern) date. */
    date: string
    /** When it happened, for ordering. */
    at: string
    delta: number
    /** "monthly plan", "free trial", Lionel's reason; empty when the change was never labelled. */
    label: string
    leftAfter: number
}

export type LessonHistory = {
    rows: LessonHistoryRow[]
    booked: number
    counted: number
    free: number
    notCounted: number
    upcoming: number
    /** profiles.credits now. */
    leftNow: number | null
    /** Purchases, renewals and adjustments, newest first (#939). */
    changes: BalanceChange[]
}

type SourceLesson = {
    id: string
    date: string
    time: string
    duration?: number | null
    status: string
    credit_snapshot?: number | null
    free_reason?: string | null
    notes?: string | null
    homework?: string | null
    video_url?: string | null
    completed_source?: string | null
}


/**
 * One line for a family on how a held lesson was counted (#1065), from
 * lessons.completed_source (see lib/auto-logged-lessons.ts for the values):
 * zoom_webhook = Zoom's recording logged it, classroom_attendance = together in
 * the classroom 20+ minutes, system with a classroom video = the classroom
 * hand-off, admin_ui = Lionel pressed Log (admin, the email buttons). Older
 * lessons (no source), an assistant's log and the old credit repair read
 * "Logged by the studio". When Zoom saw the student, the minutes follow.
 */
export function countedByLine(lesson: SourceLesson, attendance?: LessonAttendance | null): string {
    let how: string
    if (lesson.status === 'cancelled') how = 'Counted as a no-show'
    else {
        switch (lesson.completed_source) {
            case 'zoom_webhook': how = 'Counted automatically when Zoom saved the recording'; break
            case 'classroom_attendance': how = 'Counted automatically: you and Lionel were in the classroom together 20+ minutes'; break
            case 'system':
                how = isClassroomVideoUrl(lesson.video_url) ? 'Counted automatically from the classroom recording' : 'Logged by the studio'
                break
            case 'admin_ui': how = 'Logged by Lionel'; break
            default: how = 'Logged by the studio'
        }
    }
    const secs = attendance?.studentSeconds ?? 0
    if (attendance?.kind === 'student_joined' && secs >= 60) {
        how += `. Zoom: you were in the lesson ${Math.round(secs / 60)} min`
    }
    return how
}

export type LedgerRow = {
    id: string
    changed_at: string
    delta: number
    new_credits: number
    source: string | null
    note: string | null
}

/** Ledger sources that are lessons being logged or charged (already shown as lessons). */
const LESSON_SOURCES = [/^unlogged lesson logged late/i, /^logged by /i, /^late charge/i, /^no-show/i, /^no show/i]

/**
 * The balance changes a family should see (#939): every addition (purchase,
 * renewal, free trial, a credit given back, an adjustment) and lessons Lionel
 * took off with a reason. Lesson logs are left out (the lesson rows show
 * them) and so are test entries.
 */
export function balanceChangesFromLedger(rows: LedgerRow[]): BalanceChange[] {
    const out: BalanceChange[] = []
    for (const r of rows) {
        const source = (r.source || '').trim()
        const note = (r.note || '').trim()
        if (/^test\b/i.test(source) || /^test\b/i.test(note)) continue
        if (!r.delta) continue
        const adjustment = source === 'admin adjustment'
        if (r.delta < 0 && !adjustment) continue
        if (r.delta > 0 && LESSON_SOURCES.some(re => re.test(source)) && !adjustment) continue
        let label: string
        if (adjustment) label = note || (r.delta > 0 ? 'added by Lionel' : 'taken off by Lionel')
        else if (/^log undone: /i.test(source)) label = `given back: ${source.replace(/^log undone: /i, '')}`
        else if (source) label = source
        else label = note
        out.push({
            id: r.id,
            date: new Date(r.changed_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
            at: r.changed_at,
            delta: r.delta,
            label,
            leftAfter: r.new_credits,
        })
    }
    return out.sort((a, b) => b.at.localeCompare(a.at))
}

export function formatLessonClock(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

function safeFamilyTime(date: string, time: string, tz: string | null | undefined): string | null {
    try {
        return familyLocalTime(date, time, tz)
    } catch {
        return null
    }
}

export function lessonHistoryStatus(lesson: SourceLesson, now: Date = new Date()): LessonHistoryStatus {
    if (lesson.status === 'completed' && typeof lesson.free_reason === 'string') return 'free'
    if (lesson.status === 'completed' || lesson.status === 'cancelled') return 'counted'
    const time = String(lesson.time).slice(0, 5)
    const endMs = Date.parse(studioWallClockToISO(lesson.date, time)) + (lesson.duration || 60) * 60_000
    return endMs > now.getTime() ? 'upcoming' : 'not_counted'
}

/** Newest first. Only the fields a family should see leave this function. */
export function buildLessonHistory(
    lessons: SourceLesson[],
    creditsNow: number | null,
    now: Date = new Date(),
    familyTz?: string | null,
    ledger: LedgerRow[] = [],
    extras: LessonHistoryExtras = {},
): LessonHistory {
    const key = (l: SourceLesson) => `${l.date} ${String(l.time).slice(0, 5)}`
    const rows = [...lessons]
        .sort((a, b) => key(b).localeCompare(key(a)))
        .map((l): LessonHistoryRow => {
            const status = lessonHistoryStatus(l, now)
            const held = status === 'counted' || status === 'free'
            return {
                id: l.id,
                date: l.date,
                clock: formatStudioTime(String(l.time), l.date),
                familyClock: safeFamilyTime(l.date, String(l.time), familyTz),
                duration: l.duration || 60,
                status,
                leftAfter: (status === 'counted' || status === 'free') && typeof l.credit_snapshot === 'number' ? l.credit_snapshot : null,
                notes: status === 'counted' || status === 'free' ? (l.notes || '').trim() || null : null,
                homework: status === 'counted' || status === 'free' ? (l.homework || '').trim() || null : null,
                videoUrl: status === 'counted' || status === 'free' ? l.video_url || null : null,
                countedBy: held ? countedByLine(l, extras.attendance?.[l.id]) : null,
                hasTranscript: held && !!extras.transcriptLessonIds?.has(l.id),
            }
        })

    return {
        rows,
        booked: rows.length,
        counted: rows.filter(r => r.status === 'counted').length,
        free: rows.filter(r => r.status === 'free').length,
        notCounted: rows.filter(r => r.status === 'not_counted').length,
        upcoming: rows.filter(r => r.status === 'upcoming').length,
        leftNow: typeof creditsNow === 'number' ? creditsNow : null,
        changes: balanceChangesFromLedger(ledger),
    }
}
