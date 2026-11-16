import { createHash } from 'node:crypto'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { isoCBOR } from '@simplewebauthn/server/helpers'

/**
 * Face ID send ("signed send", contract v1 from the command center's wiki page "Signed send").
 *
 * Lionel taps Send on a reply card on his board; his phone signs, with a passkey only
 * Face ID releases, a challenge that is a hash of the exact reply, the card number, this
 * channel, the thread reference, a one-time number and an expiry. The board forwards
 * that signature and the text here. This module checks all of it against keys pinned in
 * this portal's own environment (never anything the board or the hub says at request time).
 * Pure: no database, so it can be checked with a throw-away key (scripts/check_board_send.ts).
 */

export const BOARD_SEND_CHANNEL = 'studio'
/** The board signs with a 5-minute expiry; anything further ahead than this is refused. */
export const MAX_EXPIRES_AHEAD_SECONDS = 600
const PAYLOAD_PREFIX = 'command-center-send/v1'

export type PinnedCredential = { id: string; x: string; y: string }
export type BoardSendTrust = { rpId: string; origin: string; credentials: PinnedCredential[] }

export type BoardSendRequest = {
    v: 1
    message: { id: number; channel: string; ref: string }
    draft: string
    draft_sha256: string
    nonce: string
    expires: number
    assertion: {
        id: string
        authenticatorData: string
        clientDataJSON: string
        signature: string
        userHandle?: string
    }
}

export type BoardSendCheck =
    | { ok: true; req: BoardSendRequest }
    | { ok: false; status: 400 | 403; reason: string }

/**
 * The trust anchor, from this deployment's environment:
 *   BOARD_SEND_RP_ID        the board's tailnet host name
 *   BOARD_SEND_ORIGIN       https:// + that host
 *   BOARD_SEND_CREDENTIALS  the `credentials` list from `cmdr faceid --export` (P-256 keys, base64url)
 * Returns null until all three are set, which keeps Face ID send switched off.
 */
export function readBoardSendTrust(env: Record<string, string | undefined> = process.env): BoardSendTrust | null {
    const rpId = env.BOARD_SEND_RP_ID?.trim()
    const origin = env.BOARD_SEND_ORIGIN?.trim()
    if (!rpId || !origin) return null
    let raw: unknown
    try {
        raw = JSON.parse(env.BOARD_SEND_CREDENTIALS || '[]')
    } catch {
        return null
    }
    if (!Array.isArray(raw)) return null
    const credentials: PinnedCredential[] = []
    for (const entry of raw as any[]) {
        // Accepts the export's own shape ({ id, publicKey: { kty, crv, x, y } }) or a flat { id, kty, crv, x, y }.
        if (!entry || typeof entry.id !== 'string') continue
        const c = entry.publicKey && typeof entry.publicKey === 'object' ? entry.publicKey : entry
        if (typeof c.x !== 'string' || typeof c.y !== 'string') continue
        if (c.kty !== undefined && c.kty !== 'EC') continue
        if (c.crv !== undefined && c.crv !== 'P-256') continue
        credentials.push({ id: entry.id, x: c.x, y: c.y })
    }
    if (!credentials.length) return null
    return { rpId, origin, credentials }
}

