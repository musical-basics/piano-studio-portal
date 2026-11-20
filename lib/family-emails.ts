import LessonReminderEmail from '@/components/emails/LessonReminderEmail'
import { LessonScheduledEmail } from '@/components/emails/lesson-scheduled-email'
import { LessonRescheduledEmail } from '@/components/emails/lesson-rescheduled-email'
import { LessonCanceledEmail } from '@/components/emails/lesson-canceled-email'
import { LessonLoggedEmail } from '@/components/emails/lesson-logged-email'
import { MessageNotification } from '@/components/emails/message-notification'
import { AssignmentNoteEmail } from '@/components/emails/assignment-note-email'
import RecordingReadyEmail from '@/components/emails/recording-ready-email'
import NewRecordingEmail from '@/components/emails/new-recording-email'
import { TrialInquiryAutoResponse } from '@/components/emails/trial-inquiry-autoresponse'
import { formatRecordingName } from '@/lib/format-recording-name'
import { resolveNotificationEmail } from '@/lib/notification-email'
import type { familyLessonLinks } from '@/lib/lesson-venue'

/**
 * The subject and body of every email the portal sends a family (#1003).
 *
 * Each sender builds its email here, and the admin page /admin/emails builds
 * the same emails with made-up data (lib/family-email-samples.ts), so what the
 * page shows is word for word what families get. A builder only turns facts
 * into words: looking people up, choosing the address and sending stay with the
 * sender. Formatting a date or time for the family (formatLessonTimeForFamily
 * and friends) also stays with the sender, so a builder gets the finished text.
 *
 * Not here: the monthly statement (its words are built by buildStatement in
 * lib/monthly-statements.ts, which the page calls directly) and recital emails
 * (written per event on /admin/recital-send).
 */

type LessonLinks = ReturnType<typeof familyLessonLinks>

// ------------------------------------------------------------ reminders ---

/** "Thursday, December 3": the day a reminder names (from the lesson's "YYYY-MM-DD"). */
export function reminderDayLabel(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
    })
}

export type ReminderWhenVariant = '15m' | '12h' | '24h' | '48h'

