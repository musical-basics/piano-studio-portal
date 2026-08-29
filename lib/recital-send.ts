// Recital "day-of" send helpers: Zoom-link emails, program, reminders.
//
// Pure functions shared by the admin review page (/admin/recital-send) and the
// server actions that actually send, so what the review page shows is exactly
// what goes out. Nothing here touches the network or the database.
//
// State that must survive page reloads (program order, audience list, what was
// sent and when) lives in a JSON blob in the private storage bucket
// `studio_private` at recital/{eventId}/send-log.json, because we cannot apply
// schema migrations to prod from here (see actions/recital-send.ts).

export type ProgramEntry = {
    /** 'student:<profileId>' for roster performers; free-form for manual rows. */
    key: string
    performer: string
    piece: string
}

export type AudienceMember = { name: string; email: string }

export type SentRecord = {
    at: string
    to: string[]
    subject: string
    resendIds?: string[]
}

export type ReminderRecord = {
    scheduledAt: string
    /** The instant the reminder email fires (ISO). */
    scheduledFor: string
    subject: string
    recipientCount: number
    resendIds: string[]
    /** One scheduled email per recipient (never BCC); enables resume + per-person cancel. */
    perRecipient?: { email: string; id: string }[]
    canceledAt?: string
}

export type RecitalSendLog = {
    program: ProgramEntry[]
    audience: AudienceMember[]
    /** Keyed by recipient key ('student:<id>', 'guest:<email>', 'audience:<email>'). */
    sent: Record<string, SentRecord>
    /** Keyed by reminder key ('2h', '15m'). */
    reminders: Record<string, ReminderRecord>
}

export function emptySendLog(): RecitalSendLog {
    return { program: [], audience: [], sent: {}, reminders: {} }
}

/** Extract the piece and guest emails from an event_invites.student_notes value. */
export function parseRsvpNotes(notes: string | null | undefined): { piece: string | null; guests: string[] } {
    if (!notes || !notes.trim()) return { piece: null, guests: [] }
    let piece: string | null = null
    const guests: string[] = []
    const parts = notes.split(' | ')
    for (const part of parts) {
        const p = part.trim()
        if (/^piece:/i.test(p)) {
            const val = p.replace(/^piece:/i, '').trim()
            piece = val || null
        } else if (/^guests:/i.test(p)) {
            guests.push(
                ...p.replace(/^guests:/i, '')
                    .split(/[,;]+/)
                    .map(s => s.trim())
                    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
            )
        }
    }
    // Free-text RSVPs ("I would like to play Tarantella") have no "Piece:" tag.
    if (!piece && !/piece:|guests:/i.test(notes)) {
        piece = notes.replace(/^i(?:'d| would| want)?(?: like)? to play\s*/i, '').trim() || null
    }
    return { piece, guests }
}

export function formatProgramText(program: ProgramEntry[]): string {
    return program
        .map((entry, i) => `${i + 1}. ${entry.performer}: ${entry.piece || 'TBD'}`)
        .join('\n')
}

/** "Saturday, August 29 at 2pm PDT (5pm EDT)" from the event's start_time. */
export function formatRecitalWhen(startIso: string): string {
    const start = new Date(startIso)
    const fmt = (tz: string, withDate: boolean) => {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            ...(withDate ? { weekday: 'long', month: 'long', day: 'numeric' } : {}),
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
        }).formatToParts(start)
        const get = (type: string) => parts.find(p => p.type === type)?.value || ''
        const minutes = get('minute')
        const time = `${get('hour')}${minutes === '00' ? '' : `:${minutes}`}${get('dayPeriod').toLowerCase()} ${get('timeZoneName')}`
        return withDate ? { date: `${get('weekday')}, ${get('month')} ${get('day')}`, time } : { date: '', time }
    }
    const pacific = fmt('America/Los_Angeles', true)
    const eastern = fmt('America/New_York', false)
    return `${pacific.date} at ${pacific.time} (${eastern.time})`
}

export type DraftEmail = { subject: string; body: string }

export type DraftContext = {
    zoomUrl: string
    /** From formatRecitalWhen. */
    whenLine: string
    /** From formatProgramText. */
    programText: string
}

