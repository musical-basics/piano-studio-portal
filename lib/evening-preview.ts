import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { STUDIO_TZ, isoToStudioWallClock, shiftDateStr, studioWallClockToISO } from '@/lib/studio-timezone'
import { familyLocalTime, formatStudioTime } from '@/lib/family-time'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import { appBaseUrl } from '@/lib/lesson-action-links'

/**
 * The evening email (#759): at 9pm Eastern, one email to the studio inbox with
 * tomorrow's lessons and every family message still waiting on a reply, so
 * Lionel starts the day ready. Sent only when tomorrow has lessons. Read-only:
 * it changes nothing and no family is emailed.
 *
 * Lessons: Eastern time, the family's own time when their profile has a zone,
 * name, length, Zoom or classroom when the lesson's link says so, and a flag
 * when the family asked to skip, cancel or move that day (an active
 * lesson_intent_flags row) or has no lessons left.
 *
 * Messages: for each family thread, the family's latest message when Lionel has
 * not replied (or reacted to it) since, up to 14 days old, longest waiting
 * first. Everything a family sends counts (chat, email reply, text; even a
 * texted STOP, which he should see). The portal's own notices sent from his
 * account (late-cancel fee, account credit) do not count as a reply. Drafts
 * waiting for his sign-off live in the command center, not here.
 *
 * The two teacher accounts (isUntrackedTeacherAccount) and the test accounts
 * (status 'other', "Test / Teacher" in the roster) are left out of both.
 */

/** How far back an unanswered family message is still listed. */
export const WAITING_MAX_DAYS = 14

/** Characters of each waiting message shown in the email. */
const PREVIEW_CHARS = 120

/** Intents that mean the family does not want tomorrow's lesson as booked. */
const DATE_CONFLICT_INTENTS: Record<string, string> = {
    skip_requested: 'asked to skip this day',
    cancel_requested: 'asked to cancel this day',
    reschedule_requested: 'asked to move this lesson',
}

/**
 * Messages the portal writes on its own from Lionel's account. They are not a
 * reply to whatever the family said last (see cancelLessonCore and
 * addAccountCreditCore).
 */
const AUTOMATIC_STUDIO_MESSAGES = [
    /^Late cancellation fee: \$/,
    /^A \$[\d.,]+ credit has been added to your account for "/,
]

export type EveningLesson = {
    id: string
    date: string
    /** "17:30" */
    time: string
    /** "5:30pm EST" */
    studioTime: string
    /** "2:30pm their time", or null when unknown or the same as Eastern. */
    familyTime: string | null
    name: string
    minutes: number
    place: 'Zoom' | 'classroom' | null
    status: string
    flags: string[]
}

export type WaitingThread = {
    name: string
    /** The family's latest message. */
    messageId: string
    at: string
    /** Plain text, collapsed and cut to PREVIEW_CHARS (escape before HTML). */
    preview: string
    /** Family messages since Lionel's last reply, this one included. */
    count: number
    /** When the first of those came in. */
    firstAt: string
    /** Every one of them is just a thank-you or an okay (see isThanksOnly). */
    thanksOnly: boolean
}

export type EveningPreview = {
    /** The lesson day, YYYY-MM-DD (Eastern). */
    date: string
    /** "Thu Nov 19" */
    label: string
    /** The moment the message list is as of. */
    asOf: string
    lessons: EveningLesson[]
    /** Threads that need a reply, longest waiting first. */
    waiting: WaitingThread[]
    /** Threads that ended on a plain thank-you: listed, but on one quiet line. */
    thanks: WaitingThread[]
}

type Profile = {
    id: string
    name: string | null
    role: string | null
    status: string | null
    credits: number | null
    timezone: string | null
    lesson_duration: number | null
}

const counted = (p: Profile | undefined): p is Profile =>
    !!p && p.status !== 'other' && !isUntrackedTeacherAccount(p)

function displayName(p: Profile | undefined): string {
    return p?.name?.trim() || 'Unknown student'
}

/** The lesson day an evening run covers: the Eastern day after the evening that is running. */
export function eveningLessonDate(now: Date = new Date()): string {
    // 02:00 UTC is 9pm EST or 10pm EDT on the previous Eastern day. Six hours
    // back lands safely in that evening in both seasons, and a late manual run
    // after midnight still means the day that is coming.
    const evening = isoToStudioWallClock(new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()).localDate
    return shiftDateStr(evening, 1)
}

