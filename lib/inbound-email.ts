// Email replies into portal chat.
//
// Message notification emails carry a per-student Reply-To address
// (reply+<student>-<signature>@INBOUND_REPLY_DOMAIN). Resend receives mail
// for that domain and calls app/api/webhooks/resend-inbound, which posts the
// reply into the student's chat thread. The signature means only someone who
// got one of that family's emails can post into their thread.
//
// Nothing here is active until INBOUND_REPLY_DOMAIN is set, so notification
// emails keep their old behaviour until receiving is configured in Resend.

import crypto from 'crypto'

function replySecret(): string | null {
    return process.env.INBOUND_REPLY_SECRET || process.env.SUPABASE_SERVICE_KEY || null
}

function signature(compactId: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(`inbound-reply:${compactId}`).digest('hex').slice(0, 16)
}

/** Reply-To address that routes an email reply into this student's chat, or null when replies aren't enabled. */
export function replyAddressForStudent(studentId: string): string | null {
    const domain = process.env.INBOUND_REPLY_DOMAIN?.trim()
    const secret = replySecret()
    if (!domain || !secret) return null
    const compactId = studentId.replace(/-/g, '').toLowerCase()
    return `reply+${compactId}-${signature(compactId, secret)}@${domain}`
}

/** The student a reply address belongs to, if any address carries a valid signature. */
export function studentIdFromReplyAddresses(addresses: string[]): string | null {
    const secret = replySecret()
    if (!secret) return null
    for (const raw of addresses) {
        // Accept both "a@b" and "Name <a@b>".
        const address = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase()
        const m = address.match(/^reply\+([0-9a-f]{32})-([0-9a-f]{16})@/)
        if (!m) continue
        const expected = signature(m[1], secret)
        if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]))) continue
        const id = m[1]
        return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
    }
    return null
}

/** Bare lowercase address from "Name <a@b>" or "a@b". */
export function bareAddress(raw: string): string {
    return (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase()
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }

/** Plain text from an HTML-only email: good enough for reading a reply, not a full renderer. */
export function htmlToText(html: string): string {
    return html
        .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTITIES[e])
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// Where the quoted original starts. Each pattern must look like a client's
// quote header (it names an email address), so a reply that merely begins a
// line with "On Tuesday..." isn't cut.
const QUOTE_HEADERS: RegExp[] = [
    // Gmail / Apple Mail: "On <date> <name> <address> wrote:", often wrapped over two lines.
    /^On [^\n]*(?:\n[^\n]*)?@[^\n]*(?:\n[^\n]*)?wrote:\s*$/m,
    // Outlook: "From: <name> <address>" followed by Sent:/Date: lines.
    /^From:[^\n]*@[^\n]*\n(?:[^\n]*\n){0,2}(?:Sent|Date):/m,
    /^-{2,}\s*Original Message\s*-{2,}/im,
]

/**
 * Just the new text of an email reply: drops the quoted original, trailing
 * ">" quote lines and "Sent from my iPhone" style signatures. Falls back to
 * the whole body if stripping would leave nothing.
 */
export function extractReplyText(body: string): string {
    const text = body.replace(/\r\n?/g, '\n')
    let cut = text.length
    for (const re of QUOTE_HEADERS) {
        const m = re.exec(text)
        if (m && m.index < cut) cut = m.index
    }
    const lines = text.slice(0, cut).split('\n')
    // Trailing quote lines, blank lines, and Outlook's "_____" separator
    while (lines.length > 0 && /^\s*(>.*|[_-]{5,})?\s*$/.test(lines[lines.length - 1])) {
        lines.pop()
    }
    let reply = lines.join('\n')
        .replace(/\n*^Sent from my [^\n]*$/im, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    if (!reply) reply = text.trim()
    return reply
}
