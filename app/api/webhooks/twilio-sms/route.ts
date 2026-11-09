import { Resend } from 'resend'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { getSingleAdmin } from '@/lib/core/admin'
import { sendMessageCore } from '@/lib/core/messages'
import { logSms, studentForSmsPhone } from '@/lib/core/sms'
import { fetchTwilioMedia, formatPhone, smsKeyword, toE164, validTwilioSignature } from '@/lib/sms'
import { MAX_CHAT_FILE_SIZE } from '@/lib/upload-limits'
import type { MessageAttachment } from '@/lib/supabase/database.types'

// Twilio "a message comes in" webhook: a family texted the studio number, so
// post the text into their chat thread as if they'd typed it in the portal
// (which also emails Lionel the usual "new message" notification).
//
// Setup (see lib/sms.ts):
//   - Twilio: on the studio number, "A message comes in" -> Webhook, HTTP POST,
//     https://lessons.musicalbasics.com/api/webhooks/twilio-sms
//   - env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_CONTENT_LENGTH = 5000
const MAX_ATTACHMENTS = 5
const ATTACHMENT_BUCKET = 'lesson_materials'
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
const FILE_TYPES = ['application/pdf']

// An empty reply: Twilio sends nothing back to the family. (STOP/START/HELP
// replies come from Twilio itself.)
function twiml(): Response {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
    })
}

/** The URLs Twilio may have signed: the configured public one, and the one this request arrived on. */
function candidateUrls(req: Request): string[] {
    const urls = new Set<string>()
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    if (base) urls.add(`${base}/api/webhooks/twilio-sms`)
    urls.add(req.url)
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
    if (host) {
        const proto = req.headers.get('x-forwarded-proto') || 'https'
        const u = new URL(req.url)
        urls.add(`${proto}://${host}${u.pathname}${u.search}`)
    }
    return [...urls]
}

/** Copy pictures from the text into chat storage; returns what was added and notes on what wasn't. */
async function importMedia(client: DbClient, params: Record<string, string>, studentId: string) {
    const added: MessageAttachment[] = []
    const skipped: string[] = []
    const count = Math.min(Number(params.NumMedia || 0), 10)
    for (let i = 0; i < count; i++) {
        const url = params[`MediaUrl${i}`]
        const type = (params[`MediaContentType${i}`] || '').toLowerCase()
        const isImage = IMAGE_TYPES.includes(type)
        const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
        const name = `${isImage ? 'photo' : 'file'}-${i + 1}.${ext}`
        if (!url) continue
        if (!isImage && !FILE_TYPES.includes(type)) {
            skipped.push(`${name} (file type not supported in chat)`)
            continue
        }
        if (added.length >= MAX_ATTACHMENTS) {
            skipped.push(`${name} (more than ${MAX_ATTACHMENTS} attachments)`)
            continue
        }
        try {
            const res = await fetchTwilioMedia(url)
            if (!res.ok) throw new Error(`download ${res.status}`)
            const buffer = Buffer.from(await res.arrayBuffer())
            if (buffer.length > MAX_CHAT_FILE_SIZE) {
                skipped.push(`${name} (over ${Math.round(MAX_CHAT_FILE_SIZE / 1024 / 1024)} MB)`)
                continue
            }
            const path = `chat-attachments/${studentId}/${Date.now()}_sms_${name}`
            const storage = client.storage.from(ATTACHMENT_BUCKET)
            const { error } = await storage.upload(path, buffer, { contentType: type, cacheControl: '3600' })
            if (error) throw new Error(error.message)
            const { data: { publicUrl } } = storage.getPublicUrl(path)
            added.push({ type: isImage ? 'image' : 'file', url: publicUrl, name, size: buffer.length })
        } catch (err: any) {
            console.error(`twilio-sms: media ${name} failed:`, err?.message || err)
            skipped.push(`${name} (couldn't be copied)`)
        }
    }
    return { added, skipped }
}

