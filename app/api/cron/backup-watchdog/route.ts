import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { alertIfBackupStale, checkBackup, checkFamilyWatch } from '@/lib/backup-watchdog'

export const dynamic = 'force-dynamic'

// Each morning: email the studio inbox if a Mac job hasn't checked in for 36
// hours: the nightly database backup (decision #438) or the family-message
// watch (#776), one email each. Silent while they're fresh.
// Manual runs: ?dry=1 shows what would be sent without emailing.
export async function GET(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = new URL(request.url).searchParams.get('dry') === '1'

    try {
        const client = createAdminClient()
        const check = await checkBackup(client)
        const emailed = dryRun ? false : await alertIfBackupStale(client, check)
        console.log(`[Cron/backup-watchdog] last backup ${check.lastBackupAt ?? 'never'}`
            + ` (${check.hoursSince ?? '-'} h)${check.stale ? ', STALE' : ''}${emailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`)
        const watch = await checkFamilyWatch(client)
        const watchEmailed = dryRun ? false : await alertIfBackupStale(client, watch)
        console.log(`[Cron/backup-watchdog] family watch last check-in ${watch.lastBackupAt ?? 'never'}`
            + ` (${watch.hoursSince ?? '-'} h)${watch.stale ? ', STALE' : ''}${watchEmailed ? ', emailed' : ''}${dryRun ? ' (dry run)' : ''}`)
        return NextResponse.json({
            success: true, dryRun, emailed, ...check,
            familyWatch: { ...watch, emailed: watchEmailed },
        })
    } catch (err: any) {
        const detail = err?.message || String(err)
        console.error(`[Cron/backup-watchdog] Failed: ${detail}`)
        return NextResponse.json({ error: detail }, { status: 500 })
    }
}
