import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { makeClassroomClip } from '@/lib/classroom-clips'

export const dynamic = 'force-dynamic'
// Cutting and re-encoding up to 45 seconds takes well under a minute; room to spare.
export const maxDuration = 300

/**
 * POST { recordingId, start, end } (seconds): cuts a 15 to 45 second clip from
 * a classroom recording and saves it to the student's Dropbox folder (#1094,
 * lib/classroom-clips.ts). Admin only. A route rather than a server action so
 * it can run for minutes.
 */
export async function POST(request: Request) {
    const denied = await requireAdmin()
    if (denied) return NextResponse.json({ error: denied }, { status: 401 })
    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }
    if (typeof body?.recordingId !== 'string') return NextResponse.json({ error: 'Which recording?' }, { status: 400 })
    const result = await makeClassroomClip(body.recordingId, Number(body.start), Number(body.end), {
        log: (msg) => console.log(`[classroom-clip] ${msg}`),
    })
    return NextResponse.json(result, { status: 'error' in result ? 400 : 200 })
}
