/**
 * "I missed this": the teacher missed a lesson. One admin action that does what
 * Lionel did by hand on Nov 8:
 *
 *   1. $15 on the family's next purchase: the Stripe customer balance ("Account
 *      Credit" in the portal), via issueAccountCreditCore, never profiles.credits.
 *   2. Optionally (#789) a make-up lesson in a free slot in the next 7 days,
 *      booked the usual way (scheduleLessonCore: Zoom, calendar, the usual
 *      "Lesson Scheduled" email). The $15 and the make-up are independent; at
 *      least one. Callers that pass no options get the $15 only, as before.
 *   3. One apology in their portal chat (sendMessageCore, which also emails the
 *      usual notice and texts families who opted in).
 *   4. Removes the lesson (row, Zoom meeting, calendar event) like a cancel, but
 *      with no cancellation email: the apology is the only message.
 *
 * Each step can be retried safely. The credit carries the lesson id in its Stripe
 * metadata (and a Stripe idempotency key), so a second press finds it instead of
 * adding another $15. A booked make-up is written on the missed lesson's row
 * (MAKEUP_MARK in notes) until that row is removed, so a retry finds it instead of
 * booking another. Once the apology is sent its message id is written onto the
 * Stripe credit (a make-up-only run, with no credit, checks the chat for the
 * same text instead), so a retry never sends it twice. The lesson row is
 * removed last, so a half-finished run still has its button.
 */

import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { smsConfigured } from '@/lib/sms'
import { issueAccountCreditCore } from '@/lib/core/billing'
import { sendMessageCore } from '@/lib/core/messages'
import { cancelLessonCore, scheduleLessonCore } from '@/lib/core/lessons'
import { findFreeSlotsCore, type FreeSlot } from '@/lib/core/free-slots'
import { resolveSalutation } from '@/lib/core/students'
import { studioToday, studioTzAbbr } from '@/lib/studio-timezone'
import {
    MISSED_LESSON_CREDIT_CENTS,
    MISSED_LESSON_CREDIT_DOLLARS as CREDIT_DOLLARS,
    missedDayPhrase,
    missedLessonApology,
    monthDay,
    weekdayName,
    type MissedLessonOptions,
} from '@/lib/missed-lesson-message'

export { MISSED_LESSON_CREDIT_CENTS, missedDayPhrase, missedLessonApology }
export type { FreeSlot, MissedLessonOptions }

/** Days ahead (today included) a make-up can be booked in. */
export const MAKEUP_WINDOW_DAYS = 7

