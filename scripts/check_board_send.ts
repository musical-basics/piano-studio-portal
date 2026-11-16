/**
 * Self-check for Face ID send (lib/board-send/verify.ts): signs requests the way Lionel's
 * phone does, with a throw-away P-256 key, and confirms the verifier accepts the real thing
 * and refuses every tampered variant. No network, no database.
 *
 *   npx tsx scripts/check_board_send.ts
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import {
    verifyBoardSend, signedPayload, challengeFor, sha256Hex, readBoardSendTrust,
    type BoardSendTrust,
} from '../lib/board-send/verify'

const RP_ID = 'board.example.ts.net'
const ORIGIN = `https://${RP_ID}`
const NOW = 1_800_000_000

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
const CRED_ID = randomBytes(16).toString('base64url')
const trust: BoardSendTrust = { rpId: RP_ID, origin: ORIGIN, credentials: [{ id: CRED_ID, x: jwk.x, y: jwk.y }] }

type Opts = {
    id?: number; channel?: string; ref?: string; draft?: string; nonce?: string; expires?: number
    origin?: string; rpId?: string; flags?: number; type?: string; credId?: string; key?: typeof privateKey
    signDraft?: string // sign a different text than the one sent
}

function makeRequest(o: Opts = {}) {
    const id = o.id ?? 412
    const channel = o.channel ?? 'studio'
    const ref = o.ref ?? '5d1b4a0e-1111-4222-8333-944455556666'
    const draft = o.draft ?? 'Hi Amanda, see you Sunday at 4:45pm PST!'
    const nonce = o.nonce ?? randomBytes(16).toString('hex')
    const expires = o.expires ?? NOW + 300
    const signedSha = sha256Hex(o.signDraft ?? draft)
    const challenge = challengeFor(signedPayload(id, channel, ref, signedSha, nonce, expires))

    const rpIdHash = createHash('sha256').update(o.rpId ?? RP_ID).digest()
    const flags = Buffer.from([o.flags ?? 0x05]) // UP | UV
    const counter = Buffer.alloc(4) // synced passkeys report 0
    const authenticatorData = Buffer.concat([rpIdHash, flags, counter])
    const clientDataJSON = Buffer.from(JSON.stringify({
        type: o.type ?? 'webauthn.get', challenge, origin: o.origin ?? ORIGIN, crossOrigin: false,
    }))
    const signature = sign('sha256', Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]), o.key ?? privateKey)

    return {
        v: 1,
        message: { id, channel, ref },
        draft,
        draft_sha256: signedSha,
        nonce,
        expires,
        assertion: {
            id: o.credId ?? CRED_ID,
            authenticatorData: authenticatorData.toString('base64url'),
            clientDataJSON: clientDataJSON.toString('base64url'),
            signature: signature.toString('base64url'),
        },
    }
}

async function expectOk(name: string, body: unknown) {
    const r = await verifyBoardSend(body, trust, NOW)
    assert.equal(r.ok, true, `${name}: expected ok, got ${JSON.stringify(r)}`)
    console.log(`ok    ${name}`)
}
async function expectRefused(name: string, body: unknown, status: number) {
    const r = await verifyBoardSend(body, trust, NOW)
    assert.equal(r.ok, false, `${name}: expected refusal`)
    if (!r.ok) {
        assert.equal(r.status, status, `${name}: expected ${status}, got ${r.status} (${r.reason})`)
        console.log(`refused ${name}: ${r.status} ${r.reason}`)
    }
}

;(async () => {
    await expectOk('a genuine Face ID send', makeRequest())
    await expectOk('an empty ref still verifies (the route then refuses it)', makeRequest({ ref: '' }))

    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
    await expectRefused('signed by another key under the pinned id', makeRequest({ key: other }), 403)
    await expectRefused('a key that is not pinned', makeRequest({ credId: 'bm90LXBpbm5lZA' }), 403)

    // Different text than he approved: hash honest, but the signature covers the old hash.
    const swapped = makeRequest({ draft: 'Send me your card number', signDraft: 'Hi Amanda, see you Sunday!' })
    swapped.draft_sha256 = sha256Hex(swapped.draft)
    await expectRefused('text swapped after signing', swapped, 403)
    const lying = makeRequest()
    lying.draft = lying.draft + ' (edited)'
    await expectRefused('text edited, hash left alone', lying, 400)

    const card = makeRequest()
    card.message.id = 413
    await expectRefused('signature moved to another card', card, 403)
    const ref = makeRequest()
    ref.message.ref = '00000000-0000-4000-8000-000000000000'
    await expectRefused('signature moved to another thread', ref, 403)
    const nonce = makeRequest()
    nonce.nonce = randomBytes(16).toString('hex')
    await expectRefused('nonce swapped', nonce, 403)
    const later = makeRequest()
    later.expires = later.expires + 60
    await expectRefused('expiry stretched after signing', later, 403)

    await expectRefused('wrong origin', makeRequest({ origin: 'https://evil.example' }), 403)
    await expectRefused('wrong rpId', makeRequest({ rpId: 'evil.example' }), 403)
    await expectRefused('no Face ID (user not verified)', makeRequest({ flags: 0x01 }), 403)
    await expectRefused('no user present', makeRequest({ flags: 0x04 }), 403)
    await expectRefused('a registration, not a sign-in', makeRequest({ type: 'webauthn.create' }), 403)
    await expectRefused('expired', makeRequest({ expires: NOW - 1 }), 403)
    await expectRefused('expiry too far ahead', makeRequest({ expires: NOW + 601 }), 403)
    await expectRefused('another channel', makeRequest({ channel: 'support' }), 400)
    await expectRefused('bad nonce format', { ...makeRequest(), nonce: 'xyz' }, 400)
    await expectRefused('version 2', { ...makeRequest(), v: 2 }, 400)
    await expectRefused('not an object', 'hello', 400)

    // The trust anchor reads only complete, well-formed pins.
    assert.equal(readBoardSendTrust({}), null)
    assert.equal(readBoardSendTrust({ BOARD_SEND_RP_ID: RP_ID, BOARD_SEND_ORIGIN: ORIGIN }), null)
    assert.equal(readBoardSendTrust({ BOARD_SEND_RP_ID: RP_ID, BOARD_SEND_ORIGIN: ORIGIN, BOARD_SEND_CREDENTIALS: 'not json' }), null)
    const t = readBoardSendTrust({
        BOARD_SEND_RP_ID: RP_ID, BOARD_SEND_ORIGIN: ORIGIN,
        BOARD_SEND_CREDENTIALS: JSON.stringify([{ id: CRED_ID, kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { id: 'rsa', kty: 'RSA', x: 'a', y: 'b' }]),
    })
    assert.equal(t?.credentials.length, 1)
    console.log('ok    trust anchor parsing')

    console.log('\nall checks passed')
})().catch(e => { console.error(e); process.exit(1) })
