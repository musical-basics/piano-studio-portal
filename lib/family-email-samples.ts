import * as React from 'react'
import { render } from '@react-email/components'
import { MonthlyStatementEmail } from '@/components/emails/monthly-statement-email'
import { formatLessonTimeForFamily } from '@/lib/family-time'
import { familyLessonLinks } from '@/lib/lesson-venue'
import { appBaseUrl } from '@/lib/lesson-action-links'
import { buildStatement } from '@/lib/monthly-statements'
import {
    announcementEmail,
    auditionAccountEmail,
    describeTimeRemaining,
    inquiryReplyEmail,
    lessonCanceledEmail,
    lessonDateLong,
    lessonNotesEmail,
    lessonReminderEmail,
    lessonRescheduledEmail,
    lessonScheduledEmail,
    manualReminderEmail,
    messageNotificationEmail,
    newRecordingsEmail,
    practiceInstructionsEmail,
    recordingReadyEmail,
    reminderDayLabel,
    renewalReceiptEmail,
    trialRequestReplyEmail,
    type ManualReminderVariant,
} from '@/lib/family-emails'

/**
 * One filled-in sample of every email a family can get (#1003), for the admin
 * page /admin/emails. Each sample goes through the same builder the sender uses
 * (lib/family-emails.ts), so the words are exactly what families read. All the
 * details are made up: the test student "Piano Student", whose family is on
 * Pacific time, so times read "5:30pm EST (2:30pm your time)" as they do for a
 * family whose zone is set. No real family data is read.
 *
 * scripts/check_family_email_samples.ts renders every sample and checks it.
 */

export type EmailSample = {
    /** Which version, when an email has more than one ("Confirmed", "Classroom student"). */
    label?: string
    subject: string
    /** The inbox preview line, when the email sets one. */
    preview?: string
    /** The email as families see it, a whole HTML document. */
    html: string
}

export type FamilyEmail = {
    /** Anchor on the page. */
    id: string
    group: string
    name: string
    /** When it goes out, in plain words. */
    when: string
    /** Who gets it. */
    who: string
    /** Anything else worth knowing (optional). */
    note?: string
    samples: EmailSample[]
}

export const FAMILY_EMAIL_GROUPS = [
    'Lesson reminders',
    'Booking changes',
    'After a lesson',
    'Messages and announcements',
    'Billing',
    'New families',
] as const

/** Family emails the page does not show, and where their words live. */
export const NOT_SHOWN: { name: string; where: string }[] = [
    {
        name: 'Recital emails (Zoom link, program, reminders)',
        where: 'Written for each recital and reviewed before sending on the Recital send page (/admin/recital-send).',
    },
    {
        name: 'Sign-in links and password resets',
        where: 'Supabase sends these from its own templates, edited in the Supabase dashboard (Authentication, Email Templates).',
    },
    {
        name: 'Texts',
        where: 'Families who turned texting on also get each chat message as a text; those are not emails.',
    },
]

// ------------------------------------------------------------ sample facts ---

const STUDENT = 'Piano Student'
const FIRST = 'Piano'
/** The family's own zone: Pacific, so every time also shows "(... your time)". */
const FAMILY_TZ = 'America/Los_Angeles'
const STUDIO = 'Lionel Yu Piano Studio'
const TEACHER = 'Professor Lionel Yu'
/** A Thursday lesson at 5:30pm Eastern. */
const LESSON_DATE = '2026-12-03'
const LESSON_TIME = '17:30'
/** Where it moves to: Saturday at 11am Eastern. */
const MOVED_DATE = '2026-12-05'
const MOVED_TIME = '11:00'
const ZOOM_LINK = 'https://zoom.us/j/1234567890'
const ZOOM_STUDENT = { lesson_venue: 'zoom', public_id: 'sample' }
const CLASSROOM_STUDENT = { lesson_venue: 'classroom', public_id: 'sample' }

const SAMPLE_NOTES = [
    'Great lesson today! Your left hand in the Clementi is much steadier.',
    '',
    'For this week:',
    '1. Clementi Sonatina, first movement: hands together at 80, bars 1-24.',
    '2. C major scale, two octaves, hands together.',
    '3. Start reading the first line of the new piece (attached).',
].join('\n')

const SAMPLE_MESSAGE = 'Hi Piano, just a heads up that I am running about 5 minutes late today. See you soon!'

const SAMPLE_ANNOUNCEMENT = {
    subject: 'Winter recital on December 19',
    body: 'Hi everyone,\n\nOur winter recital is on Saturday, December 19 at 2pm EST on Zoom. Everyone is welcome to play, and family and friends can watch from the same link.\n\nLet me know by December 12 if you would like to perform and what you will play.',
}

