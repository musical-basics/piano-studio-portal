/**
 * The "I missed this" apology, as one message. Plain module (no server code) so
 * the confirm dialog builds the exact same text the server sends, for whichever
 * of the $15 and the make-up lesson (#789) Lionel ticked.
 */

import { shiftDateStr } from '@/lib/studio-timezone'
import { formatLessonTimeForFamily } from '@/lib/family-time'

export const MISSED_LESSON_CREDIT_CENTS = 1500
export const MISSED_LESSON_CREDIT_DOLLARS = `$${MISSED_LESSON_CREDIT_CENTS / 100}`

const CREDIT_SENTENCE =
    `I have added ${MISSED_LESSON_CREDIT_DOLLARS} to your next purchase for the miss and making you wait, it comes off automatically. ` +
    `You can see it under Account Credit in the portal.`

export function weekdayName(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

export function monthDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** Which day the apology talks about, judged in studio (Eastern) time. */
export function missedDayPhrase(lessonDate: string, today: string): string {
    if (lessonDate === today) return "today I was unable to make today's lesson"
    if (lessonDate === shiftDateStr(today, -1)) return "I was unable to make yesterday's lesson"
    // Within the last week the weekday alone is unambiguous; further back it isn't.
    if (lessonDate >= shiftDateStr(today, -6)) return `I was unable to make your lesson on ${weekdayName(lessonDate)}`
    return `I was unable to make your lesson on ${weekdayName(lessonDate)}, ${monthDay(lessonDate)}`
}

/** "Thursday, November 20 at 4:30pm EST (1:30pm your time)", as the family reads it. */
export function makeupLabelForFamily(date: string, time: string, familyTz: string | null | undefined): string {
    return `${weekdayName(date)}, ${monthDay(date)} at ${formatLessonTimeForFamily(date, time, familyTz)}`
}

export type MissedLessonOptions = {
    /** $15 on the next purchase (the original "I missed this"). */
    credit: boolean
    /** A make-up lesson booked in a free slot, with the family's time zone for its label. */
    makeup?: { date: string; time: string; familyTz?: string | null } | null
}

/**
 * Lionel's Nov 8 apology. With only the $15 it is word for word the original;
 * a make-up lesson adds one plain sentence about the booking.
 */
export function missedLessonApology(
    firstName: string | null,
    lessonDate: string,
    today: string,
    options: MissedLessonOptions = { credit: true },
): string {
    const opening = `Hi ${firstName || 'there'}, I'm sorry, ${missedDayPhrase(lessonDate, today)}. `
    const makeup = options.makeup
        ? `I have booked a make-up lesson for ${makeupLabelForFamily(options.makeup.date, options.makeup.time, options.makeup.familyTz)}, you'll get the usual email with the details. `
        : ''
    if (options.credit) {
        // The original wording, with "and making you wait" kept as he wrote it.
        return `${opening}${makeup}${CREDIT_SENTENCE} My apologies for this!`
    }
    return `${opening}${makeup}My apologies for this!`
}