/** Written on the missed lesson's notes once its make-up is booked (see header). */
const MAKEUP_MARK = /\[make-up booked: ([0-9a-f-]{36}) (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\]/

/** "4:45pm EST" for a stored studio time. */
function studioTimeLabel(time: string, date: string): string {
    const [h, m] = time.split(':')
    const hn = parseInt(h, 10)
    return `${hn % 12 || 12}:${m}${hn >= 12 ? 'pm' : 'am'} ${studioTzAbbr(date)}`
}

type BookedMakeup = { lessonId: string; date: string; time: string }

type Loaded =
    | { error: string }
    | {
          lesson: { id: string; student_id: string; date: string; time: string; status: string; duration: number; notes: string | null }
          student: any
          /** The $15-only apology (what callers without options send). */
          message: string
          today: string
          /** A make-up an earlier press already booked for this lesson. */
          bookedMakeup: BookedMakeup | null
      }

async function loadMissedLesson(client: DbClient, lessonId: string): Promise<Loaded> {
    const { data: lesson, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, status, duration, notes, credit_snapshot_before, credit_snapshot, on_hold_reason')
        .eq('id', lessonId)
        .maybeSingle()
    if (error) return { error: `Could not read the lesson: ${error.message}` }
    if (!lesson) return { error: 'Lesson not found. It may already have been removed.' }
    // #989: nothing happens to a held lesson until Lionel releases it.
    if ((lesson as any).on_hold_reason) return { error: `This lesson is on hold (${(lesson as any).on_hold_reason}). Release it in admin first.` }

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

    const mark = typeof lesson.notes === 'string' ? lesson.notes.match(MAKEUP_MARK) : null
    return {
        lesson: {
            id: lesson.id,
            student_id: lesson.student_id,
            date: lesson.date,
            time: String(lesson.time).slice(0, 5),
            status: lesson.status,
            duration: lesson.duration || 60,
            notes: lesson.notes ?? null,
        },
        student,
        message: missedLessonApology(resolveSalutation(student), lesson.date, today),
        today,
        bookedMakeup: mark ? { lessonId: mark[1], date: mark[2], time: mark[3] } : null,
    }
}

/** The apology for the options Lionel picked, as the family will read it. */
function apologyFor(loaded: Extract<Loaded, { lesson: unknown }>, options: { credit: boolean; makeup: { date: string; time: string } | null }): string {
    return missedLessonApology(resolveSalutation(loaded.student), loaded.lesson.date, loaded.today, {
        credit: options.credit,
        makeup: options.makeup ? { ...options.makeup, familyTz: loaded.student.timezone } : null,
    })
}

/** The same apology already in the family's chat since the missed day (a retry must not send it again). */
async function findSentApology(client: DbClient, adminId: string, studentId: string, content: string, since: string) {
    const { data } = await client
        .from('messages')
        .select('id')
        .eq('sender_id', adminId)
        .eq('recipient_id', studentId)
        .eq('content', content)
        .is('deleted_at', null)
        .gte('created_at', since)
        .limit(1)
    return data && data.length > 0 ? data[0].id as string : null
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
    /** For building the apology for other options in the dialog (lib/missed-lesson-message). */
    salutation: string | null
    lessonDate: string
    today: string
    familyTimezone: string | null
    /** Minutes, the length a make-up gets. */
    duration: number
    /** A make-up an earlier press already booked (it won't be booked again). */
    bookedMakeup: (BookedMakeup & { label: string }) | null
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
        salutation: resolveSalutation(loaded.student),
        lessonDate: loaded.lesson.date,
        today: loaded.today,
        familyTimezone: loaded.student.timezone ?? null,
        duration: loaded.lesson.duration,
        bookedMakeup: loaded.bookedMakeup
            ? { ...loaded.bookedMakeup, label: `${weekdayName(loaded.bookedMakeup.date)}, ${monthDay(loaded.bookedMakeup.date)} at ${studioTimeLabel(loaded.bookedMakeup.time, loaded.bookedMakeup.date)}` }
            : null,
    }
}

/** Free slots in the next 7 days for this lesson's make-up, at its length. Changes nothing. */
export async function getMissedLessonMakeupSlotsCore(lessonId: string): Promise<{ slots: FreeSlot[]; duration: number } | { error: string }> {
    const client = createAdminClient()
    const loaded = await loadMissedLesson(client, lessonId)
    if ('error' in loaded) return loaded
    const found = await findFreeSlotsCore({ client, duration: loaded.lesson.duration, days: MAKEUP_WINDOW_DAYS })
    if ('error' in found) return found
    return { slots: found.slots, duration: loaded.lesson.duration }
}

export type MissedLessonResult =
    | { success: true; summary: string }
    | { error: string }

export async function missedLessonCore({
    adminId,
    lessonId,
    expectedMessage,
    credit: wantCredit = true,
    makeup = null,
}: {
    adminId: string
    lessonId: string
    /** The text the confirm dialog showed; if it would read differently now, stop. */
    expectedMessage?: string
    /** Add the $15 Account Credit (default true, the original behaviour). */
    credit?: boolean
    /** Book a make-up at this studio date and time (a free slot in the next 7 days). */
    makeup?: { date: string; time: string } | null
}): Promise<MissedLessonResult> {
    if (!wantCredit && !makeup) return { error: 'Pick the $15 credit, a make-up lesson, or both. Nothing was changed.' }

    const client = createAdminClient()
    const loaded = await loadMissedLesson(client, lessonId)
    if ('error' in loaded) return loaded
    const { lesson, student, bookedMakeup } = loaded

    if (bookedMakeup && (!makeup || makeup.date !== bookedMakeup.date || makeup.time !== bookedMakeup.time)) {
        return { error: `A make-up is already booked for this lesson (${bookedMakeup.date} at ${bookedMakeup.time}). Nothing was changed; open it again.` }
    }

    const message = apologyFor(loaded, { credit: wantCredit, makeup })
    if (expectedMessage !== undefined && expectedMessage !== message) {
        return { error: 'The date changed since this was opened, so the message would read differently. Nothing was changed; open it again.' }
    }

    // The make-up slot must still be free (unless an earlier press booked it).
    if (makeup && !bookedMakeup) {
        const found = await findFreeSlotsCore({ client, duration: lesson.duration, days: MAKEUP_WINDOW_DAYS })
        if ('error' in found) return { error: `Nothing was changed: ${found.error}` }
        if (!found.slots.some(sl => sl.date === makeup.date && sl.time === makeup.time)) {
            return { error: 'That make-up time is no longer free. Nothing was changed; open it again and pick another.' }
        }
    }

    const done: string[] = []

    // 1. The credit, once per lesson.
    let creditInfo: { txnId: string; customerId: string | null; apologyMessageId: string | null } | null = null
    if (wantCredit) {
        let existing: Awaited<ReturnType<typeof findExistingCredit>>
        try {
            existing = await findExistingCredit(student.stripe_customer_id, lessonId)
        } catch (err: any) {
            return { error: `Nothing was changed: could not check Stripe for an earlier credit (${err?.message ?? 'unknown error'}).` }
        }
        if (existing) {
            done.push(`${CREDIT_DOLLARS} Account Credit was already added earlier`)
            creditInfo = { txnId: existing.id, customerId: existing.customerId, apologyMessageId: existing.apologyMessageId }
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
            done.push(`${CREDIT_DOLLARS} Account Credit added`)
            // A first credit can also create the Stripe customer, so read the id back.
            const { data: fresh } = await client.from('profiles').select('stripe_customer_id').eq('id', lesson.student_id).single()
            creditInfo = { txnId: issued.stripeBalanceTxnId, customerId: fresh?.stripe_customer_id ?? null, apologyMessageId: null }
        }
    }
    const soFar = () => (done.length ? `${done.join(', ')}, but ` : '')

    // 2. The make-up, booked the usual way (Zoom, calendar, "Lesson Scheduled" email).
    if (makeup) {
        const when = `${weekdayName(makeup.date)}, ${monthDay(makeup.date)} at ${studioTimeLabel(makeup.time, makeup.date)}`
        if (bookedMakeup) {
            done.push(`make-up for ${when} was already booked`)
        } else {
            const booked = await scheduleLessonCore({
                client,
                adminId,
                studentId: lesson.student_id,
                date: makeup.date,
                time: makeup.time,
                duration: lesson.duration,
            })
            if ('error' in booked && booked.error) {
                const why = booked.error === 'lesson_intent_conflict'
                    ? 'the family asked to skip or move a lesson that day'
                    : booked.error
                return { error: `${soFar()}the make-up was not booked (${why}). No apology was sent and the lesson is still there.` }
            }
            const makeupId = (booked as any).lesson?.id as string | undefined
            done.push(`make-up booked for ${when} (usual email sent)`)
            // Remember it on the missed lesson, so a retry of a later step doesn't book another.
            if (makeupId) {
                const mark = `[make-up booked: ${makeupId} ${makeup.date} ${makeup.time}]`
                await client.from('lessons').update({ notes: lesson.notes ? `${lesson.notes}\n${mark}` : mark }).eq('id', lessonId)
            }
        }
    }

    // 3. The apology, unless an earlier press already sent this lesson's.
    // With the $15 the Stripe credit carries the sent apology's id (as before);
    // a make-up-only run has no credit, so it looks for the same text in the chat.
    const sentBefore = creditInfo
        ? creditInfo.apologyMessageId
        : await findSentApology(client, adminId, lesson.student_id, message, `${lesson.date}T00:00:00Z`)
    if (sentBefore) {
        done.push('apology was already sent')
    } else {
        const sent = await sendMessageCore({ client, senderId: adminId, recipientId: lesson.student_id, content: message })
        if (sent.error || !sent.message) {
            return {
                error: `${soFar()}the apology did not send (${sent.error ?? 'no message saved'}). The lesson is still there. ` +
                    `Press "I missed this" again to retry; nothing will be credited or booked twice.`,
            }
        }
        // Mark it on the credit, so a retry of a later step doesn't send it again.
        if (creditInfo?.customerId) {
            try {
                await stripe.customers.updateBalanceTransaction(creditInfo.customerId, creditInfo.txnId, {
                    metadata: { apologyMessageId: sent.message.id },
                })
            } catch (err: any) {
                console.error('missedLessonCore: could not tag the credit with the apology (non-blocking):', err?.message)
            }
        }
        done.push('apology sent')
    }

    // 4. Remove the lesson, without the cancellation email.
    const removed = await cancelLessonCore({
        client,
        actorId: adminId,
        actorRole: 'admin',
        lessonId,
        notify: false,
    })
    if ('error' in removed && removed.error) {
        return {
            error: `${soFar()}the lesson could not be removed (${removed.error}). ` +
                `Press "I missed this" again to finish; nothing will be credited, booked or sent twice.`,
        }
    }

    return { success: true, summary: `${done.join(', ')}, lesson removed.` }
}