const SAMPLE_INQUIRY_REPLY = [
    'Hi Piano,',
    '',
    'Thanks for reaching out! I have a few openings on weekday afternoons. Would Tuesday or Thursday at 4:30pm EST work for a first lesson?',
    '',
    'Lionel',
].join('\n')

// ------------------------------------------------------------- rendering ---

/** The inbox preview line React Email hides at the top of the body. */
function previewText(html: string): string | undefined {
    const m = html.match(/<div[^>]*data-skip-in-text="true"[^>]*>([^<]*)/)
    const text = m?.[1]?.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
    return text || undefined
}

async function fromReact(email: { subject: string; react: React.ReactElement }, label?: string): Promise<EmailSample> {
    const html = await render(email.react)
    return { label, subject: email.subject, preview: previewText(html), html }
}

/** An HTML-only email is a fragment; wrap it the way a mail app shows it. */
function fromHtml(email: { subject: string; html: string }, label?: string): EmailSample {
    return {
        label,
        subject: email.subject,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${email.html}</body></html>`,
    }
}

function escapeHtml(s: string): string {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function fromText(email: { subject: string; text: string }, label?: string): EmailSample {
    return {
        label,
        subject: email.subject,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:16px;"><pre style="white-space:pre-wrap;font-family:-apple-system,sans-serif;font-size:14px;line-height:1.5;color:#222;margin:0;">${escapeHtml(email.text)}</pre></body></html>`,
    }
}

// --------------------------------------------------------------- samples ---

