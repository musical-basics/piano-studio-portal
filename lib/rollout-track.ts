import { recordRolloutEvent } from '@/app/actions/rollouts'
import type { RolloutKey } from '@/lib/rollouts'

/**
 * The family portal's usage record for rolled-out features (protocol 1.20):
 * trackRollout('my_music', 'downloaded'). Fire and forget: nothing waits for
 * it and any failure is dropped. A tap is recorded straight away (the family
 * may be leaving for a PDF or their calendar app); `idle` waits for the
 * browser to be idle first, for things recorded while a tab is loading, so
 * the write never sits in front of the page's own server calls. `once`
 * records an action at most once per page load (a tab opened, a tip shown);
 * anything else at most once every 5 seconds, so a double tap is one action.
 */

const lastSent = new Map<string, number>()

export function trackRollout(feature: RolloutKey, action: string, { once = false, idle = false }: { once?: boolean; idle?: boolean } = {}): void {
    if (typeof window === 'undefined') return
    const key = `${feature}:${action}`
    const now = Date.now()
    const last = lastSent.get(key)
    if (last !== undefined && (once || now - last < 5_000)) return
    lastSent.set(key, now)
    const send = () => {
        try {
            recordRolloutEvent(feature, action).catch(() => {})
        } catch {
            // never let the usage record break the page
        }
    }
    if (!idle) return send()
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(send, { timeout: 4_000 })
    else window.setTimeout(send, 800)
}
