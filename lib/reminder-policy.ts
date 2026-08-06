// Which reminder notice (if any) is due for a lesson, given how far away it is
// and whether the student has confirmed attendance.
//
// Unconfirmed lessons: 48h, 24h, 12h and 15m notices, each asking the student
// to confirm. Confirmed lessons: just the 24h and 15m reminders.
//
// Pure function so the cron's decision logic is testable outside Next.js.

export type NoticeKey = '48h' | '24h' | '12h' | '15m'

export type SentFlags = Record<NoticeKey, boolean>

// Each window is one hour wide ([min, max) minutes before the lesson) except
// the 15m notice, which is widened to [0, 25) to catch late cron ticks. The
// every-10-minutes cron lands in each window several times; the sent flag
// makes delivery exactly-once.
const WINDOWS: Array<{ key: NoticeKey; min: number; max: number; whenConfirmed: boolean }> = [
    { key: '15m', min: 0, max: 25, whenConfirmed: true },
    { key: '12h', min: 720, max: 780, whenConfirmed: false },
    { key: '24h', min: 1440, max: 1500, whenConfirmed: true },
    { key: '48h', min: 2880, max: 2940, whenConfirmed: false },
]

export const NOTICE_FLAG_COLUMNS: Record<NoticeKey, string> = {
    '48h': 'reminder_48h_sent',
    '24h': 'reminder_24h_sent',
    '12h': 'reminder_12h_sent',
    '15m': 'reminder_15m_sent',
}

export function dueNotice(diffMinutes: number, isConfirmed: boolean, sent: SentFlags): NoticeKey | null {
    for (const w of WINDOWS) {
        if (diffMinutes < w.min || diffMinutes >= w.max) continue
        if (isConfirmed && !w.whenConfirmed) continue
        if (sent[w.key]) continue
        return w.key
    }
    return null
}
