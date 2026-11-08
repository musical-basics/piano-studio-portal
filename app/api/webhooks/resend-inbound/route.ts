import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { getSingleAdmin } from '@/lib/core/admin'
import { sendMessageCore } from '@/lib/core/messages'
import { bareAddress, extractReplyText, htmlToText, studentIdFromReplyAddresses } from '@/lib/inbound-email'
import { MAX_CHAT_FILE_SIZE } from '@/lib/upload-limits'
import type { MessageAttachment } from '@/lib/supabase/database.types'

// Resend `email.received` webhook: a family replied to a portal email, so post
// the reply into their chat thread as if they'd typed it in the portal (which
// also emails Lionel the usual "new message" notification).
//
// Setup (see lib/inbound-email.ts):
//   - Resend: enable Receiving on the sending domain and add its MX record in DNS
//   - Resend webhook for `email.received` -> /api/webhooks/resend-inbound
//   - env: RESEND_INBOUND_WEBHOOK_SECRET (the webhook's signing secret),
//     RESEND_INBOUND_API_KEY (full access; the sending-only key can't read
//     received mail), INBOUND_REPLY_DOMAIN (turns on the Reply-To addresses)

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_CONTENT_LENGTH = 5000
const MAX_ATTACHMENTS = 5
const ATTACHMENT_BUCKET = 'lesson_materials'
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const FILE_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
// Smaller inline images are signature logos and tracking pixels, not something the family meant to send.
const MIN_INLINE_IMAGE_BYTES = 20 * 1024

type ReceivedEmail = {
    from: string
    to: string[]
    cc: string[] | null
    subject: string
    text: string | null
    html: string | null
    received_for?: string[]
    authentication?: Record<string, any>
}

/** True only when the sender's domain explicitly failed DMARC (a forged From). */
function dmarcFailed(auth: Record<string, any> | undefined): boolean {
    const dmarc = auth?.dmarc
    const result = typeof dmarc === 'string' ? dmarc : dmarc?.result ?? dmarc?.status
    return typeof result === 'string' && result.toLowerCase() === 'fail'
}

/** The one student/prospect whose login, parent or notification email is `address`; null if none or ambiguous (siblings sharing a parent's email). */
async function studentByEmail(client: DbClient, address: string): Promise<string | null> {
    const { data } = await client
        .from('profiles')
        .select('id, email, parent_email, notification_email')
        .in('role', ['student', 'prospect'])
    const matches = (data || []).filter((p: any) =>
        [p.email, p.parent_email, p.notification_email].some(e => e && e.trim().toLowerCase() === address),
    )
    return matches.length === 1 ? (matches[0] as any).id : null
}

