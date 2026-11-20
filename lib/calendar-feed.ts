/**
 * "Add to my calendar" (#1082): the iCalendar (RFC 5545) text of one family's
 * lesson feed. Plain functions, no database: lib/core/calendar-feed.ts loads
 * the rows and the route serves the result.
 *
 * Times go out in UTC (DTSTART/DTEND ending in Z), turned from the stored
 * studio wall-clock by studioWallClockToISO (the same helper the reminders
 * and the history tab use), so every phone shows a lesson in its own zone and
 * daylight saving is handled once, here, the same way as everywhere else.
 *
 * Each lesson keeps its UID (lesson id), so a moved lesson updates in place.
 * Cancelling deletes the lesson row, so it simply drops out of the next fetch.
 */

import { studioWallClockToISO } from '@/lib/studio-timezone'
import { familyLessonLinks } from '@/lib/lesson-venue'

/** The portal's host, used in UIDs (stable whatever URL served the feed). */
export const FEED_UID_DOMAIN = 'lessons.musicalbasics.com'

/** How often a calendar is asked to re-check (Apple honors it; Google polls on its own clock). */
export const FEED_REFRESH = 'PT1H'

/** Lessons this many days back stay in the feed (the rest of the past is dropped). */
export const FEED_PAST_DAYS = 30

/** A feed token: 32 URL-safe characters (24 random bytes). */
export const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

export type FeedLesson = {
    id: string
    date: string // YYYY-MM-DD, studio wall-clock
    time: string // HH:MM[:SS], studio wall-clock
    duration: number | null
    status: string
    zoom_link: string | null
    updated_at: string | null
    created_at: string | null
}

export type FeedInput = {
    lessons: FeedLesson[]
    /** The student's venue fields and default Zoom link. */
    profile: { lesson_venue?: string | null; public_id?: string | null; zoom_link?: string | null; name?: string | null }
    /** The studio's default Zoom link (the admin profile), last fallback. */
    studioZoomLink?: string | null
    /** "Lionel", for "Piano lesson with Lionel". */
    teacherFirstName?: string | null
    /** Where the family's portal lives, for the event description. */
    portalUrl: string
    now?: Date
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
export function escapeText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Fold one content line at 75 octets (RFC 5545 3.1): continuation lines start
 * with a single space. Splits on UTF-8 character boundaries, never inside one.
 */
export function foldLine(line: string): string {
    const enc = new TextEncoder()
    if (enc.encode(line).length <= 75) return line
    const parts: string[] = []
    let current = ''
    let currentBytes = 0
    let limit = 75 // the first line holds 75 octets, later ones 74 plus the leading space
    for (const ch of line) {
        const n = enc.encode(ch).length
        if (currentBytes + n > limit) {
            parts.push(current)
            current = ''
            currentBytes = 0
            limit = 74
        }
        current += ch
        currentBytes += n
    }
    if (current) parts.push(current)
    return parts.join('\r\n ')
}

/** 2026-11-20T21:30:00.000Z -> 20261120T213000Z */
export function icsUtc(iso: string | number | Date): string {
    return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Changes each time the row is edited (seconds since 2025), as SEQUENCE wants. */
function sequenceOf(updatedAt: string | null): number {
    if (!updatedAt) return 0
    const ms = Date.parse(updatedAt)
    if (Number.isNaN(ms)) return 0
    return Math.max(0, Math.floor((ms - Date.UTC(2025, 0, 1)) / 1000))
}

/** The lesson's join link, as the portal's join button would give it. */
export function joinLinkFor(lesson: FeedLesson, input: Pick<FeedInput, 'profile' | 'studioZoomLink'>): { link: string | null; venue: 'zoom' | 'classroom' } {
    const zoom = lesson.zoom_link || input.profile.zoom_link || input.studioZoomLink || null
    const links = familyLessonLinks(input.profile, zoom)
    return links.venue === 'classroom'
        ? { link: links.classroomLink, venue: 'classroom' }
        : { link: links.zoomLink, venue: 'zoom' }
}

/** The calendar's display name: "Piano lessons (Emma)" so two children's feeds differ. */
export function calendarName(studentName: string | null | undefined): string {
    const first = (studentName || '').trim().split(/\s+/)[0]
    return first ? `Piano lessons (${first})` : 'Piano lessons'
}

/** The whole VCALENDAR, CRLF line endings, folded. */
export function buildLessonFeed(input: FeedInput): string {
    const now = input.now ?? new Date()
    const stamp = icsUtc(now)
    const summary = input.teacherFirstName ? `Piano lesson with ${input.teacherFirstName}` : 'Piano lesson'
    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Lionel Yu Piano Studio//Lesson feed//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeText(calendarName(input.profile.name))}`,
        `X-WR-CALDESC:${escapeText(`Your piano lessons. Times show in your own time zone. Manage lessons at ${input.portalUrl}`)}`,
        `REFRESH-INTERVAL;VALUE=DURATION:${FEED_REFRESH}`,
        `X-PUBLISHED-TTL:${FEED_REFRESH}`,
    ]

    const sorted = [...input.lessons].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    for (const lesson of sorted) {
        if (lesson.status !== 'scheduled' && lesson.status !== 'completed') continue
        const hhmm = String(lesson.time).slice(0, 5)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.date) || !/^\d{2}:\d{2}$/.test(hhmm)) continue
        const startIso = studioWallClockToISO(lesson.date, hhmm)
        const endMs = Date.parse(startIso) + (lesson.duration || 60) * 60_000
        const { link, venue } = joinLinkFor(lesson, input)
        const where = venue === 'classroom' ? 'Online classroom' : 'Zoom'

        const description = [
            link ? `Join (${where}): ${link}` : null,
            `Your lessons, messages and recordings: ${input.portalUrl}`,
        ].filter(Boolean).join('\n')

        lines.push(
            'BEGIN:VEVENT',
            `UID:${lesson.id}@${FEED_UID_DOMAIN}`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${icsUtc(startIso)}`,
            `DTEND:${icsUtc(endMs)}`,
            `SEQUENCE:${sequenceOf(lesson.updated_at)}`,
            ...(lesson.updated_at ? [`LAST-MODIFIED:${icsUtc(lesson.updated_at)}`] : []),
            ...(lesson.created_at ? [`CREATED:${icsUtc(lesson.created_at)}`] : []),
            `SUMMARY:${escapeText(summary)}`,
            `LOCATION:${escapeText(link || where)}`,
            ...(link ? [`URL:${link}`] : []),
            `DESCRIPTION:${escapeText(description)}`,
            'STATUS:CONFIRMED',
            'TRANSP:OPAQUE',
            'END:VEVENT',
        )
    }

    lines.push('END:VCALENDAR')
    return lines.map(foldLine).join('\r\n') + '\r\n'
}
