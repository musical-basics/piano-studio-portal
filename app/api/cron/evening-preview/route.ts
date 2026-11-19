import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withCronRun } from '@/lib/cron-runs'
import { buildEveningPreview, eveningAsOf, eveningLessonDate, renderEveningPreview, sendEveningPreview } from '@/lib/evening-preview'

export const dynamic = 'force-dynamic'

// The evening email (#759, lib/evening-preview.ts): one email to the studio
// inbox with tomorrow's lessons (Eastern plus each family's own time) and the
// family messages still waiting on a reply. Only on evenings before a day with
// lessons; read-only, nothing goes to families.
//
// vercel.json runs this at 02:00 UTC: 9pm EST from November to March, but
// 10pm EDT in summer, since Vercel Cron runs on UTC. Either way it is the
// evening before the lesson day (see eveningLessonDate).
//
// Manual runs: ?date=YYYY-MM-DD for the lesson day to cover (a past day lists
// messages as they stood at 9pm the evening before), ?dry=1 to return the
// preview and the email's HTML without sending.
export const GET = withCronRun('evening-preview', handle)

async function handle(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const asked = searchParams.get('date')
    const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : eveningLessonDate()
    const dryRun = searchParams.get('dry') === '1'

    try {
        const client = createAdminClient()
        const preview = await buildEveningPreview(client, date, { asOf: eveningAsOf(date) })
        const { subject, html } = renderEveningPreview(preview)
        const hasLessons = preview.lessons.length > 0
        const emailed = !dryRun && hasLessons ? await sendEveningPreview(client, preview) : false
        console.log(
            `[Cron/evening-preview] ${date}: ${preview.lessons.length} lessons, ${preview.waiting.length} waiting` +
            `${hasLessons ? '' : ', no lessons so no email'}${emailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`,
        )
        return NextResponse.json({
            success: true,
            date,
            dryRun,
            emailed,
            wouldEmail: hasLessons,
            subject,
            lessons: preview.lessons.length,
            waiting: preview.waiting.length,
            ...(dryRun ? { preview, html } : {}),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/evening-preview] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
