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
    // The export's own shape (publicKey nested), as printed by `cmdr faceid --export`.
    const nested = readBoardSendTrust({
        BOARD_SEND_RP_ID: RP_ID, BOARD_SEND_ORIGIN: ORIGIN,
        BOARD_SEND_CREDENTIALS: JSON.stringify([{ id: CRED_ID, label: 'his phone', fingerprint: 'x', publicKey: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } }]),
    })
    assert.deepEqual(nested?.credentials, [{ id: CRED_ID, x: jwk.x, y: jwk.y }])
    console.log('ok    trust anchor parsing')

    // The wiki's test vector ("Signed send"), made by the board's own code with a throw-away key.
    // It is signed for the "support" channel, so the channel is overridden for this check only.
    const wikiTrust: BoardSendTrust = {
        rpId: 'board.example.ts.net', origin: 'https://board.example.ts.net',
        credentials: [{ id: 'test-credential-id', x: 'vWKYNd79XLD1Rwt8jjQUeyuqby_bYc5XjycckhufSPc', y: 'imEczEp2Loy1v0C53oqNdvgNRaa5txt1fmA0wqvlmyM' }],
    }
    const draft = 'Hi Dana,\n\nThursday at 4 works. See you then.\n\nWarmly, Lionel'
    const wiki = () => ({
        v: 1,
        message: { id: 412, channel: 'support', ref: 'thread-81' },
        draft,
        draft_sha256: '5a960f38c0e2c1bc98f26be70764618c95814e6c33d7201657622d3cde90bb37',
        nonce: '000102030405060708090a0b0c0d0e0f',
        expires: 1900000000,
        assertion: {
            id: 'test-credential-id',
            authenticatorData: 'qkBBIpv8A1S435VIe662FA1hGIQKLT0bKvcAw3DElOcFAAAAAA',
            clientDataJSON: 'eyJ0eXBlIjogIndlYmF1dGhuLmdldCIsICJjaGFsbGVuZ2UiOiAiT0I2dUc4NXcwak53bzl4Y0RBWTEwMWY2cXhLMDFQWVAyblcwUDVRd3pxYyIsICJvcmlnaW4iOiAiaHR0cHM6Ly9ib2FyZC5leGFtcGxlLnRzLm5ldCIsICJjcm9zc09yaWdpbiI6IGZhbHNlfQ',
            signature: 'MEQCIEWIMwFEFpbX0tW5GY7N-7wy0NK2a9safDs60sLhABwEAiBYrW0YNncWRJSncwwHqCOF4eFywlhzKvPYgBS9nHoOcQ',
        },
    })
    assert.equal(
        challengeFor(signedPayload(412, 'support', 'thread-81', wiki().draft_sha256, wiki().nonce, 1900000000)),
        'OB6uG85w0jNwo9xcDAY101f6qxK01PYP2nW0P5Qwzqc',
    )
    const WIKI_NOW = 1900000000 - 300
    const wikiCheck = (b: unknown) => verifyBoardSend(b, wikiTrust, WIKI_NOW, 'support')
    const good = await wikiCheck(wiki())
    assert.equal(good.ok, true, `wiki vector: expected ok, got ${JSON.stringify(good)}`)
    console.log('ok    the wiki test vector')
    const tweaks: [string, (b: ReturnType<typeof wiki>) => void][] = [
        ['draft', b => { b.draft = b.draft.replace('Dana', 'Dane'); b.draft_sha256 = sha256Hex(b.draft) }],
        ['nonce', b => { b.nonce = b.nonce.slice(0, -1) + 'e' }],
        ['expires', b => { b.expires = 1900000001 }],
        ['message.id', b => { b.message.id = 413 }],
        ['message.channel', b => { b.message.channel = 'supporu' }],
        ['message.ref', b => { b.message.ref = 'thread-82' }],
    ]
    for (const [field, tweak] of tweaks) {
        const b = wiki()
        tweak(b)
        const r = await verifyBoardSend(b, wikiTrust, WIKI_NOW, field === 'message.channel' ? 'supporu' : 'support')
        assert.equal(r.ok, false, `wiki vector with ${field} changed: expected refusal`)
        console.log(`refused the wiki vector with one character of ${field} changed${r.ok ? '' : `: ${r.reason}`}`)
    }

    console.log('\nall checks passed')
})().catch(e => { console.error(e); process.exit(1) })
