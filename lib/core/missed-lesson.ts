/**
 * "I missed this": the teacher missed a lesson. One admin action that does what
 * Lionel did by hand on Nov 8:
 *
 *   1. $15 on the family's next purchase: the Stripe customer balance ("Account
 *      Credit" in the portal), via issueAccountCreditCore, never profiles.credits.
 *   2. One apology in their portal chat (sendMessageCore, which also emails the
 *      usual notice and texts families who opted in).
 *   3. Removes the lesson (row, Zoom meeting, calendar event) like a cancel, but
 *      with no cancellation email: the apology is the only message.
 *
 * Each step can be retried safely. The credit carries the lesson id in its Stripe
 * metadata (and a Stripe idempotency key), so a second press finds it instead of
 * adding another $15. Once the apology is sent its message id is written onto
 * that same Stripe credit, so a retry knows this lesson's apology already went
 * out. The lesson row is removed last, so a half-finished run still has its button.
 */

import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { smsConfigured } from '@/lib/sms'
import { issueAccountCreditCore } from '@/lib/core/billing'
import { sendMessageCore } from '@/lib/core/messages'
import { cancelLessonCore } from '@/lib/core/lessons'
import { resolveSalutation } from '@/lib/core/students'
import { shiftDateStr, studioToday, studioTzAbbr } from '@/lib/studio-timezone'

export const MISSED_LESSON_CREDIT_CENTS = 1500
const CREDIT_DOLLARS = `$${MISSED_LESSON_CREDIT_CENTS / 100}`

const APOLOGY_CORE = `I have added ${CREDIT_DOLLARS} to your next purchase for the miss`