// All drafts below follow Lionel's message style: short, casual, "Hi Amanda,"
// greetings, times like "2pm PDT", no sign-offs.

export function buildPerformerDraft(
    greetingName: string,
    performerFirstName: string,
    piece: string | null,
    ctx: DraftContext
): DraftEmail {
    const pieceKnown = piece && piece.trim().toLowerCase() !== 'tbd'
    const pieceLine = pieceKnown
        ? `${performerFirstName} is performing ${piece}. Here's the full program:`
        : `I still have ${performerFirstName} down for a piece TBD. Reply and let me know what ${performerFirstName} will be playing so I can add it to the program:`
    return {
        subject: 'Recital Zoom link: Saturday at 2pm PDT',
        body: `Hi ${greetingName},

Here's the Zoom link for the recital on ${ctx.whenLine}:

${ctx.zoomUrl}

${pieceLine}

${ctx.programText}

Please join 5-10 minutes early so we can start on time. Everyone is muted on entry, and I'll bring each performer up when it's their turn. Family and friends are welcome to watch from the same link.

See you at 2pm!`,
    }
}

export function buildNoResponseDraft(
    greetingName: string,
    studentFirstName: string,
    ctx: DraftContext
): DraftEmail {
    return {
        subject: 'Studio recital Saturday at 2pm PDT: Zoom link',
        body: `Hi ${greetingName},

Our online studio recital is ${ctx.whenLine}, and everyone is welcome to watch. Here's the Zoom link:

${ctx.zoomUrl}

No pressure to perform this time. It's a fun way for ${studentFirstName} to see what the other students are working on. Hope you can join!`,
    }
}

export function buildNotGoingDraft(
    greetingName: string,
    studentFirstName: string,
    ctx: DraftContext
): DraftEmail {
    return {
        subject: 'Recital Zoom link, in case you can make it',
        body: `Hi ${greetingName},

I know ${studentFirstName} can't make it to the recital on ${ctx.whenLine}. If anything changes, here's the Zoom link in case you'd like to watch:

${ctx.zoomUrl}

We'll miss having ${studentFirstName} perform this time!`,
    }
}

export function buildGuestDraft(inviterFirstName: string, ctx: DraftContext): DraftEmail {
    return {
        subject: 'Zoom link: Lionel Yu Piano Studio recital, Saturday 2pm PDT',
        body: `Hi there,

${inviterFirstName}'s family invited you to watch the Lionel Yu Piano Studio online recital on ${ctx.whenLine}. Here's the Zoom link:

${ctx.zoomUrl}

Cameras are optional and everyone joins muted. Feel free to cheer in the chat between pieces. See you there!`,
    }
}

export function buildAudienceDraft(firstName: string, ctx: DraftContext): DraftEmail {
    return {
        subject: 'Zoom link: Lionel Yu Piano Studio recital, Saturday 2pm PDT',
        body: `Hi ${firstName},

Thanks for signing up to watch our online studio recital! It's ${ctx.whenLine}. Here's the Zoom link:

${ctx.zoomUrl}

Cameras are optional and everyone joins muted. Feel free to leave encouragement in the chat between pieces. The students are excited to play for a real audience. See you there!`,
    }
}

export function buildAnnouncementDraft(ctx: DraftContext): DraftEmail {
    return {
        subject: 'Recital Zoom link + program (Saturday 2pm PDT)',
        body: `The online studio recital is ${ctx.whenLine}. Join here:

${ctx.zoomUrl}

Program:

${ctx.programText}

Please join 5-10 minutes early. Everyone is muted on entry, and family and friends are welcome to watch from the same link.`,
    }
}

export function buildReminderDrafts(ctx: DraftContext): Record<'2h' | '15m', DraftEmail> {
    return {
        '2h': {
            subject: 'Recital starts at 2pm PDT today',
            body: `Quick reminder: the recital starts in 2 hours, at 2pm PDT (5pm EDT). Join here:

${ctx.zoomUrl}

Performers, please join 5-10 minutes early.`,
        },
        '15m': {
            subject: 'Recital starting soon!',
            body: `We're starting in about 15 minutes! Join here:

${ctx.zoomUrl}`,
        },
    }
}

export function firstWord(s: string | null | undefined): string {
    return (s || '').trim().split(/\s+/)[0] || ''
}
