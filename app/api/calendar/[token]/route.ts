import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { feedForToken } from '@/lib/core/calendar-feed'

/**
 * GET /api/calendar/<token>.ics (#1082): one family's lessons as an iCalendar
 * feed that phone calendars subscribe to. No sign-in (calendar apps cannot
 * sign in): the long random token is the key, and it only ever opens that one
 * student's lessons. A wrong or reset token is a plain 404.
 */

export const dynamic = 'force-dynamic'

function portalUrl(request: Request): string {
    const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    if (app) return `${app}/student`
    return `${new URL(request.url).origin}/student`
}

async function serve(request: Request, params: Promise<{ token: string }>, withBody: boolean) {
    const { token: raw } = await params
    const token = decodeURIComponent(raw || '').replace(/\.ics$/i, '')

    let body: string | null
    try {
        body = await feedForToken(createAdminClient(), token, portalUrl(request))
    } catch (e) {
        console.error('[calendar feed] failed:', e instanceof Error ? e.message : e)
        return new NextResponse('Calendar temporarily unavailable', { status: 503, headers: { 'Retry-After': '600' } })
    }
    if (body === null) {
        return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    return new NextResponse(withBody ? body : null, {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="piano-lessons.ics"',
            // Never kept by a shared cache: a reset token must stop at once.
            'Cache-Control': 'private, no-cache',
            'X-Robots-Tag': 'noindex',
        },
    })
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
    return serve(request, params, true)
}

export async function HEAD(request: Request, { params }: { params: Promise<{ token: string }> }) {
    return serve(request, params, false)
}