/** Copy the email's attachments into chat storage; returns what was added and notes on what wasn't. */
async function importAttachments(resend: Resend, client: DbClient, emailId: string, studentId: string) {
    const added: MessageAttachment[] = []
    const skipped: string[] = []
    const { data: list } = await resend.emails.receiving.attachments.list({ emailId })
    for (const a of list?.data || []) {
        const name = a.filename || 'attachment'
        const isImage = IMAGE_TYPES.includes(a.content_type)
        if (isImage && a.content_disposition === 'inline' && a.size < MIN_INLINE_IMAGE_BYTES) continue
        if (!isImage && !FILE_TYPES.includes(a.content_type)) {
            skipped.push(`${name} (file type not supported in chat)`)
            continue
        }
        if (a.size > MAX_CHAT_FILE_SIZE) {
            skipped.push(`${name} (over ${Math.round(MAX_CHAT_FILE_SIZE / 1024 / 1024)} MB)`)
            continue
        }
        if (added.length >= MAX_ATTACHMENTS) {
            skipped.push(`${name} (more than ${MAX_ATTACHMENTS} attachments)`)
            continue
        }
        try {
            const res = await fetch(a.download_url)
            if (!res.ok) throw new Error(`download ${res.status}`)
            const buffer = Buffer.from(await res.arrayBuffer())
            const path = `chat-attachments/${studentId}/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
            const storage = client.storage.from(ATTACHMENT_BUCKET)
            const { error } = await storage.upload(path, buffer, { contentType: a.content_type, cacheControl: '3600' })
            if (error) throw new Error(error.message)
            const { data: { publicUrl } } = storage.getPublicUrl(path)
            added.push({ type: isImage ? 'image' : 'file', url: publicUrl, name, size: buffer.length })
        } catch (err: any) {
            console.error(`resend-inbound: attachment ${name} failed:`, err?.message || err)
            skipped.push(`${name} (couldn't be copied)`)
        }
    }
    return { added, skipped }
}

/** Nothing lost: an email we can't place in a thread goes to Lionel's inbox instead. */
async function forwardToAdmin(adminEmail: string | null, email: ReceivedEmail, body: string, reason: string) {
    if (!adminEmail || !process.env.RESEND_API_KEY) return
    const sender = new Resend(process.env.RESEND_API_KEY)
    await sender.emails.send({
        from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
        to: adminEmail,
        replyTo: email.from,
        subject: `Email reply not added to Messages: ${email.subject || '(no subject)'}`,
        text: `This email was sent to the studio portal but wasn't added to Messages (${reason}). Reply to this email to answer the sender directly.\n\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${body}`,
    })
}

export async function POST(req: Request) {
    const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET
    const apiKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY
    if (!webhookSecret || !apiKey) {
        console.error('resend-inbound: RESEND_INBOUND_WEBHOOK_SECRET / API key not configured')
        return NextResponse.json({ error: 'inbound email not configured' }, { status: 500 })
    }
    const resend = new Resend(apiKey)

    const payload = await req.text()
    try {
        resend.webhooks.verify({
            payload,
            headers: {
                id: req.headers.get('svix-id') || '',
                timestamp: req.headers.get('svix-timestamp') || '',
                signature: req.headers.get('svix-signature') || '',
            },
            webhookSecret,
        })
    } catch {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(payload)
    if (event.type !== 'email.received') {
        return NextResponse.json({ ok: true, ignored: event.type })
    }
    const emailId: string | undefined = event.data?.email_id
    if (!emailId) return NextResponse.json({ error: 'missing email_id' }, { status: 400 })

    // The webhook only carries metadata; the body has to be fetched.
    const { data: fetched, error: fetchError } = await resend.emails.receiving.get(emailId)
    if (fetchError || !fetched) {
        console.error('resend-inbound: fetching email failed:', fetchError)
        // 500 so Resend retries
        return NextResponse.json({ error: 'could not fetch email' }, { status: 500 })
    }
    const email = fetched as unknown as ReceivedEmail

    const client = createAdminClient()
    const admin = await getSingleAdmin(client)
    if (!admin) return NextResponse.json({ error: 'no admin profile' }, { status: 500 })

    const body = email.text?.trim() ? email.text : htmlToText(email.html || '')
    const content = extractReplyText(body).slice(0, MAX_CONTENT_LENGTH)
    const from = bareAddress(email.from)

    // A signed reply address identifies the thread on its own (it was only ever
    // sent to that family). Otherwise fall back to who sent it, unless the
    // sender's domain says the From address is forged.
    const recipients = [...(email.to || []), ...(email.cc || []), ...(email.received_for || []), ...(event.data?.received_for || [])]
    let studentId = studentIdFromReplyAddresses(recipients)
    if (!studentId && !dmarcFailed(email.authentication)) {
        studentId = await studentByEmail(client, from)
    }
    if (studentId) {
        const { data: profile } = await client.from('profiles').select('role').eq('id', studentId).maybeSingle()
        if (!profile || !['student', 'prospect'].includes((profile as any).role)) studentId = null
    }
    if (!studentId) {
        await forwardToAdmin(admin.email, email, body, `couldn't tell which student ${from} is`)
        return NextResponse.json({ ok: true, forwarded: 'unmatched sender' })
    }

    // Resend retries until it sees a 2xx, so a reply that already landed (same
    // text from the same family today) must not post twice.
    if (content) {
        const { data: dupes } = await client
            .from('messages')
            .select('id')
            .eq('sender_id', studentId)
            .eq('recipient_id', admin.id)
            .eq('content', content)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1)
        if (dupes && dupes.length > 0) {
            return NextResponse.json({ ok: true, skipped: 'duplicate', message_id: dupes[0].id })
        }
    }

    const { added, skipped } = await importAttachments(resend, client, emailId, studentId)
    const note = skipped.length > 0 ? `\n\n(Not added from the email: ${skipped.join(', ')})` : ''
    if (!content && added.length === 0 && !note) {
        return NextResponse.json({ ok: true, skipped: 'empty email' })
    }

    const result = await sendMessageCore({
        client,
        senderId: studentId,
        recipientId: admin.id,
        content: `${content}${note}`.trim(),
        attachments: added,
    })
    if (result.error) {
        console.error('resend-inbound: posting message failed:', result.error)
        return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, message_id: result.message?.id })
}
