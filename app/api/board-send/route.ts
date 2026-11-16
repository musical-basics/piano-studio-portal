import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { getSingleAdmin } from '@/lib/core/admin'
import { sendMessageCore } from '@/lib/core/messages'
import { readBoardSendTrust, verifyBoardSend, type BoardSendRequest } from '@/lib/board-send/verify'

/**
 * Face ID send: Lionel signs off a reply card on his command-center board with Face ID, and
 * the board posts the signed request here. Contract v1, "Signed send" in the command center's
 * wiki. Order of checks: signature and text (lib/board-send/verify.ts), single use, the
 * studio's own pre-send check (he has not replied himself), then send exactly the draft.
 * Never answers sent: true without having sent.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refuse(status: number, reason: string) {
    return NextResponse.json({ sent: false, reason }, { status })
}

async function settle(client: DbClient, nonce: string, fields: Record<string, unknown>) {
    const { error } = await client.from('board_sends').update(fields).eq('nonce', nonce)
    if (error) console.error('[board-send] could not update attempt row:', error.message)
}

/**
 * The studio's pre-send check. `ref` is the id of the family's portal message the reply
 * answers (filed with `cmdr message --ref`). The reply goes to that family, and only if
 * Lionel has not written to them since that message.
 */
async function studioPreSend(client: DbClient, adminId: string, ref: string):
    Promise<{ ok: true; studentId: string } | { ok: false; status: number; reason: string }> {
    if (!UUID.test(ref)) {
        return { ok: false, status: 400, reason: 'this card has no portal thread reference; sign it off the usual way' }
    }
    const { data: msg } = await client
        .from('messages')
        .select('id, sender_id, recipient_id, created_at, deleted_at')
        .eq('id', ref)
        .maybeSingle()
    if (!msg || msg.recipient_id !== adminId) {
        return { ok: false, status: 400, reason: 'the message this card answers was not found in the portal' }
    }
    const { data: family } = await client
        .from('profiles')
        .select('id, role')
        .eq('id', msg.sender_id)
        .maybeSingle()
    if (!family || !['student', 'prospect'].includes((family as any).role)) {
        return { ok: false, status: 400, reason: 'the message this card answers is not from a student or family' }
    }
    const { count, error } = await client
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', adminId)
        .eq('recipient_id', msg.sender_id)
        .gt('created_at', msg.created_at)
        .is('deleted_at', null)
    if (error) return { ok: false, status: 500, reason: 'could not check the thread' }
    if ((count ?? 0) > 0) {
        return { ok: false, status: 409, reason: 'you already replied to them in the portal, so this draft was not sent' }
    }
    return { ok: true, studentId: msg.sender_id }
}

async function alreadySent(client: DbClient, messageId: number): Promise<boolean> {
    const { data } = await client
        .from('board_sends')
        .select('nonce')
        .eq('message_id', messageId)
        .eq('status', 'sent')
        .limit(1)
    return Boolean(data && data.length)
}

export async function POST(request: NextRequest) {
    const trust = readBoardSendTrust()
    if (!trust) return refuse(403, 'Face ID send is not set up on the studio yet (no key pinned)')

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return refuse(400, 'body is not JSON')
    }

    // Checks 1 to 4: version, channel, expiry, text hash, and Lionel's Face ID signature.
    const check = await verifyBoardSend(body, trust, Math.floor(Date.now() / 1000))
    if (!check.ok) return refuse(check.status, check.reason)
    const req: BoardSendRequest = check.req

    const client = createAdminClient()
    const admin = await getSingleAdmin(client)
    if (!admin) return refuse(500, 'no admin profile in the portal')

    // Check 5: this card not already sent, and this nonce never used. The attempt row claims
    // both at once (nonce primary key, one live attempt per card).
    if (await alreadySent(client, req.message.id)) {
        return NextResponse.json({ sent: true, already: true })
    }
    const { error: claimError } = await client.from('board_sends').insert({
        nonce: req.nonce.toLowerCase(),
        message_id: req.message.id,
        channel: req.message.channel,
        ref: req.message.ref,
        draft_sha256: req.draft_sha256.toLowerCase(),
        status: 'sending',
    })
    if (claimError) {
        if ((claimError as any).code === '23505') {
            if (String(claimError.message).includes('board_sends_pkey')) return refuse(403, 'this signature was already used')
            if (await alreadySent(client, req.message.id)) return NextResponse.json({ sent: true, already: true })
            return refuse(409, 'this reply is already being sent')
        }
        console.error('[board-send] could not record the attempt:', claimError.message)
        return refuse(500, 'could not record the send, nothing was sent')
    }
    const nonce = req.nonce.toLowerCase()

    // Check 6: the studio's own rule, he has not replied himself.
    const pre = await studioPreSend(client, admin.id, req.message.ref)
    if (!pre.ok) {
        await settle(client, nonce, { status: 'refused', reason: pre.reason })
        return refuse(pre.status, pre.reason)
    }

    // 7. Send exactly the draft, as Lionel, into that family's portal chat (with the usual
    // email notice, and a text if they opted in).
    const result = await sendMessageCore({
        client,
        senderId: admin.id,
        recipientId: pre.studentId,
        content: req.draft,
    })
    if (result.error || !result.message) {
        await settle(client, nonce, { status: 'failed', reason: result.error || 'send returned no message' })
        return refuse(502, `the portal could not send it: ${result.error || 'unknown error'}`)
    }
    await settle(client, nonce, {
        status: 'sent',
        portal_message_id: (result.message as any).id ?? null,
        sent_at: new Date().toISOString(),
    })
    return NextResponse.json({ sent: true })
}