export async function buildFamilyEmailSamples(): Promise<FamilyEmail[]> {
    const appUrl = appBaseUrl()
    const dashboardUrl = `${appUrl}/student`
    const zoomLinks = familyLessonLinks(ZOOM_STUDENT, ZOOM_LINK)
    const classroomLinks = familyLessonLinks(CLASSROOM_STUDENT, ZOOM_LINK)
    const familyTime = formatLessonTimeForFamily(LESSON_DATE, LESSON_TIME, FAMILY_TZ)
    const dayLabel = reminderDayLabel(LESSON_DATE)
    const reminder = (diffMinutes: number, confirmNudge: boolean, links = zoomLinks) =>
        lessonReminderEmail({ diffMinutes, timeLabel: familyTime, dayLabel, studentName: STUDENT, links, confirmNudge })
    const manual = (variant: ManualReminderVariant) =>
        manualReminderEmail({ variant, durationString: describeTimeRemaining(135), studentName: STUDENT, timeLabel: familyTime, links: zoomLinks })

    const statement = buildStatement({
        month: '2026-11',
        studentFirst: FIRST,
        greetingName: FIRST,
        toParent: false,
        held: [
            { date: '2026-11-05', time: LESSON_TIME },
            { date: '2026-11-12', time: LESSON_TIME },
            { date: '2026-11-19', time: LESSON_TIME },
            { date: '2026-11-26', time: LESSON_TIME, free: true },
        ],
        missed: [],
        creditsNow: 3,
        nextPaymentAt: '2026-12-15T15:00:00Z',
        familyTz: FAMILY_TZ,
        historyUrl: `${appUrl}/student?tab=history`,
        canReply: true,
    })

    return [
        // ------------------------------------------------ Lesson reminders
        {
            id: 'reminder-2-days',
            group: 'Lesson reminders',
            name: 'Lesson reminder, 2 days before',
            when: '48 hours before the lesson, only while the lesson is not confirmed yet. The reminder check runs every 10 minutes, so it can arrive a few minutes after the 48-hour mark.',
            who: 'The family (the student\'s email, or the notification email set in their account).',
            samples: [await fromReact(reminder(2880, true))],
        },
        {
            id: 'reminder-day-before',
            group: 'Lesson reminders',
            name: 'Lesson reminder, the day before',
            when: '24 hours before the lesson. Every lesson gets it; a lesson not confirmed yet gets the version that asks them to confirm.',
            who: 'The family.',
            samples: [
                await fromReact(reminder(1440, false), 'Confirmed'),
                await fromReact(reminder(1440, true), 'Not confirmed yet'),
            ],
        },
        {
            id: 'reminder-12-hours',
            group: 'Lesson reminders',
            name: 'Lesson reminder, 12 hours before',
            when: '12 hours before the lesson, only while the lesson is not confirmed yet.',
            who: 'The family.',
            note: 'It says "today at" whenever the lesson is 12 hours away or less, so for a lesson before noon Eastern it goes out the evening before and still says "today".',
            samples: [await fromReact(reminder(720, true))],
        },
        {
            id: 'reminder-starting-soon',
            group: 'Lesson reminders',
            name: 'Lesson starting soon',
            when: '25 minutes before the lesson (the last reminder). Every lesson gets it.',
            who: 'The family.',
            note: 'A classroom student gets the classroom link instead of Zoom. If the lesson is not confirmed yet, it also shows the confirm box.',
            samples: [
                await fromReact(reminder(25, false), 'Zoom student'),
                await fromReact(reminder(25, false, classroomLinks), 'Classroom student'),
                await fromReact(reminder(25, true), 'Not confirmed yet'),
            ],
        },
        {
            id: 'reminder-by-hand',
            group: 'Lesson reminders',
            name: 'Reminder you send by hand',
            when: 'Only when you press one of the four buttons in Send Reminder on a lesson in the admin dashboard. The sample is sent 2 hours and 15 minutes before the lesson.',
            who: 'The family.',
            samples: [
                await fromReact(manual('exact'), 'Exact time remaining'),
                await fromReact(manual('24h'), 'Tomorrow (24h)'),
                await fromReact(manual('2h'), 'Starting soon (2h)'),
                await fromReact(manual('15m'), 'Join now (urgent)'),
            ],
        },

        // ------------------------------------------------- Booking changes
        {
            id: 'lesson-booked',
            group: 'Booking changes',
            name: 'Lesson booked',
            when: 'Right away whenever a lesson is booked: by you, by the assistant, by the 10am daily booking of standing weekly lessons, or when logging a lesson books the same time next week.',
            who: 'The family. You get your own copy with the time in Eastern only (not shown).',
            samples: [
                await fromReact(lessonScheduledEmail({
                    studentName: STUDENT, date: lessonDateLong(LESSON_DATE), time: familyTime, duration: 60, links: zoomLinks, studioName: STUDIO,
                }), 'Zoom student'),
                await fromReact(lessonScheduledEmail({
                    studentName: STUDENT, date: lessonDateLong(LESSON_DATE), time: familyTime, duration: 60, links: classroomLinks, studioName: STUDIO,
                }), 'Classroom student'),
            ],
        },
        {
            id: 'lesson-moved',
            group: 'Booking changes',
            name: 'Lesson moved',
            when: 'Right away whenever a lesson is moved to another day or time: by you, by the assistant, or when you approve a family\'s request for a different time.',
            who: 'The family.',
            samples: [await fromReact(lessonRescheduledEmail({
                studentName: STUDENT,
                oldDate: lessonDateLong(LESSON_DATE),
                oldTime: familyTime,
                newDate: lessonDateLong(MOVED_DATE),
                newTime: formatLessonTimeForFamily(MOVED_DATE, MOVED_TIME, FAMILY_TZ),
                newDuration: 60,
                studioName: STUDIO,
            }))],
        },
        {
            id: 'lesson-cancelled',
            group: 'Booking changes',
            name: 'Lesson cancelled',
            when: 'Right away whenever a lesson is cancelled (by you, the family or the assistant). Not sent when a student is made inactive (their lessons are cancelled quietly) or when you use "I missed this" (the apology message is the only one).',
            who: 'The family. You get a separate cancellation notice (not shown).',
            note: 'When a family cancels inside 24 hours, the late cancellation fee also arrives as a portal message (see New portal message).',
            samples: [await fromReact(lessonCanceledEmail({
                studentName: STUDENT, date: lessonDateLong(LESSON_DATE), time: familyTime, studioName: STUDIO,
            }))],
        },

        // --------------------------------------------------- After a lesson
        {
            id: 'lesson-notes',
            group: 'After a lesson',
            name: 'Lesson notes',
            when: 'Right after a lesson is logged, and again whenever you edit that lesson\'s notes later.',
            who: 'The family.',
            samples: [
                await fromReact(lessonNotesEmail({
                    date: LESSON_DATE, time: familyTime, studentName: STUDENT, notes: SAMPLE_NOTES,
                    sheetMusicUrl: `${appUrl}/sample/1764000000000_Clementi%20Sonatina%20Op.%2036%20No.%201.pdf`,
                }), 'After logging'),
                await fromReact(lessonNotesEmail({
                    date: LESSON_DATE, time: familyTime, studentName: STUDENT, notes: SAMPLE_NOTES, updated: true,
                }), 'Notes edited later'),
            ],
        },
        {
            id: 'recording-ready',
            group: 'After a lesson',
            name: 'Lesson video ready (classroom)',
            when: 'When a classroom lesson\'s video is attached to the lesson (checked every 30 minutes), if the lesson was in the last 2 days. Videos under 5 minutes count as no-shows and are not sent.',
            who: 'The family. Replies go to your email.',
            samples: [await fromReact(recordingReadyEmail({
                studentName: STUDENT, lessonDate: LESSON_DATE, dashboardUrl, studioName: STUDIO,
            }))],
        },
        {
            id: 'new-recordings',
            group: 'After a lesson',
            name: 'New lesson recordings (Zoom, Dropbox)',
            when: 'Checked every 30 minutes: when new videos land in the student\'s Dropbox lesson folder. One email covers every new video since the last one.',
            who: 'The family (only students with a Dropbox recording folder).',
            samples: [
                await fromReact(newRecordingsEmail({
                    studentName: STUDENT,
                    files: [{ name: '2026-12-03 - Lesson.mp4', client_modified: '2026-12-03T23:40:00Z' }],
                    dashboardUrl, studioName: STUDIO,
                }), 'One video'),
                await fromReact(newRecordingsEmail({
                    studentName: STUDENT,
                    files: [
                        { name: '2026-11-26 - Lesson.mp4', client_modified: '2026-11-26T23:40:00Z' },
                        { name: '2026-12-03 - Lesson.mp4', client_modified: '2026-12-03T23:40:00Z' },
                    ],
                    dashboardUrl, studioName: STUDIO,
                }), 'Two videos'),
            ],
        },
        {
            id: 'practice-instructions',
            group: 'After a lesson',
            name: 'Practice instructions',
            when: 'When you write or change the practice notes on a Library piece assigned to the student.',
            who: 'The family.',
            samples: [await fromReact(practiceInstructionsEmail({
                studentName: STUDENT,
                resourceTitle: 'Clementi Sonatina Op. 36 No. 1',
                notes: 'Hands separately first, slowly. Watch the fingering in bars 9-12, and keep the left hand quieter than the right.',
                teacherName: TEACHER,
                studioName: STUDIO,
            }))],
        },

        // --------------------------------------- Messages and announcements
        {
            id: 'new-message',
            group: 'Messages and announcements',
            name: 'New portal message',
            when: 'Every time you send the family a chat message, and for the messages the portal sends for you: running late, the late cancellation fee, the "I missed this" apology, an account credit, practice video feedback, and undoing a logged lesson (when ticked).',
            who: 'The family. They can answer by replying to the email; the reply lands in their chat.',
            samples: [await fromReact(messageNotificationEmail({
                senderName: TEACHER, content: SAMPLE_MESSAGE, recipientName: STUDENT, canReplyByEmail: true,
            }))],
        },
        {
            id: 'announcement',
            group: 'Messages and announcements',
            name: 'Announcement',
            when: 'When you send one from the Announcements tab. Your subject and text go inside this frame.',
            who: 'Each student you pick, one email each.',
            samples: [fromHtml(announcementEmail({ ...SAMPLE_ANNOUNCEMENT, portalUrl: appUrl }))],
        },

        // ---------------------------------------------------------- Billing
        {
            id: 'renewal-receipt',
            group: 'Billing',
            name: 'Plan renewal receipt',
            when: 'Each time a monthly plan renews (every payment after the first) and its lessons are added.',
            who: 'The family. You get your own notice (not shown).',
            samples: [fromHtml(renewalReceiptEmail({
                studentName: STUDENT, creditsAdded: 4, newTotal: 5, amountPaid: 240, date: 'December 1, 2026', appUrl,
            }))],
        },
        {
            id: 'monthly-statement',
            group: 'Billing',
            name: 'Monthly statement',
            when: 'On the 1st of each month at 10am Eastern, about the month before.',
            who: 'Each active family, one email each. Replies land in their chat.',
            samples: [await fromReact({
                subject: statement.subject,
                react: React.createElement(MonthlyStatementEmail, { content: statement }),
            })],
        },

        // ----------------------------------------------------- New families
        {
            id: 'trial-reply',
            group: 'New families',
            name: 'Trial lesson request reply',
            when: 'Right after someone sends the trial lesson form on the website.',
            who: 'The person who filled in the form. Replies go to your email.',
            samples: [await fromReact(trialRequestReplyEmail({ firstName: FIRST, studioName: STUDIO }))],
        },
        {
            id: 'audition-account',
            group: 'New families',
            name: 'Audition account ready',
            when: 'When you turn a website inquiry into an audition account in the Inquiries tab.',
            who: 'The person who sent the inquiry.',
            samples: [fromHtml(auditionAccountEmail({
                fullName: STUDENT, email: 'piano.student@example.com', loginUrl: `${appUrl}/login`, tempPassword: 'piano-abc1231234',
            }))],
        },
        {
            id: 'inquiry-reply',
            group: 'New families',
            name: 'Reply to a website inquiry',
            when: 'When you answer an inquiry from the Inquiries tab. It is your own text, sent as plain text.',
            who: 'The person who sent the inquiry. Replies go to your email.',
            samples: [fromText(inquiryReplyEmail(SAMPLE_INQUIRY_REPLY))],
        },
    ]
}
