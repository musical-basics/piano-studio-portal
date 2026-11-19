import { createAdminClient } from '@/lib/supabase/admin'
import { classroomOnFallback, setClassroomFallback, verifyClassroomSwitch, type SwitchTarget } from '@/lib/classroom-switch'

export const dynamic = 'force-dynamic'

/**
 * #950: the one-tap classroom switch from the server-down emails
 * (lib/classroom-switch.ts). GET shows what the button will do and never
 * changes anything (email scanners open links); POST, from the button, flips
 * classroom_settings.livekit_fallback. The signed link is the credential, so
 * it works from his phone without signing in.
 */

const HEADERS = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
}

function esc(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function page(title: string, body: string, status = 200): Response {
    return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  body { margin: 0; padding: 24px 16px; background: #f5f5f4; color: #1c1917; font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card { max-width: 440px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 22px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  h1 { font-size: 21px; margin: 0 0 10px; line-height: 1.3; }
  p { margin: 0 0 12px; }
  .muted { color: #57534e; font-size: 15px; }
  button { display: block; width: 100%; margin-top: 16px; padding: 14px; font-size: 17px; font-weight: 600; border: 0; border-radius: 8px; color: #fff; background: #1d4ed8; cursor: pointer; }
</style></head>
<body><div class="card">${body}</div></body></html>`, { status, headers: HEADERS })
}

const WHAT: Record<SwitchTarget, { title: string; button: string; done: string; already: string }> = {
    cloud: {
        title: 'Switch the classroom to LiveKit Cloud?',
        button: 'Switch to LiveKit Cloud',
        done: 'The classroom now uses LiveKit Cloud. New joins connect there within about 30 seconds; anyone already in a lesson should reload the page. Auto-record is off on Cloud (its free plan has 60 recording minutes a month); the Record button still works.',
        already: 'The classroom is already on LiveKit Cloud.',
    },
    main: {
        title: 'Switch the classroom back to your own server?',
        button: 'Switch back to my server',
        done: 'The classroom is back on your own server. New joins connect there within about 30 seconds; anyone in a lesson should reload the page.',
        already: 'The classroom is already on your own server.',
    },
}

function refused(reason: string): Response {
    const text = reason === 'expired'
        ? 'This link has expired (links last 7 days). The latest server email has a fresh one.'
        : 'This link is not valid.'
    return page('Link not valid', `<h1>Link not valid</h1><p>${esc(text)}</p>`, 400)
}

export async function GET(request: Request) {
    const q = new URL(request.url).searchParams
    const v = verifyClassroomSwitch(q.get('to'), q.get('exp'), q.get('sig'))
    if (!v.ok) return refused(v.reason)
    const w = WHAT[v.to]
    const onCloud = await classroomOnFallback(createAdminClient()).catch(() => null)
    const now = onCloud === null ? 'The current setting could not be read.' : `Right now the classroom is on ${onCloud ? 'LiveKit Cloud' : 'your own server'}.`
    return page(w.title, `<h1>${esc(w.title)}</h1><p class="muted">${esc(now)}</p>
<form method="post" action="/api/classroom-switch">
<input type="hidden" name="to" value="${esc(v.to)}"><input type="hidden" name="exp" value="${esc(q.get('exp')!)}"><input type="hidden" name="sig" value="${esc(q.get('sig')!)}">
<button type="submit">${esc(w.button)}</button></form>`)
}

export async function POST(request: Request) {
    const form = await request.formData().catch(() => null)
    const v = verifyClassroomSwitch(String(form?.get('to') ?? ''), String(form?.get('exp') ?? ''), String(form?.get('sig') ?? ''))
    if (!v.ok) return refused(v.reason)
    const w = WHAT[v.to]
    const client = createAdminClient()
    try {
        const onCloud = await classroomOnFallback(client)
        if (onCloud === (v.to === 'cloud')) return page(w.already, `<h1>${esc(w.already)}</h1>`)
        await setClassroomFallback(client, v.to === 'cloud', 'email link')
    } catch (e: any) {
        console.error('[classroom-switch] failed:', e?.message || e)
        return page('Not switched', `<h1>Not switched</h1><p>The setting could not be saved. Try again in a minute.</p>`, 500)
    }
    console.log(`[classroom-switch] classroom switched to ${v.to === 'cloud' ? 'LiveKit Cloud' : 'its own server'} from an email link`)
    return page('Done', `<h1>Done</h1><p>${esc(w.done)}</p>`)
}