/**
 * What the message list is as of: now for tomorrow or later, or 9pm Eastern the
 * evening before for a past day (so a dry run of last Tuesday shows what that
 * evening's email would have said, apart from messages deleted since).
 */
export function eveningAsOf(date: string, now: Date = new Date()): Date {
    const evening = new Date(studioWallClockToISO(shiftDateStr(date, -1), '21:00'))
    return date < eveningLessonDate(now) ? evening : now
}

function placeOf(link: string | null, meetingId: string | null): EveningLesson['place'] {
    const url = (link || '').toLowerCase()
    if (url.includes('classroom')) return 'classroom'
    if (url.includes('zoom.us') || (meetingId && /\d/.test(meetingId))) return 'Zoom'
    return null
}

const THANKS_ONLY = /^(?:(?:hi|hello|hey|dear)\s+lionel[\s,.!]*)?(?:thanks?|thank you|thx|ty|ok|okay|got it|no problem|no worries|sounds good|perfect|great|will do|you too)(?:\s+(?:so|very)\s+much|\s+a lot|\s+again)?(?:[\s,.!]+lionel)?[\s,.!]*$/

/**
 * A message that is only "Thank you!", "Hello Lionel, thanks so much", "No
 * problem!" and the like: no reply needed (Lionel's rule), but still shown.
 * Emoji are ignored; anything else in the message makes it a real one.
 */
export function isThanksOnly(content: string | null, attachments?: unknown): boolean {
    if (Array.isArray(attachments) && attachments.length) return false
    const text = (content || '').toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z\s,.!]/g, '').replace(/\s+/g, ' ').trim()
    return !!text && THANKS_ONLY.test(text)
}

