// Which reminder notice (if any) a lesson is owed, given how far away it is and
// whether the student has confirmed attendance.
//
// Unconfirmed lessons: 48h, 24h, 12h and 15m notices, each asking the student
// to confirm. Confirmed lessons: just the 24h and 15m reminders.
//
// SELF-HEALING. Notices used to fire only inside narrow windows (a 24h notice
// was reachable only between 24h and 25h before the lesson). A cron tick that
// missed the window lost that notice permanently, so a throttled scheduler in
// Aug 2026 silently stopped reminding students for a week.
//
// A notice is now simply DUE from its trigger point until the lesson starts, so
// a late tick still delivers it. When several are due at once (the scheduler was
// down, or the lesson was booked at short notice) only the most urgent is sent
// and the rest are marked superseded, so a student never gets a burst of four
// emails and never gets told "see you tomorrow" about a lesson starting in an
// hour. Callers pick the wording from the ACTUAL time remaining, not from the
// notice key, since a late notice's key no longer describes reality.
//
// Pure functions so the cron's decision logic is testable outside Next.js.

export type NoticeKey = '48h' | '24h' | '12h' | '15m'

export type SentFlags = Record<NoticeKey, boolean>

// Minutes before the lesson at which each notice becomes due. Ordered MOST
// URGENT FIRST: `dueNotice` relies on that ordering to pick the winner.
// The 15m notice triggers at 25 minutes so a 10-minute cron reliably has a
// chance at it before the lesson starts.
const NOTICES: Array<{ key: NoticeKey; dueAt: number; whenConfirmed: boolean }> = [
    { key: '15m', dueAt: 25, whenConfirmed: true },
    { key: '12h', dueAt: 720, whenConfirmed: false },
    { key: '24h', dueAt: 1440, whenConfirmed: true },
    { key: '48h', dueAt: 2880, whenConfirmed: false },
]

export const NOTICE_FLAG_COLUMNS: Record<NoticeKey, string> = {
    '48h': 'reminder_48h_sent',
    '24h': 'reminder_24h_sent',
    '12h': 'reminder_12h_sent',
    '15m': 'reminder_15m_sent',
}

export const ALL_NOTICES: NoticeKey[] = ['48h', '24h', '12h', '15m']

export type NoticeDecision = {
    /** The notice to send now. */
    notice: NoticeKey
    /**
     * Notices that came due but were overtaken by a more urgent one. Flag these
     * sent alongside the delivered notice so they don't fire later out of order.
     */
    superseded: NoticeKey[]
    /**
     * Minutes past this notice's intended trigger point. Small values are normal
     * (the cron only ticks every 10 minutes); large values mean the scheduler
     * was down and the notice is being recovered rather than delivered on time.
     */
    lateByMinutes: number
}

export function dueNotice(
    diffMinutes: number,
    isConfirmed: boolean,
    sent: SentFlags,
): NoticeDecision | null {
    // The lesson has started. Nothing left to warn anyone about.
    if (diffMinutes <= 0) return null

    const due = NOTICES.filter(n =>
        (n.whenConfirmed || !isConfirmed) &&
        !sent[n.key] &&
        diffMinutes <= n.dueAt
    )
    if (due.length === 0) return null

    // NOTICES is ordered most urgent first, and filter preserves order.
    const [chosen, ...overtaken] = due
    return {
        notice: chosen.key,
        superseded: overtaken.map(n => n.key),
        lateByMinutes: Math.max(0, Math.round(chosen.dueAt - diffMinutes)),
    }
}

/**
 * True when a lesson has begun without the student ever having been told.
 *
 * With self-healing notices this is the only remaining way a reminder can be
 * genuinely lost: the scheduler was down for the lesson's entire lead time. It
 * is the condition worth waking someone up for.
 */
export function neverNotified(sent: SentFlags): boolean {
    return ALL_NOTICES.every(key => !sent[key])
}
