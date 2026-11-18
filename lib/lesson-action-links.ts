import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * One-time links for the unlogged-lessons email: "Log it" and "Didn't happen"
 * (Lionel's #441), so a lesson can be cleared from a phone without opening admin.
 *
 * A link carries the lesson, the action, the date and time the email showed,
 * an expiry and a random token id, signed with an HMAC. The key is derived from
 * CRON_SECRET (already in every environment) with its own label, so a link can
 * never stand in for cron auth or the other way round. Single use is enforced
 * at POST time by inserting the token id into lesson_action_link_uses, whose
 * primary key refuses a second use.
 *
 * Opening a link (GET) never acts: email scanners and previewers fetch links on
 * their own. It shows a confirm page whose button POSTs.
 */

export type LessonAction = 'log' | 'remove'

export const LINK_TTL_DAYS = 7

export type LessonActionClaims = {
    /** lessons.id */
    l: string
    a: LessonAction
    /** Lesson date and HH:MM time as the email showed them; a moved lesson is refused. */
    d: string
    t: string
    /** Expiry, unix seconds. */
    e: number
    /** Token id, recorded on use so the link works once. */
    j: string
}

export type VerifyResult =
    | { ok: true; claims: LessonActionClaims }
    | { ok: false; reason: 'invalid' | 'expired' | 'unconfigured' }

function signingKey(): Buffer | null {
    const secret = process.env.CRON_SECRET
    if (!secret) return null
    return createHmac('sha256', secret).update('lesson-action-links/v1').digest()
}

function b64url(buf: Buffer): string {
    return buf.toString('base64url')
}

export function lessonActionLinksEnabled(): boolean {
    return signingKey() !== null
}

export function signLessonAction(
    { lessonId, action, date, time }: { lessonId: string; action: LessonAction; date: string; time: string },
    now: Date = new Date(),
): string | null {
    const key = signingKey()
    if (!key) return null
    const claims: LessonActionClaims = {
        l: lessonId,
        a: action,
        d: date,
        t: time.slice(0, 5),
        e: Math.floor(now.getTime() / 1000) + LINK_TTL_DAYS * 24 * 60 * 60,
        j: b64url(randomBytes(16)),
    }
    const body = b64url(Buffer.from(JSON.stringify(claims)))
    const sig = b64url(createHmac('sha256', key).update(body).digest())
    return `${body}.${sig}`
}

export function verifyLessonAction(token: string | null | undefined, now: Date = new Date()): VerifyResult {
    const key = signingKey()
    if (!key) return { ok: false, reason: 'unconfigured' }
    if (!token || token.length > 1000) return { ok: false, reason: 'invalid' }
    const [body, sig, extra] = token.split('.')
    if (!body || !sig || extra !== undefined) return { ok: false, reason: 'invalid' }

    const expected = createHmac('sha256', key).update(body).digest()
    const given = Buffer.from(sig, 'base64url')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'invalid' }

    let claims: LessonActionClaims
    try {
        claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    } catch {
        return { ok: false, reason: 'invalid' }
    }
    if (
        !claims || typeof claims.l !== 'string' || (claims.a !== 'log' && claims.a !== 'remove') ||
        typeof claims.d !== 'string' || typeof claims.t !== 'string' ||
        typeof claims.e !== 'number' || typeof claims.j !== 'string'
    ) {
        return { ok: false, reason: 'invalid' }
    }
    if (claims.e * 1000 < now.getTime()) return { ok: false, reason: 'expired' }
    return { ok: true, claims }
}

export function appBaseUrl(): string {
    return (process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com').replace(/\/$/, '')
}

export function lessonActionUrl(token: string, baseUrl: string = appBaseUrl()): string {
    return `${baseUrl}/api/lesson-action?t=${encodeURIComponent(token)}`
}
