import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { isoToStudioWallClock, studioWallClockToISO } from '@/lib/studio-timezone'
import {
    alertUnloggedLessons,
    fetchZoomRecordings,
    findUnloggedLessons,
    lessonEndMs,
    splitForTonight,
} from '@/lib/unlogged-lessons'

export const dynamic = 'force-dynamic'

// The same-day nudge (#538): at 11pm, one email listing today's lessons that
// are still unlogged, while it is fresh which ones happened. Same email and
// buttons as the 8:30am one (which stays as the backstop), sent only when
// something is left after skipping lessons that have not ended and lessons
// Zoom will log itself (see zoomWillLog in lib/unlogged-lessons.ts).
//
// vercel.json runs this at 04:00 UTC: 11pm EST from November to March, but
// midnight EDT in summer, which is already the next day in Eastern. So the day
// covered is the Eastern date six hours before the run, which is the evening
// that just ended in either season.
//
// Manual runs: ?date=YYYY-MM-DD for another day (a past day is judged as it
// stood at 11pm that night, with the lessons' current status), ?dry=1 to list
// without emailing.
export const GET = withCronRun('unlogged-tonight', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const tonight = isoToStudioWallClock(new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()).localDate
    const asked = searchParams.get('date')
    const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : tonight
    const asOf = date < tonight ? new Date(studioWallClockToISO(date, '23:00')) : now
    const dryRun = searchParams.get('dry') === '1'

    try {
        const client = createAdminClient()
        const lessons = await findUnloggedLessons(client, date)
        const needZoom = lessons.some(l => l.zoomMeetingId && lessonEndMs(l) <= asOf.getTime())
        const recordings = needZoom ? await fetchZoomRecordings(date) : new Map()
        const split = splitForTonight(lessons, asOf, recordings)
        const emailed = dryRun ? false : await alertUnloggedLessons(client, date, split.send, { kind: 'tonight' })
        console.log(
            `[Cron/unlogged-tonight] ${date}: ${split.send.length} to send, ${split.zoomWillLog.length} left to Zoom, ` +
            `${split.notEnded.length} not over${recordings === null ? ' (Zoom unreachable, timing only)' : ''}` +
            `${emailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`,
        )
        const brief = (l: { id: string; time: string; status: string }) => ({ id: l.id, time: l.time, status: l.status })
        return NextResponse.json({
            success: true,
            date,
            asOf: asOf.toISOString(),
            dryRun,
            emailed,
            zoomChecked: recordings !== null,
            unlogged: split.send.map(brief),
            leftToZoom: split.zoomWillLog.map(brief),
            notOverYet: split.notEnded.map(brief),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/unlogged-tonight] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
