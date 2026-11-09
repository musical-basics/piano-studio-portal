// Texting families: the database side (who gets texts, the log of every text).
// The Twilio side is lib/sms.ts.

import type { DbClient } from '@/lib/supabase/admin'
import { SMS_OPT_IN_CONFIRMATION, sendSms, smsBodyForMessage, smsConfigured } from '@/lib/sms'

export type SmsLogRow = {
    student_id: string | null
    direction: 'outbound' | 'inbound'
    phone: string
    body: string | null
    twilio_sid?: string | null
    status?: string | null
    error?: string | null
    message_id?: string | null
}

/** Append to sms_messages. Non-throwing: a lost log row must never undo a text that went out. */
export async function logSms(client: DbClient, row: SmsLogRow): Promise<void> {
    try {
        const { error } = await client.from('sms_messages').insert(row)
        if (error) console.error('logSms failed (non-blocking):', error.message)
    } catch (err: any) {
        console.error('logSms threw (non-blocking):', err?.message)
    }
}

/**
 * Text a family the portal message Lionel just sent them, if they've opted in.
 * Called from sendMessageCore next to the email notification; never throws.
 */
export async function textFamilyAboutMessageCore({
    client,
    recipient,
    content,
    attachmentCount,
    messageId,
}: {
    client: DbClient
    /** The recipient's profile row (selected with `*`). */
    recipient: any
    content: string
    attachmentCount: number
    messageId: string
}): Promise<void> {
    try {
        if (!smsConfigured()) return
        if (!recipient?.sms_opt_in || !recipient?.sms_phone) return
        if (recipient.role !== 'student' && recipient.role !== 'prospect') return

        // The first text since they opted in says how to reply and how to stop.
        let earlier = client
            .from('sms_messages')
            .select('id')
            .eq('student_id', recipient.id)
            .eq('direction', 'outbound')
            .is('error', null)
            .limit(1)
        if (recipient.sms_opt_in_at) earlier = earlier.gte('created_at', recipient.sms_opt_in_at)
        const { data: sentBefore } = await earlier

        const body = smsBodyForMessage({
            content,
            attachmentCount,
            isFirstText: !sentBefore || sentBefore.length === 0,
        })
        const result = await sendSms(recipient.sms_phone, body)

        if ('error' in result) {
            console.error(`textFamilyAboutMessageCore: text to ${recipient.id} failed:`, result.error)
            // 21610: the number texted STOP. Mirror it so the portal stops trying.
            if (result.code === 21610) {
                await client.from('profiles').update({ sms_opt_in: false }).eq('id', recipient.id)
            }
        }

        await logSms(client, {
            student_id: recipient.id,
            direction: 'outbound',
            phone: recipient.sms_phone,
            body,
            twilio_sid: 'sid' in result ? result.sid : null,
            status: 'sid' in result ? result.status : 'failed',
            error: 'error' in result ? result.error : null,
            message_id: messageId,
        })
    } catch (err: any) {
        console.error('textFamilyAboutMessageCore threw (non-blocking):', err?.message)
    }
}

/**
 * Confirm by text that a family just turned texts on (or changed the number
 * texts go to). Never throws. `stoppedEarlier` means that number once replied
 * STOP, so Twilio won't text it until it replies START; texts are switched back
 * off so the portal's record matches.
 */
export async function sendOptInConfirmationCore(
    client: DbClient,
    studentId: string,
    phone: string,
): Promise<{ sent: boolean; stoppedEarlier: boolean }> {
    try {
        if (!smsConfigured()) return { sent: false, stoppedEarlier: false }
        const result = await sendSms(phone, SMS_OPT_IN_CONFIRMATION)
        const stoppedEarlier = 'error' in result && result.code === 21610
        if (stoppedEarlier) {
            await client.from('profiles').update({ sms_opt_in: false }).eq('id', studentId)
        }
        await logSms(client, {
            student_id: studentId,
            direction: 'outbound',
            phone,
            body: SMS_OPT_IN_CONFIRMATION,
            twilio_sid: 'sid' in result ? result.sid : null,
            status: 'sid' in result ? result.status : 'failed',
            error: 'error' in result ? result.error : null,
        })
        if ('error' in result) console.error(`sendOptInConfirmationCore: text to ${studentId} failed:`, result.error)
        return { sent: 'sid' in result, stoppedEarlier }
    } catch (err: any) {
        console.error('sendOptInConfirmationCore threw (non-blocking):', err?.message)
        return { sent: false, stoppedEarlier: false }
    }
}

/** Whether saving these settings turns texts on, or moves them to a new number. */
export function smsOptInStarted(before: any, optIn: boolean, phone: string | null): boolean {
    return Boolean(optIn && phone && (!before?.sms_opt_in || before?.sms_phone !== phone))
}

/**
 * Which family a text from `phone` belongs to. Siblings can share a parent's
 * number, so when several match, the one Lionel last texted wins (that's the
 * thread they're answering), then the one he last messaged.
 */
export async function studentForSmsPhone(client: DbClient, phone: string): Promise<string | null> {
    const { data: matches } = await client
        .from('profiles')
        .select('id')
        .eq('sms_phone', phone)
        .in('role', ['student', 'prospect'])
    const ids = (matches || []).map((m: any) => m.id as string)
    if (ids.length <= 1) return ids[0] ?? null

    const { data: lastText } = await client
        .from('sms_messages')
        .select('student_id')
        .eq('phone', phone)
        .eq('direction', 'outbound')
        .in('student_id', ids)
        .order('created_at', { ascending: false })
        .limit(1)
    if (lastText?.[0]?.student_id) return lastText[0].student_id

    const { data: lastMessage } = await client
        .from('messages')
        .select('recipient_id')
        .in('recipient_id', ids)
        .order('created_at', { ascending: false })
        .limit(1)
    return lastMessage?.[0]?.recipient_id ?? ids[0]
}
