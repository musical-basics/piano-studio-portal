import { NextResponse } from 'next/server'
import { attachClassroomRecordings } from '@/lib/classroom-recordings'
import { syncClassroomDropboxCopies } from '@/lib/classroom-dropbox-copies'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Called by the classroom app when a recording is saved. The recording's row is
 * already in `classroom_recordings`, so this just runs the same matcher as the
 * classroom-recordings cron for that student, right away. Each recording goes on
 * the lesson it was recorded in (by its start time), never "the next lesson".
 */
export async function POST(req: Request) {
    if (req.headers.get('x-webhook-secret') !== process.env.PIANO_STUDIO_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { studentId } = await req.json().catch(() => ({}))
    if (!studentId || typeof studentId !== 'string') {
        return NextResponse.json({ error: 'studentId required' }, { status: 400 })
    }

    try {
        const result = await attachClassroomRecordings({
            studentId,
            days: 3,
            log: (msg) => console.log(`[Webhook/lesson-recording] ${msg}`),
        })
        // Copy into the student's Dropbox folder (Dropbox fetches the file itself).
        // A failure here leaves it queued for the cron, never fails the attach.
        let dropbox: unknown
        try {
            dropbox = await syncClassroomDropboxCopies({
                studentId,
                days: 3,
                log: (msg) => console.log(`[Webhook/lesson-recording] dropbox: ${msg}`),
            })
        } catch (err: any) {
            dropbox = { error: err?.message || String(err) }
            console.error('[Webhook/lesson-recording] dropbox copy failed:', err?.message || err)
        }
        // A recording whose file isn't in R2 yet is skipped here; the cron picks it up.
        return NextResponse.json({ success: true, result, dropbox })
    } catch (err: any) {
        console.error('[Webhook/lesson-recording] Failed:', err?.message || err)
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
    }
}
