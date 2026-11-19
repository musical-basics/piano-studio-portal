import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/classroom-recordings'
import { logByClassroomAttendance } from '@/lib/classroom-attendance'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Called by the classroom app (on our own LiveKit server only) when someone
 * leaves a student's lesson room or the room closes (#795). The classroom has
 * already written who was in the room into `classroom_attendance`; this logs
 * the student's lesson when Lionel and the student were in it together 20+
 * minutes (lib/classroom-attendance.ts). Body: { studentId, dry? }. `dry: true`
 * only reports what it would log.
 */
export async function POST(req: Request) {
    if (!process.env.PIANO_STUDIO_SECRET || req.headers.get('x-webhook-secret') !== process.env.PIANO_STUDIO_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { studentId, dry } = await req.json().catch(() => ({}))
    if (!studentId || typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
        return NextResponse.json({ error: 'studentId (a student uuid) required' }, { status: 400 })
    }

    try {
        const result = await logByClassroomAttendance({
            studentId,
            days: 3,
            dryRun: dry === true,
            log: (msg) => console.log(`[Webhook/classroom-attendance] ${msg}`),
        })
        return NextResponse.json({ success: true, dryRun: dry === true, result })
    } catch (err: any) {
        console.error('[Webhook/classroom-attendance] Failed:', err?.message || err)
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
    }
}