/** Whole calendar days from `fromDate` to `toDate` (both "YYYY-MM-DD"): 0 = same day, 1 = the next day. */
export function calendarDaysBetween(fromDate: string, toDate: string): number {
    return Math.round((Date.parse(`${toDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromDate.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

/**
 * How to describe the lesson's timing, from the ACTUAL minutes remaining.
 *
 * The minutes pick the wording, but "today" and "tomorrow" must match the
 * calendar (#1003): a 12-hour notice for a 9:30am lesson goes out at 9:30pm the
 * evening before, and must say "tomorrow at 9:30am", not "today". `daysAway`
 * is the lesson's date minus the studio (Eastern) date when the email goes out.
 * When the minutes' day word and the calendar disagree, the calendar wins (and
 * the email's heading follows it); otherwise nothing changes.
 */
export function describeReminderWhen(diffMinutes: number, timeLabel: string, dayLabel: string, daysAway?: number): { phrase: string; variant: ReminderWhenVariant } {
    const today = { phrase: `today at ${timeLabel}`, variant: '12h' as const }
    const tomorrow = { phrase: `tomorrow at ${timeLabel}`, variant: '24h' as const }
    const onDay = { phrase: `on ${dayLabel} at ${timeLabel}`, variant: '48h' as const }

    if (diffMinutes <= 25) return { phrase: 'about to begin', variant: '15m' as const }
    // Names the date itself, so it is right whatever the calendar says.
    if (diffMinutes > 1500) return onDay
    const byMinutes = diffMinutes <= 720 ? today : tomorrow
    if (daysAway === undefined || !Number.isFinite(daysAway)) return byMinutes
    const byCalendar = daysAway <= 0 ? today : daysAway === 1 ? tomorrow : onDay
    return byCalendar.variant === byMinutes.variant ? byMinutes : byCalendar
}

/**
 * The automatic lesson reminder (app/api/cron/reminders). The wording follows
 * the real time remaining, not the notice key: a recovered 24h notice must not
 * tell someone "see you tomorrow" about a lesson starting in an hour.
 */
export function lessonReminderEmail({ diffMinutes, timeLabel, dayLabel, lessonDate, sendDate, studentName, links, confirmNudge }: {
    /** Minutes from now until the lesson starts. */
    diffMinutes: number
    /** The family's lesson time, "5:30pm EST (2:30pm your time)". */
    timeLabel: string
    /** "Thursday, December 3". */
    dayLabel: string
    /** The lesson's date, "YYYY-MM-DD" (studio calendar). */
    lessonDate: string
    /** The studio (Eastern) date the email goes out, "YYYY-MM-DD". */
    sendDate: string
    studentName: string | null | undefined
    links: LessonLinks
    /** Not confirmed yet: ask them to confirm. */
    confirmNudge: boolean
}) {
    const daysAway = calendarDaysBetween(sendDate, lessonDate)
    const { phrase, variant } = describeReminderWhen(diffMinutes, timeLabel, dayLabel, daysAway)
    const subject = diffMinutes <= 25
        ? 'Lesson Starting Soon!'
        : confirmNudge
            ? `Please confirm your lesson ${phrase}`
            : `Reminder: your lesson ${phrase}`
    return {
        subject,
        variant,
        react: LessonReminderEmail({
            studentName: studentName || 'Student',
            time: timeLabel,
            zoomLink: links.zoomLink,
            classroomLink: links.classroomLink,
            venue: links.venue,
            variant,
            dayLabel,
            confirmNudge,
            // The imminent notice's own copy tells them to check audio
            // and click through, which is worth more than restating the
            // time. Everything else gets the accurate phrasing.
            whenPhrase: diffMinutes <= 25 ? undefined : phrase,
        }),
    }
}

export type ManualReminderVariant = '24h' | '2h' | '15m' | 'exact'

/** "2 hours and 15 minutes" (the "exact time remaining" reminder). */
export function describeTimeRemaining(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60

    let durationString = ""
    if (hours > 0) durationString += `${hours} hour${hours > 1 ? 's' : ''}`
    if (hours > 0 && mins > 0) durationString += " and "
    if (mins > 0) durationString += `${mins} minute${mins > 1 ? 's' : ''}`
    if (totalMinutes <= 0) durationString = "just a few moments"
    return durationString
}

/** A reminder sent by hand from the admin dashboard (app/actions/reminders.ts). */
export function manualReminderEmail({ variant, durationString, studentName, timeLabel, links }: {
    variant: ManualReminderVariant
    /** From describeTimeRemaining. */
    durationString: string
    studentName: string
    /** The family's lesson time, "5:30pm EST (2:30pm your time)". */
    timeLabel: string
    links: LessonLinks
}) {
    const subjects = {
        '24h': 'Reminder: Piano Lesson Tomorrow',
        '2h': 'Reminder: Lesson starts in 2 hours',
        '15m': 'Join Now: Piano Lesson Starting!',
        'exact': `Lesson coming up in exactly ${durationString}`
    }
    return {
        subject: subjects[variant],
        react: LessonReminderEmail({
            studentName,
            time: timeLabel,
            zoomLink: links.zoomLink,
            classroomLink: links.classroomLink,
            venue: links.venue,
            variant: variant === 'exact' ? 'exact' : variant,
            exactDuration: durationString
        }),
    }
}

// -------------------------------------------------------- booked, moved ---

/** "December 3, 2026" (from a lesson's "YYYY-MM-DD"): the date in the booked, moved and cancelled emails. */
export function lessonDateLong(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
}

/** The family's copy of "Lesson Scheduled" (the teacher's copy stays Eastern, in lib/core/lessons.ts). */
export function lessonScheduledEmail({ studentName, date, time, duration, links, studioName }: {
    studentName: string | null | undefined
    /** "December 3, 2026" */
    date: string
    /** The family's lesson time, "5:30pm EST (2:30pm your time)". */
    time: string
    duration: number
    links: LessonLinks
    studioName: string
}) {
    return {
        subject: `Lesson Scheduled for ${studentName} on ${date} at ${time}`,
        react: LessonScheduledEmail({
            studentName: studentName || 'Student',
            date,
            time,
            duration,
            zoomLink: links.zoomLink,
            classroomLink: links.venue === 'classroom' ? links.classroomLink : null,
            recipientName: studentName || 'Student',
            studioName,
        }),
    }
}

export function lessonRescheduledEmail({ studentName, oldDate, oldTime, newDate, newTime, newDuration, studioName }: {
    studentName: string | null | undefined
    /** "December 3, 2026" */
    oldDate: string
    oldTime: string
    newDate: string
    newTime: string
    newDuration: number
    studioName: string
}) {
    return {
        subject: `Lesson Rescheduled: ${newDate} at ${newTime}`,
        react: LessonRescheduledEmail({
            studentName: studentName || 'Student',
            oldDate,
            oldTime,
            newDate,
            newTime,
            newDuration,
            recipientName: studentName || 'Student',
            studioName,
        }),
    }
}

export function lessonCanceledEmail({ studentName, date, time, studioName }: {
    studentName: string | null | undefined
    /** "December 3, 2026" */
    date: string
    time: string
    studioName: string
}) {
    return {
        subject: `Lesson Canceled: ${date} at ${time}`,
        react: LessonCanceledEmail({
            studentName: studentName || 'Student',
            date,
            time,
            recipientName: studentName || 'Student',
            studioName,
        }),
    }
}

// ---------------------------------------------------------- lesson notes ---

/** "Thursday, December 3, 2026" */
export function lessonNotesDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
}

/** The sheet music's file name from its storage URL, without the upload timestamp. */
export function sheetMusicFileName(sheetMusicUrl?: string | null): string | undefined {
    if (!sheetMusicUrl) return undefined

    try {
        const url = new URL(sheetMusicUrl)
        const pathname = decodeURIComponent(url.pathname)
        const filename = pathname.split('/').pop() || 'Sheet Music.pdf'
        return filename.replace(/^\d{10,}_/, '')
    } catch {
        return 'Sheet Music.pdf'
    }
}

/** Lesson notes after a lesson is logged, or again when Lionel edits them (`updated`). */
export function lessonNotesEmail({ date, time, studentName, notes, sheetMusicUrl, updated = false }: {
    /** The lesson's date, "YYYY-MM-DD". */
    date: string
    /** The family's lesson time, "5:30pm EST (2:30pm your time)"; omitted = date only. */
    time?: string
    studentName: string | null | undefined
    notes: string
    sheetMusicUrl?: string | null
    updated?: boolean
}) {
    const formattedDate = lessonNotesDate(date)
    return {
        subject: `${updated ? 'Lesson Notes Updated' : 'Lesson Notes'}: ${formattedDate}`,
        react: LessonLoggedEmail({
            studentName: studentName || 'Student',
            date: formattedDate,
            time,
            notes,
            sheetMusicUrl: sheetMusicUrl || undefined,
            sheetMusicFileName: sheetMusicFileName(sheetMusicUrl),
        }),
    }
}

// ------------------------------------------------- messages, practice ---

/** "New message from ...": every portal chat message a family is sent (lib/core/messages.ts). */
export function messageNotificationEmail({ senderName, content, recipientName, canReplyByEmail }: {
    senderName: string
    content: string
    recipientName: string
    /** Replies come back into the chat, so the whole message is shown. */
    canReplyByEmail: boolean
}) {
    return {
        subject: `New message from ${senderName}`,
        react: MessageNotification({
            senderName,
            messageContent: canReplyByEmail || content.length <= 200 ? content : content.substring(0, 200) + '...',
            recipientName,
            canReplyByEmail,
        }),
    }
}

/** Practice instructions written on a Library piece assigned to a student. */
export function practiceInstructionsEmail({ studentName, resourceTitle, notes, teacherName, studioName }: {
    studentName: string
    resourceTitle: string
    notes: string
    teacherName: string
    studioName: string
}) {
    return {
        subject: `New practice instructions: ${resourceTitle}`,
        react: AssignmentNoteEmail({
            studentName,
            resourceTitle,
            notes,
            teacherName,
            studioName,
        }),
    }
}

// ------------------------------------------------------------ recordings ---

/** A classroom lesson's video is on the family's dashboard (lib/recording-ready-email.ts). */
export function recordingReadyEmail({ studentName, lessonDate, dashboardUrl, studioName }: {
    studentName: string
    /** The lesson's date, "YYYY-MM-DD", or null. */
    lessonDate: string | null
    dashboardUrl: string
    studioName: string
}) {
    const formattedDate = lessonDate
        ? new Date(`${lessonDate}T12:00:00Z`).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
          })
        : undefined
    return {
        subject: 'Your lesson recording is ready 🎹',
        react: RecordingReadyEmail({
            studentName,
            lessonDate: formattedDate,
            dashboardUrl,
            studioName,
        }),
    }
}

/** New videos in the student's Dropbox lesson folder (app/api/cron/new-recordings). */
export function newRecordingsEmail({ studentName, files, dashboardUrl, studioName }: {
    studentName: string
    /** The new Dropbox files: their file name and client_modified time. */
    files: { name: string; client_modified: string }[]
    dashboardUrl: string
    studioName: string
}) {
    const formattedFiles = files.map(f => {
        const formattedName = formatRecordingName(f.name)
        const date = new Date(f.client_modified).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        })
        return { name: f.name, formattedName, date }
    })
    return {
        subject:
            files.length === 1
                ? 'New lesson recording available 🎹'
                : `${files.length} new lesson recordings available 🎹`,
        react: NewRecordingEmail({
            studentName,
            newFiles: formattedFiles,
            dashboardUrl,
            studioName,
        }),
    }
}

// --------------------------------------------------------------- billing ---

/** The family's receipt when a plan payment renews and adds lessons (Stripe webhook). */
export function renewalReceiptEmail({ studentName, creditsAdded, newTotal, amountPaid, date, appUrl }: {
    studentName: string
    creditsAdded: number
    newTotal: number
    amountPaid: number
    /** "December 3, 2026", Eastern. */
    date: string
    appUrl: string
}) {
    // The HTML keeps its original indentation: it is sent exactly as written.
    return {
        subject: `Your subscription renewed: ${creditsAdded} credits added!`,
        html: `
                    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">
                        <h2 style="font-size: 20px; margin: 0 0 16px; color: #1a1a1a;">
                            Subscription Renewed 🎹
                        </h2>
                        <p style="font-size: 15px; color: #555; margin: 0 0 16px;">
                            Hi ${studentName}, your subscription has renewed and your credits have been added!
                        </p>
                        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                            <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Amount Charged:</strong> $${amountPaid.toFixed(2)}</p>
                            <p style="font-size: 15px; color: #555; margin: 0 0 8px;"><strong>Credits Added:</strong> ${creditsAdded}</p>
                            <p style="font-size: 15px; color: #555; margin: 0;"><strong>Your Credit Balance:</strong> ${newTotal}</p>
                        </div>
                        <a href="${appUrl}/student" style="display: inline-block; background: #111; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                            Book a Lesson →
                        </a>
                        <p style="font-size: 12px; color: #888; margin-top: 24px;">
                            Date: ${date} • This is a receipt for your subscription renewal.
                        </p>
                    </div>
                `,
    }
}

// --------------------------------------------------------- announcements ---

type AnnouncementProfile = {
    email?: string | null
    notification_email?: string | null
    /** Set from the /unsubscribe page; covers announcement emails only. */
    announcement_emails_opt_out?: boolean | null
}

/**
 * Where an announcement goes (#1003): each picked student's notification email,
 * the same address every other family email uses (resolveNotificationEmail),
 * one email each. Families who turned announcement emails off
 * (profiles.announcement_emails_opt_out) are skipped; they still see the
 * announcement in the portal.
 */
export function announcementRecipients(students: AnnouncementProfile[]): { to: string[]; optedOut: number; noAddress: number } {
    const to: string[] = []
    let optedOut = 0
    let noAddress = 0
    for (const s of students) {
        if (s.announcement_emails_opt_out) { optedOut++; continue }
        const address = resolveNotificationEmail(s)
        if (address) to.push(address)
        else noAddress++
    }
    return { to, optedOut, noAddress }
}

/** An announcement Lionel writes in the admin Announcements tab: his subject and text in this frame. */
export function announcementEmail({ subject, body, portalUrl }: { subject: string; body: string; portalUrl: string }) {
    // The HTML keeps its original indentation: it is sent exactly as written.
    return {
        subject: `📢 ${subject}`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #333;">📢 ${subject}</h2>
                            <p style="color: #555; white-space: pre-wrap; line-height: 1.6;">${body}</p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                            <p style="color: #999; font-size: 14px;">
                                View in your portal: <a href="${portalUrl}/student" style="color: #4f46e5;">Student Dashboard</a>
                            </p>
                        </div>`,
    }
}

// ---------------------------------------------------------- new families ---

/** The automatic reply to the website's trial lesson form. */
export function trialRequestReplyEmail({ firstName, studioName }: { firstName: string; studioName: string }) {
    return {
        subject: "Got it. I'll be in touch within 48 hours.",
        react: TrialInquiryAutoResponse({ firstName, studioName }),
    }
}

/** Sent when an inquiry is turned into an audition (prospect) account. */
export function auditionAccountEmail({ fullName, email, loginUrl, tempPassword }: {
    fullName: string | null | undefined
    email: string
    loginUrl: string
    tempPassword: string
}) {
    // The HTML keeps its original indentation: it is sent exactly as written.
    return {
        subject: 'Your audition account is ready',
        html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Welcome, ${fullName}!</h2>
                    <p>Thanks for your interest in lessons. I've set up an account for you so you can prepare for your audition.</p>
                    <p>Sign in to view the camera and Zoom setup instructions, see your audition meeting time, and message me directly.</p>
                    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Temporary password:</strong> ${tempPassword}</p>
                    </div>
                    <p>Please change your password after signing in for the first time.</p>
                    <p>See you soon,<br/>Lionel</p>
                </div>
            `,
    }
}

/** Lionel's reply to a website inquiry, from the admin Inquiries tab: his own text, sent as plain text. */
export function inquiryReplyEmail(body: string) {
    return {
        subject: 'Re: Piano Lesson Inquiry',
        text: body,
    }
}
