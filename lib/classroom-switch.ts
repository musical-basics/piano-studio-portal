import { createHmac, timingSafeEqual } from 'crypto'
import type { DbClient } from '@/lib/supabase/admin'
import { appBaseUrl } from '@/lib/lesson-action-links'

/**
 * One-tap "switch the classroom back to LiveKit Cloud" (Lionel's #950).
 *
 * The classroom reads classroom_settings.livekit_fallback at run time
 * (music-lesson-dashboard lib/livekit-target.ts, 30 s cache): true sends new
 * connections to LiveKit Cloud instead of the studio's own server, with no
 * redeploy. It only has an effect once the classroom has a fallback configured
 * (LIVEKIT_CLOUD_* set at the switch to the studio's server).
 *
 * The server-down emails carry a signed link to /api/classroom-switch: it opens a
 * page with one button (a GET never switches, so email link scanners can't),
 * and the button flips the setting. Links are signed with a key derived from
 * CRON_SECRET (like the lesson action links) and last 7 days.
 */

export type SwitchTarget = 'cloud' | 'main'
const LINK_TTL_S = 7 * 24 * 60 * 60
export const FALLBACK_KEY = 'livekit_fallback'

function signingKey(): Buffer | null {
    const secret = process.env.CRON_SECRET
    if (!secret) return null
    return createHmac('sha256', secret).update('classroom-switch/v1').digest()
}

function sign(to: SwitchTarget, exp: number, key: Buffer): string {
    return createHmac('sha256', key).update(`${to}.${exp}`).digest('base64url')
}

/** The link for an email, or null when links can't be signed (no CRON_SECRET). */
export function classroomSwitchUrl(to: SwitchTarget, now: Date = new Date(), baseUrl: string = appBaseUrl()): string | null {
    const key = signingKey()
    if (!key) return null
    const exp = Math.floor(now.getTime() / 1000) + LINK_TTL_S
    return `${baseUrl}/api/classroom-switch?to=${to}&exp=${exp}&sig=${sign(to, exp, key)}`
}

export function verifyClassroomSwitch(
    to: string | null | undefined,
    exp: string | null | undefined,
    sig: string | null | undefined,
    now: Date = new Date(),
): { ok: true; to: SwitchTarget } | { ok: false; reason: 'invalid' | 'expired' | 'unconfigured' } {
    const key = signingKey()
    if (!key) return { ok: false, reason: 'unconfigured' }
    if ((to !== 'cloud' && to !== 'main') || !exp || !/^\d{9,11}$/.test(exp) || !sig || sig.length > 100) return { ok: false, reason: 'invalid' }
    const expected = Buffer.from(sign(to, Number(exp), key))
    const given = Buffer.from(sig)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'invalid' }
    if (Number(exp) * 1000 < now.getTime()) return { ok: false, reason: 'expired' }
    return { ok: true, to }
}

/** True while the classroom is switched to LiveKit Cloud. */
export async function classroomOnFallback(client: DbClient): Promise<boolean> {
    const { data } = await client.from('classroom_settings').select('value').eq('key', FALLBACK_KEY).maybeSingle()
    return data?.value === true
}

export async function setClassroomFallback(client: DbClient, on: boolean, by: string): Promise<void> {
    const { error } = await client
        .from('classroom_settings')
        .upsert({ key: FALLBACK_KEY, value: on, updated_at: new Date().toISOString(), updated_by: by }, { onConflict: 'key' })
    if (error) throw new Error(`classroom_settings write failed: ${error.message}`)
}