function previewOf(content: string | null, attachments: unknown): string {
    // Links a family sent are shown as "[link]": mail apps turn any URL into a
    // tappable link, and a preview is not the place to open an unknown site.
    const text = (content || '')
        .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]')
        .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|link|xyz|me|ly|gg|ru|cn|info|biz|site|online|shop|top)(?:\/\S*)?\b/gi, '[link]')
        .replace(/\s+/g, ' ')
        .trim()
    const files = Array.isArray(attachments) ? attachments.length : 0
    if (!text) return files ? `(sent ${files === 1 ? 'a file' : `${files} files`})` : '(empty message)'
    return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}...` : text
}

/**
 * A studio day's lessons, earliest first, as the evening email lists them:
 * Eastern time, the family's own time, name, length, Zoom or classroom, and
 * flags. Teacher and test accounts are left out. Also the morning email's
 * "Today" list (#942). `profiles` saves a query when the caller has them all.
 */
export async function findDayLessons(
    client: DbClient,
    date: string,
    profiles?: Map<string, Profile>,
): Promise<EveningLesson[]> {
    const { data: lessonRows, error: lessonError } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, status, zoom_link, zoom_meeting_id')
        .eq('date', date)
        .neq('status', 'cancelled')
        .order('time', { ascending: true })
    if (lessonError) throw new Error(`lessons query failed: ${lessonError.message}`)

    let byId = profiles
    if (!byId) {
        const ids = [...new Set((lessonRows || []).map(l => l.student_id as string))]
        const { data: profileRows, error: profileError } = ids.length
            ? await client.from('profiles').select('id, name, role, status, credits, timezone, lesson_duration').in('id', ids)
            : { data: [], error: null }
        if (profileError) throw new Error(`profiles query failed: ${profileError.message}`)
        byId = new Map(((profileRows || []) as Profile[]).map(p => [p.id, p]))
    }
    const people = byId
    const rows = (lessonRows || []).filter(l => counted(people.get(l.student_id)))

    const studentIds = [...new Set(rows.map(l => l.student_id as string))]
    const { data: flagRows, error: flagError } = studentIds.length
        ? await client
            .from('lesson_intent_flags')
            .select('student_id, lesson_id, intent')
            .eq('target_date', date)
            .eq('status', 'active')
            .in('intent', Object.keys(DATE_CONFLICT_INTENTS))
            .in('student_id', studentIds)
        : { data: [], error: null }
    if (flagError) throw new Error(`lesson_intent_flags query failed: ${flagError.message}`)

    return rows.map(l => {
        const p = people.get(l.student_id)!
        const time = String(l.time).slice(0, 5)
        const flags = [...new Set((flagRows || [])
            .filter(f => f.student_id === l.student_id && (!f.lesson_id || f.lesson_id === l.id))
            .map(f => DATE_CONFLICT_INTENTS[f.intent as string]))]
        const credits = Number(p.credits ?? 0)
        if (credits <= 0) flags.push(credits === 0 ? '0 lessons left' : `no lessons left (balance ${credits})`)
        let familyTime: string | null = null
        try {
            familyTime = familyLocalTime(date, time, p.timezone)?.replace(/your time$/, 'their time') ?? null
        } catch {
            familyTime = null
        }
        return {
            id: l.id,
            date,
            time,
            studioTime: formatStudioTime(time, date),
            familyTime,
            name: displayName(p),
            minutes: Number(l.duration) || Number(p.lesson_duration) || 60,
            place: placeOf(l.zoom_link, l.zoom_meeting_id),
            status: l.status,
            flags,
        }
    })
}

export async function buildEveningPreview(
    client: DbClient,
    date: string,
    { asOf = eveningAsOf(date) }: { asOf?: Date } = {},
): Promise<EveningPreview> {
    const { data: profileRows, error: profileError } = await client
        .from('profiles')
        .select('id, name, role, status, credits, timezone, lesson_duration')
    if (profileError) throw new Error(`profiles query failed: ${profileError.message}`)
    const profiles = new Map(((profileRows || []) as Profile[]).map(p => [p.id, p]))
    const admin = [...profiles.values()].find(p => p.role === 'admin')
    if (!admin) throw new Error('no admin profile found')

    // ---- Tomorrow's lessons.
    const lessons = await findDayLessons(client, date, profiles)

    // ---- Family messages still waiting on a reply.
    const since = new Date(asOf.getTime() - WAITING_MAX_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: messageRows, error: messageError } = await client
        .from('messages')
        .select('id, sender_id, recipient_id, content, attachments, created_at')
        .or(`sender_id.eq.${admin.id},recipient_id.eq.${admin.id}`)
        .gte('created_at', since)
        .lte('created_at', asOf.toISOString())
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(5000)
    if (messageError) throw new Error(`messages query failed: ${messageError.message}`)

    // Per family, the run of their messages since Lionel's last real reply.
    const runs = new Map<string, any[]>()
    for (const m of messageRows || []) {
        const fromStudio = m.sender_id === admin.id
        const familyId = fromStudio ? m.recipient_id : m.sender_id
        const family = profiles.get(familyId)
        if (!counted(family) || !['student', 'prospect'].includes(family.role || '')) continue
        if (fromStudio) {
            if (AUTOMATIC_STUDIO_MESSAGES.some(re => re.test(m.content || ''))) continue
            runs.delete(familyId)
        } else {
            runs.set(familyId, [...(runs.get(familyId) || []), m])
        }
    }

    // A reaction from Lionel on their latest message counts as an answer.
    const lastIds = [...runs.values()].map(run => run[run.length - 1].id as string)
    const reacted = new Set<string>()
    if (lastIds.length) {
        const { data: reactions, error: reactionError } = await client
            .from('message_reactions')
            .select('message_id')
            .eq('user_id', admin.id)
            .in('message_id', lastIds)
            .lte('created_at', asOf.toISOString())
        if (reactionError) throw new Error(`message_reactions query failed: ${reactionError.message}`)
        for (const r of reactions || []) reacted.add(r.message_id)
    }

    const threads: WaitingThread[] = [...runs.entries()]
        .filter(([, run]) => !reacted.has(run[run.length - 1].id))
        .map(([familyId, run]) => {
            const last = run[run.length - 1]
            return {
                name: displayName(profiles.get(familyId)),
                messageId: last.id,
                at: last.created_at,
                preview: previewOf(last.content, last.attachments),
                count: run.length,
                firstAt: run[0].created_at,
                thanksOnly: run.every(m => isThanksOnly(m.content, m.attachments)),
            }
        })
        .sort((a, b) => a.firstAt.localeCompare(b.firstAt))

    return {
        date,
        label: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
        asOf: asOf.toISOString(),
        lessons,
        waiting: threads.filter(t => !t.thanksOnly),
        thanks: threads.filter(t => t.thanksOnly),
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "3 hours ago", "2 days ago" */
export function agoLabel(at: string, asOf: string): string {
    const minutes = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(at)) / 60000))
    if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${plural(hours, 'hour')} ago`
    return `${plural(Math.floor(hours / 24), 'day')} ago`
}