export function sha256Hex(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** The exact string the phone's challenge is a hash of. */
export function signedPayload(id: number, channel: string, ref: string, draftSha256: string, nonce: string, expires: number): string {
    return [PAYLOAD_PREFIX, String(id), channel, ref, draftSha256, nonce, String(expires)].join('\n')
}

/** base64url (no padding) of SHA-256(payload): what clientDataJSON.challenge must equal. */
export function challengeFor(payload: string): string {
    return createHash('sha256').update(payload, 'utf8').digest('base64url')
}

function isB64url(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0 && /^[A-Za-z0-9_-]+$/.test(v)
}

/** Shape checks only; returns the typed request or the reason it is malformed. */
export function parseBoardSendRequest(body: unknown): BoardSendRequest | string {
    const b = body as any
    if (!b || typeof b !== 'object') return 'body is not a JSON object'
    if (b.v !== 1) return 'unsupported version (v must be 1)'
    const m = b.message
    if (!m || typeof m !== 'object') return 'message is missing'
    if (!Number.isSafeInteger(m.id) || m.id <= 0) return 'message.id must be a positive integer'
    if (typeof m.channel !== 'string') return 'message.channel is missing'
    if (typeof m.ref !== 'string') return 'message.ref must be a string'
    if (typeof b.draft !== 'string' || b.draft.trim().length === 0) return 'draft is empty'
    if (typeof b.draft_sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(b.draft_sha256)) return 'draft_sha256 must be 64 hex characters'
    if (typeof b.nonce !== 'string' || !/^[0-9a-fA-F]{32}$/.test(b.nonce)) return 'nonce must be 32 hex characters'
    if (!Number.isSafeInteger(b.expires) || b.expires <= 0) return 'expires must be a positive integer'
    const a = b.assertion
    if (!a || typeof a !== 'object') return 'assertion is missing'
    for (const k of ['id', 'authenticatorData', 'clientDataJSON', 'signature'] as const) {
        if (!isB64url(a[k])) return `assertion.${k} must be base64url`
    }
    if (a.userHandle !== undefined && a.userHandle !== null && typeof a.userHandle !== 'string') return 'assertion.userHandle must be a string'
    return b as BoardSendRequest
}

/** COSE_Key (EC2, ES256, P-256) for a pinned JWK-style x/y pair. */
function coseKey(cred: PinnedCredential): Uint8Array {
    const x = Buffer.from(cred.x, 'base64url')
    const y = Buffer.from(cred.y, 'base64url')
    if (x.length !== 32 || y.length !== 32) throw new Error('pinned key is not a P-256 point')
    return isoCBOR.encode(new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, new Uint8Array(x)],
        [-3, new Uint8Array(y)],
    ]))
}

/**
 * Contract checks 1 to 4, in order. Any failure means nothing is sent. `channel` is only
 * overridden by the self-check, to run the wiki's test vector (which is signed for "support").
 * (5 to 7, single use and the studio's own pre-send checks, need the database: the route does them.)
 */
export async function verifyBoardSend(
    body: unknown, trust: BoardSendTrust, nowSeconds: number, channel: string = BOARD_SEND_CHANNEL,
): Promise<BoardSendCheck> {
    const parsed = parseBoardSendRequest(body)
    if (typeof parsed === 'string') return { ok: false, status: 400, reason: parsed }
    const req = parsed

    // 1. Version (parsed), channel, expiry window.
    if (req.message.channel !== channel) {
        return { ok: false, status: 400, reason: `this receiver only sends the "${channel}" channel` }
    }
    if (req.expires <= nowSeconds) return { ok: false, status: 403, reason: 'the signature has expired; tap Send again' }
    if (req.expires > nowSeconds + MAX_EXPIRES_AHEAD_SECONDS) {
        return { ok: false, status: 403, reason: 'expiry is more than 10 minutes ahead' }
    }

    // 2. The text is the text that was hashed.
    if (sha256Hex(req.draft) !== req.draft_sha256.toLowerCase()) {
        return { ok: false, status: 400, reason: 'draft does not match draft_sha256' }
    }

    // 3. Rebuild the challenge from the fields received, nothing else.
    const challenge = challengeFor(signedPayload(
        req.message.id, req.message.channel, req.message.ref, req.draft_sha256, req.nonce, req.expires,
    ))

    // 4. The phone's signature, under a key pinned here, with Face ID (user verified).
    const cred = trust.credentials.find(c => c.id === req.assertion.id)
    if (!cred) return { ok: false, status: 403, reason: 'signed with a key this receiver has not pinned' }
    try {
        const { verified } = await verifyAuthenticationResponse({
            response: {
                id: req.assertion.id,
                rawId: req.assertion.id,
                type: 'public-key',
                response: {
                    authenticatorData: req.assertion.authenticatorData,
                    clientDataJSON: req.assertion.clientDataJSON,
                    signature: req.assertion.signature,
                    ...(req.assertion.userHandle ? { userHandle: req.assertion.userHandle } : {}),
                },
                clientExtensionResults: {},
            },
            expectedChallenge: challenge,
            expectedOrigin: trust.origin,
            expectedRPID: trust.rpId,
            expectedType: 'webauthn.get',
            // Synced passkeys keep the counter at 0, so it is never enforced: with a stored
            // counter of 0 the library only rejects a counter that is > 0 and <= 0.
            credential: { id: cred.id, publicKey: coseKey(cred) as any, counter: 0 },
            requireUserVerification: true,
        })
        if (!verified) return { ok: false, status: 403, reason: 'signature did not verify' }
    } catch (e: any) {
        return { ok: false, status: 403, reason: `signature check failed: ${e?.message || e}` }
    }

    return { ok: true, req }
}