function weekdayName(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

function monthDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** "4:45pm EST" for a stored studio time. */
function studioTimeLabel(time: string, date: string): string {
    const [h, m] = time.split(':')
    const hn = parseInt(h, 10)
    return `${hn % 12 || 12}:${m}${hn >= 12 ? 'pm' : 'am'} ${studioTzAbbr(date)}`
}

/** Which day the apology talks about, judged in studio (Eastern) time. */
export function missedDayPhrase(lessonDate: string, today: string): string {
    if (lessonDate === today) return "today I was unable to make today's lesson"
    if (lessonDate === shiftDateStr(today, -1)) return "I was unable to make yesterday's lesson"
    // Within the last week the weekday alone is unambiguous; further back it isn't.
    if (lessonDate >= shiftDateStr(today, -6)) return `I was unable to make your lesson on ${weekdayName(lessonDate)}`
    return `I was unable to make your lesson on ${weekdayName(lessonDate)}, ${monthDay(lessonDate)}`
}

/** Lionel's Nov 8 apology, as one message. */
export function missedLessonApology(firstName: string | null, lessonDate: string, today: string): string {
    return (
        `Hi ${firstName || 'there'}, I'm sorry, ${missedDayPhrase(lessonDate, today)}. ` +
        `${APOLOGY_CORE} and making you wait, it comes off automatically. ` +
        `You can see it under Account Credit in the portal. My apologies for this!`
    )
}

type Loaded =
    | { error: string }
    | {
          lesson: { id: string; student_id: string; date: string; time: string; status: string }
          student: any
          message: string
      }

async function loadMissedLesson(client: DbClient, lessonId: string): Promise<Loaded> {
    const { data: lesson, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, status, credit_snapshot_before, credit_snapshot')
        .eq('id', lessonId)
        .maybeSingle()
    if (error) return { error: `Could not read the lesson: ${error.message}` }
    if (!lesson) return { error: 'Lesson not found. It may already have been removed.' }

    // A logged lesson took a credit. Undoing that is a judgment call (refund the
    // credit? keep the notes?), so this button refuses rather than guess.
    if (lesson.status === 'completed' || lesson.credit_snapshot_before !== null || lesson.credit_snapshot !== null) {
        return { error: 'This lesson is already logged (it took a credit), so nothing was changed. Handle this one by hand.' }
    }
    if (lesson.status === 'cancelled') return { error: 'This lesson is already cancelled.' }

    const today = studioToday()
    if (lesson.date > today) {
        return { error: "This lesson hasn't happened yet. Use Cancel or Resched for a future lesson." }
    }

    const { data: student, error: studentError } = await client
        .from('profiles')
        .select('*')
        .eq('id', lesson.student_id)
        .single()
    if (studentError || !student) return { error: 'Student not found' }

    return {
        lesson: { id: lesson.id, student_id: lesson.student_id, date: lesson.date, time: String(lesson.time).slice(0, 5), status: lesson.status },
        student,
        message: missedLessonApology(resolveSalutation(student), lesson.date, today),
    }
}

/** The $15 credit an earlier press already added for this lesson, if any. */
async function findExistingCredit(customerId: string | null | undefined, lessonId: string) {
    if (!customerId) return null
    let seen = 0
    for await (const txn of stripe.customers.listBalanceTransactions(customerId, { limit: 100 })) {
        if (txn.metadata?.missedLessonId === lessonId) {
            return { id: txn.id, customerId, apologyMessageId: txn.metadata?.apologyMessageId || null }
        }
        if (++seen >= 1000) break
    }
    return null
}

export type MissedLessonPreview = {
    studentName: string
    /** "Tuesday, November 18 at 4:45pm EST" */
    lessonLabel: string
    /** Exactly what will be sent. */
    message: string
    /** The family opted in to texts, so the message also goes out as a text. */
    alsoTexts: boolean
    /** An earlier press already added the credit (it won't be added again). */
    alreadyCredited: boolean
}

export async function getMissedLessonPreviewCore(lessonId: string): Promise<MissedLessonPreview | { error: string }> {
    const client = createAdminClient()
    const loaded = await loadMissedLesson(client, lessonId)
    if ('error' in loaded) return loaded

    let alreadyCredited = false
    try {
        alreadyCredited = Boolean(await findExistingCredit(loaded.student.stripe_customer_id, lessonId))
    } catch (err: any) {
        return { error: `Could not check Stripe for an earlier credit: ${err?.message ?? 'unknown error'}` }
    }

    return {
        studentName: loaded.student.name || 'Student',
        lessonLabel: `${weekdayName(loaded.lesson.date)}, ${monthDay(loaded.lesson.date)} at ${studioTimeLabel(loaded.lesson.time, loaded.lesson.date)}`,
        message: loaded.message,
        alsoTexts: smsConfigured() && Boolean(loaded.student.sms_opt_in && loaded.student.sms_phone),
        alreadyCredited,
    }
}

export type MissedLessonResult =
    | { success: true; summary: string }
    | { error: string }

export async function missedLessonCore({
    adminId,
    lessonId,
    expectedMessage,
}: {
    adminId: string
    lessonId: string
    /** The text the confirm dialog showed; if today's date has moved on since, stop. */
    expectedMessage?: string
}): Promise<MissedLessonResult> {
    const client = createAdminClient()
    const loaded = await loadMissedLesson(client, lessonId)
    if ('error' in loaded) return loaded
    const { lesson, student, message } = loaded

    if (expectedMessage !== undefined && expectedMessage !== message) {
        return { error: 'The date changed since this was opened, so the message would read differently. Nothing was changed; open it again.' }
    }

    // 1. The credit, once per lesson.
    let existing: Awaited<ReturnType<typeof findExistingCredit>>
    try {
        existing = await findExistingCredit(student.stripe_customer_id, lessonId)
    } catch (err: any) {
        return { error: `Nothing was changed: could not check Stripe for an earlier credit (${err?.message ?? 'unknown error'}).` }
    }

    let creditNote: string
    let credit: { txnId: string; customerId: string | null; apologyMessageId: string | null }
    if (existing) {
        creditNote = `${CREDIT_DOLLARS} Account Credit was already added earlier`
        credit = { txnId: existing.id, customerId: existing.customerId, apologyMessageId: existing.apologyMessageId }
    } else {
        const issued = await issueAccountCreditCore({
            client,
            studentId: lesson.student_id,
            amountCents: MISSED_LESSON_CREDIT_CENTS,
            // Same wording as the Nov 8 credits, which the family sees in their billing list.
            description: `Missed lesson on ${monthDay(lesson.date)}`,
            createdBy: adminId,
            notify: false,
            metadata: { missedLessonId: lessonId },
            idempotencyKey: `missed-lesson-${lessonId}`,
        })
        if ('error' in issued) {
            return { error: `Nothing was changed: the ${CREDIT_DOLLARS} credit did not go through (${issued.error}).` }
        }
        creditNote = `${CREDIT_DOLLARS} Account Credit added`
        // A first credit can also create the Stripe customer, so read the id back.
        const { data: fresh } = await client.from('profiles').select('stripe_customer_id').eq('id', lesson.student_id).single()
        credit = { txnId: issued.stripeBalanceTxnId, customerId: fresh?.stripe_customer_id ?? null, apologyMessageId: null }
    }

    // 2. The apology, unless an earlier press already sent this lesson's.
    const alreadySent = Boolean(credit.apologyMessageId)
    if (!alreadySent) {
        const sent = await sendMessageCore({ client, senderId: adminId, recipientId: lesson.student_id, content: message })
        if (sent.error || !sent.message) {
            return {
                error: `${creditNote}, but the apology did not send (${sent.error ?? 'no message saved'}). The lesson is still there. ` +
                    `Press "I missed this" again to retry; the credit will not be added twice.`,
            }
        }
        // Mark it on the credit, so a retry of a later step doesn't send it again.
        if (credit.customerId) {
            try {
                await stripe.customers.updateBalanceTransaction(credit.customerId, credit.txnId, {
                    metadata: { apologyMessageId: sent.message.id },
                })
            } catch (err: any) {
                console.error('missedLessonCore: could not tag the credit with the apology (non-blocking):', err?.message)
            }
        }
    }
    const messageNote = alreadySent ? 'apology was already sent' : 'apology sent'

    // 3. Remove the lesson, without the cancellation email.
    const removed = await cancelLessonCore({
        client,
        actorId: adminId,
        actorRole: 'admin',
        lessonId,
        notify: false,
    })
    if ('error' in removed && removed.error) {
        return {
            error: `${creditNote} and ${messageNote}, but the lesson could not be removed (${removed.error}). ` +
                `Press "I missed this" again to finish; nothing will be credited or sent twice.`,
        }
    }

    return { success: true, summary: `${creditNote}, ${messageNote}, lesson removed.` }
}