/** "Mon 3:14pm" in Eastern. */
function studioStamp(iso: string): string {
    const d = new Date(iso)
    const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: STUDIO_TZ })
    const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: STUDIO_TZ }).replace(' ', '').toLowerCase()
    return `${day} ${clock}`
}

export function eveningPreviewSubject(p: EveningPreview): string {
    const n = p.waiting.length
    return `Tomorrow: ${plural(p.lessons.length, 'lesson')}, ${n === 0 ? 'no messages' : plural(n, 'message')} waiting`
}

const H = 'font-size:16px;margin:18px 0 6px;padding-top:10px;border-top:1px solid #e5e7eb'
const P = 'font-size:15px;margin:4px 0;line-height:1.45'
const ITEM = 'font-size:15px;margin:0 0 12px;line-height:1.45'
const FLAG = 'display:inline-block;margin:2px 6px 0 0;padding:1px 7px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:13px;font-weight:600'
const QUOTE = 'margin:3px 0 0;padding:2px 0 2px 10px;border-left:3px solid #d1d5db;color:#374151;font-size:14px;word-break:break-word'
const MUTED = 'font-size:13px;color:#555;margin:4px 0'

export function renderEveningPreview(p: EveningPreview): { subject: string; html: string; footer: string } {
    const parts: string[] = []
    parts.push(`<p style="${MUTED}">${escapeHtml(p.label)}, times Eastern</p>`)

    parts.push(`<h3 style="${H}">Lessons</h3>`)
    for (const l of p.lessons) {
        const details = [`${l.minutes} min`, l.place].filter(Boolean).join(', ')
        const flags = l.flags.map(f => `<span style="${FLAG}">${escapeHtml(f)}</span>`).join('')
        parts.push(`<div style="${ITEM}"><b>${escapeHtml(l.studioTime)}</b>`
            + `${l.familyTime ? ` <span style="color:#555">(${escapeHtml(l.familyTime)})</span>` : ''}`
            + `<br>${escapeHtml(l.name)}, ${escapeHtml(details)}`
            + `${flags ? `<br>${flags}` : ''}</div>`)
    }

    parts.push(`<h3 style="${H}">Messages waiting on you</h3>`)
    if (p.waiting.length === 0) {
        parts.push(`<p style="${P}">None. Every family has an answer.</p>`)
    } else {
        for (const w of p.waiting) {
            const ago = agoLabel(w.at, p.asOf)
            const firstAgo = agoLabel(w.firstAt, p.asOf)
            const more = w.count > 1 ? `, ${w.count} messages since your last reply${firstAgo !== ago ? `, first ${firstAgo}` : ''}` : ''
            parts.push(`<div style="${ITEM}"><b>${escapeHtml(w.name)}</b>`
                + ` <span style="color:#555">${ago} (${studioStamp(w.at)})${more}</span>`
                + `<div style="${QUOTE}">${escapeHtml(w.preview)}</div></div>`)
        }
    }
    if (p.thanks.length) {
        parts.push(`<p style="${MUTED}">Ended on a thank-you, probably no reply needed: `
            + `${p.thanks.map(t => `${escapeHtml(t.name)} (${agoLabel(t.at, p.asOf)})`).join(', ')}.</p>`)
    }
    parts.push(`<p style="${MUTED}"><a href="${appBaseUrl()}/admin">Open the portal</a></p>`)

    return {
        subject: eveningPreviewSubject(p),
        html: parts.join('\n'),
        footer: 'Sent at 9pm Eastern (10pm in summer) by the portal (/api/cron/evening-preview), only to you and only before a day with lessons. '
            + 'Nothing goes to families. "Their time" comes from the family\'s time zone in their profile. '
            + `Messages: the family wrote last within ${WAITING_MAX_DAYS} days and you have not replied or reacted since; drafts waiting for your yes are in the command center. `
            + 'Teacher and test accounts are left out.',
    }
}

/** Emails the preview to the studio inbox. Returns whether it went out. */
export async function sendEveningPreview(client: DbClient, preview: EveningPreview): Promise<boolean> {
    const { subject, html, footer } = renderEveningPreview(preview)
    return sendCronAlert(client, { subject, lines: [], html, footer })
}
