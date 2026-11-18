import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { studioToday } from '@/lib/studio-timezone'
import { alertCreditCheck, checkCredits, previousMonth } from '@/lib/credit-check'
import { findPastUnloggedLessons } from '@/lib/unlogged-lessons'

export const dynamic = 'force-dynamic'

// On the 1st (vercel.json, 14:00 UTC = 9am EST / 10am EDT): line up every
// lesson logged last month with the credits actually taken, and email the
// studio inbox about any lesson charged twice or not at all (#443). The same
// email lists every lesson over two days old that is still unlogged, from any
// date, with Log it / Didn't happen buttons (#736). Read-only; silent when
// everything matches and nothing is unlogged. Teacher accounts are left out
// (#734). Manual runs: ?month=YYYY-MM for another month (the unlogged list is
// always as of now), ?dry=1 to report without emailing.
export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const asked = searchParams.get('month')
    const month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : previousMonth(studioToday())
    const dryRun = searchParams.get('dry') === '1'

    try {
        const client = createAdminClient()
        const report = await checkCredits(client, month)
        const unlogged = await findPastUnloggedLessons(client)
        const emailed = dryRun ? false : await alertCreditCheck(client, report, unlogged)
        console.log(
            `[Cron/credit-check] ${month}: ${report.lessonsChecked} lessons, ${report.creditsTaken} credits taken, ` +
            `${report.findings.length} to look at, ${unlogged.length} past lessons unlogged${emailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`,
        )
        return NextResponse.json({
            success: true,
            month,
            dryRun,
            emailed,
            lessonsChecked: report.lessonsChecked,
            lessonsCharged: report.lessonsCharged,
            creditsTaken: report.creditsTaken,
            givenBack: report.givenBack,
            labelled: report.labelled,
            findings: report.findings.map(f => ({
                kind: f.kind,
                lessonId: f.lessonId,
                lessonDate: f.lessonDate,
                lessonTime: f.lessonTime,
                detail: f.detail,
            })),
            unlogged: unlogged.map(l => ({ id: l.id, date: l.date, time: l.time, status: l.status })),
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/credit-check] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
