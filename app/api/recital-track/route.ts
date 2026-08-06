import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Self-hosted email open tracking: a 1x1 transparent gif referenced from
// announcement emails with identifying URL params (?e=eventId&p=publicId).
// No redirects anywhere: clicks are logged separately by the RSVP page itself
// via its src=em param. Always returns the pixel, even on bad input.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const eventId = searchParams.get('e')
        const publicId = searchParams.get('p')
        if (eventId && publicId) {
            const supabase = createAdminClient()
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('public_id', publicId)
                .maybeSingle()
            if (profile) {
                await supabase.from('recital_email_events').insert({
                    event_id: eventId,
                    student_id: profile.id,
                    kind: 'open',
                    detail: 'email pixel',
                })
            }
        }
    } catch (e) {
        console.error('recital-track: logging failed (pixel still served):', e)
    }

    return new NextResponse(PIXEL, {
        status: 200,
        headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
        },
    })
}