/** Nothing lost: a text from a number no family has goes to Lionel's inbox instead. */
async function forwardToAdmin(adminEmail: string | null, from: string, body: string, mediaCount: number) {
    if (!adminEmail || !process.env.RESEND_API_KEY) return
    const sender = new Resend(process.env.RESEND_API_KEY)
    const media = mediaCount > 0 ? `\n\n(${mediaCount} picture${mediaCount === 1 ? '' : 's'} attached to the text, not copied)` : ''
    await sender.emails.send({
        from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
        to: adminEmail,
        subject: `Text from ${formatPhone(from)} not added to Messages`,
        text: `A text came in to the studio number from ${formatPhone(from)}, which isn't any student's texting number, so it wasn't added to Messages. To have that family's texts land in their chat, add this number as their texting number in Edit Student.\n\n${body}${media}`,
    })
}

export async function POST(req: Request) {
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
        console.error('twilio-sms: TWILIO_AUTH_TOKEN not configured')
        return new Response('texting not configured', { status: 500 })
    }

    const form = await req.formData()
    const params: Record<string, string> = {}
    for (const [key, value] of form.entries()) {
        if (typeof value === 'string') params[key] = value
    }

    if (!validTwilioSignature(candidateUrls(req), params, req.headers.get('x-twilio-signature'), authToken)) {
        console.error('twilio-sms: invalid signature')
        return new Response('invalid signature', { status: 403 })
    }

    const sid = params.MessageSid || params.SmsSid || null
    const from = toE164(params.From)
    const body = (params.Body || '').trim().slice(0, MAX_CONTENT_LENGTH)
    if (!from) return twiml()

    const client = createAdminClient()

    // Twilio can deliver the same text twice; the sid is unique in the log.
    if (sid) {
        const { data: seen } = await client.from('sms_messages').select('id').eq('twilio_sid', sid).limit(1)
        if (seen && seen.length > 0) return twiml()
    }

    const admin = await getSingleAdmin(client)
    const studentId = await studentForSmsPhone(client, from)

    if (!studentId) {
        await logSms(client, { student_id: null, direction: 'inbound', phone: from, body, twilio_sid: sid, status: 'unmatched' })
        await forwardToAdmin(admin?.email ?? null, from, body, Number(params.NumMedia || 0))
        return twiml()
    }

    // Mirror Twilio's own opt-out/opt-in for every family on this number, so
    // the portal's toggle tells the truth. A START only turns texts back on for
    // families that had agreed to texts before.
    let note = ''
    const keyword = smsKeyword(body)
    if (keyword === 'opt_out') {
        await client.from('profiles').update({ sms_opt_in: false }).eq('sms_phone', from)
        note = '(Texts to this number are now turned off. They can text START to turn them back on.)'
    } else if (keyword === 'opt_in') {
        const { data: wasOff } = await client
            .from('profiles')
            .select('id')
            .eq('sms_phone', from)
            .eq('sms_opt_in', false)
            .not('sms_opt_in_at', 'is', null)
        if (wasOff && wasOff.length > 0) {
            await client
                .from('profiles')
                .update({ sms_opt_in: true, sms_opt_in_at: new Date().toISOString(), sms_opt_in_source: 'text' })
                .in('id', wasOff.map((p: any) => p.id))
            note = '(Texts to this number are turned back on.)'
        }
    }

    const { added, skipped } = await importMedia(client, params, studentId)
    const skippedNote = skipped.length > 0 ? `(Not added from the text: ${skipped.join(', ')})` : ''
    const content = [body, note, skippedNote].filter(Boolean).join('\n\n')

    if (!admin || (!content && added.length === 0)) {
        await logSms(client, { student_id: studentId, direction: 'inbound', phone: from, body, twilio_sid: sid, status: 'empty' })
        return twiml()
    }

    const result = await sendMessageCore({
        client,
        senderId: studentId,
        recipientId: admin.id,
        content: content || '(sent a picture)',
        attachments: added,
    })

    await logSms(client, {
        student_id: studentId,
        direction: 'inbound',
        phone: from,
        body,
        twilio_sid: sid,
        status: result.error ? 'failed' : 'posted',
        error: result.error ?? null,
        message_id: result.message?.id ?? null,
    })

    if (result.error) {
        console.error('twilio-sms: posting message failed:', result.error)
        // Let Twilio know it failed (it logs it); nothing is retried, so also tell Lionel.
        await forwardToAdmin(admin.email ?? null, from, `${body}\n\n(Couldn't post to the chat: ${result.error})`, added.length)
    }
    return twiml()
}
