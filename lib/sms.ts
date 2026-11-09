// Texting families through Twilio.
//
// A portal message from Lionel is also texted to a family that has opted in,
// and their text replies come back into the same chat
// (app/api/webhooks/twilio-sms). Talks to Twilio's REST API directly, so there
// is no SDK dependency.
//
// Nothing here is active until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
// TWILIO_FROM_NUMBER are all set.

import crypto from 'crypto'

export { toE164, formatPhone } from '@/lib/phone'

export const SMS_SENDER_NAME = 'Lionel Yu Piano Studio'

// Sent once when a family turns texts on (the carrier-registered opt-in
// confirmation; keep it in step with the Twilio campaign's opt-in message).
export const SMS_OPT_IN_CONFIRMATION = `${SMS_SENDER_NAME}: you're signed up for texts about your lessons. Message frequency varies; message and data rates may apply. Reply HELP for help or STOP to stop.`
// Twilio's hard limit is 1600 characters; leave room for the footer.
const MAX_SMS_BODY = 1200

export function smsConfigured(): boolean {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER)
}

// Carrier keywords. Twilio answers these itself and blocks texts to a number
// that sent STOP; the portal mirrors the opt-out/opt-in so its records agree.
// The text still goes into the chat either way: "yes" is a keyword to Twilio
// but usually an answer to Lionel, and a STOP is something he should see.
const OPT_OUT = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'revoke', 'optout']
const OPT_IN = ['start', 'unstop', 'yes', 'optin']

export type SmsKeyword = 'opt_out' | 'opt_in' | null

export function smsKeyword(body: string | null | undefined): SmsKeyword {
    const word = (body || '').trim().toLowerCase().replace(/[^a-z]/g, '')
    if (OPT_OUT.includes(word)) return 'opt_out'
    if (OPT_IN.includes(word)) return 'opt_in'
    return null
}

/**
 * The text for a portal message. Long messages are cut with a pointer to the
 * portal; attachments are mentioned rather than sent. The first text to a
 * family says how to reply and how to stop.
 */
export function smsBodyForMessage({
    content,
    attachmentCount,
    isFirstText,
}: {
    content: string
    attachmentCount: number
    isFirstText: boolean
}): string {
    const portal = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'
    let text = content.trim()
    if (text.length > MAX_SMS_BODY) {
        text = `${text.slice(0, MAX_SMS_BODY).trimEnd()}... (the rest is in the portal: ${portal})`
    }
    const parts = [`${SMS_SENDER_NAME}: ${text || '(new message)'}`]
    if (attachmentCount > 0) {
        parts.push(`(${attachmentCount === 1 ? 'An attachment is' : `${attachmentCount} attachments are`} in the portal: ${portal})`)
    }
    if (isFirstText) {
        parts.push('You can reply to this text to answer. Message frequency varies; message and data rates may apply. Reply HELP for help or STOP to stop texts.')
    }
    return parts.join('\n\n')
}

function twilioAuthHeader(): string {
    const sid = process.env.TWILIO_ACCOUNT_SID!
    const token = process.env.TWILIO_AUTH_TOKEN!
    return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
}

export type SendSmsResult = { sid: string; status: string } | { error: string; code?: number }

/** Send one text. Never throws; a failure comes back as { error }. */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
    if (!smsConfigured()) return { error: 'texting is not configured' }
    const sid = process.env.TWILIO_ACCOUNT_SID!
    const form = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: body })
    try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: { Authorization: twilioAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
        })
        const json: any = await res.json().catch(() => ({}))
        if (!res.ok) return { error: json?.message || `Twilio ${res.status}`, code: json?.code }
        return { sid: json.sid, status: json.status }
    } catch (err: any) {
        return { error: err?.message || 'network error' }
    }
}

/** Download a picture someone texted (Twilio media URLs need the account's credentials). */
export async function fetchTwilioMedia(url: string): Promise<Response> {
    return fetch(url, { headers: { Authorization: twilioAuthHeader() }, redirect: 'follow' })
}

/**
 * Twilio's request signature: base64 HMAC-SHA1, keyed by the auth token, over
 * the full webhook URL followed by every POST parameter's name and value,
 * sorted by name.
 */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
    const data = Object.keys(params)
        .sort()
        .reduce((acc, key) => acc + key + params[key], url)
    return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

export function validTwilioSignature(
    urls: string[],
    params: Record<string, string>,
    signature: string | null,
    authToken: string,
): boolean {
    if (!signature) return false
    const given = Buffer.from(signature)
    return urls.some(url => {
        const expected = Buffer.from(twilioSignature(url, params, authToken))
        return expected.length === given.length && crypto.timingSafeEqual(expected, given)
    })
}
