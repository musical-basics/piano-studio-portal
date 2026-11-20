/**
 * Moves classroom videos older than 60 days from Cloudflare R2 to their copy in
 * the student's Dropbox folder (Lionel's #1020, lib/classroom-r2-move.ts): only
 * when the Dropbox copy is finished and the same size; then the library row and
 * lessons point at a Dropbox share link and the R2 file is deleted. The daily
 * cron /api/cron/classroom-r2-move does the same; this is for the first run and
 * for looking.
 *
 *   npx tsx scripts/move_classroom_videos_to_dropbox.ts            # dry run: the plan, nothing changes
 *   npx tsx scripts/move_classroom_videos_to_dropbox.ts --apply    # do it
 *   ... --days=90                                                   # another age
 *
 * Needs .env.local (Supabase, Dropbox) plus R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and
 * R2_SECRET_ACCESS_KEY in the environment (the portal's Vercel env has them).
 */
import { config } from 'dotenv'

config({ path: '.env.local' })

async function main() {
    const { moveOldClassroomVideos } = await import('../lib/classroom-r2-move')
    const { listR2Objects, RECORDINGS_BUCKET } = await import('../lib/classroom-r2')
    const apply = process.argv.includes('--apply')
    const daysArg = process.argv.find(a => a.startsWith('--days='))
    const days = daysArg ? Number(daysArg.slice('--days='.length)) : undefined

    const size = async () => (await listR2Objects(RECORDINGS_BUCKET)).reduce((sum, o) => sum + o.size, 0)
    const gb = (n: number) => `${(n / 1e9).toFixed(2)} GB`
    const before = await size()
    console.log(`${RECORDINGS_BUCKET}: ${gb(before)} before`)

    const result = await moveOldClassroomVideos({ dryRun: !apply, days, log: msg => console.log(`  ${msg}`) })
    console.log(`\n${apply ? 'Moved' : 'Would move'} ${result.moved.length} video(s), ${gb(result.movedBytes)} (saved before ${result.cutoff.slice(0, 10)})`)
    for (const m of result.moved) {
        console.log(`  ${m.key}  ${gb(m.bytes)}  lessons: ${m.lessonIds.length}  link: ${m.link ? 'yes' : apply ? 'NONE' : 'new'}`)
    }
    if (result.finished.length) console.log(`R2 files of earlier moves ${apply ? 'deleted' : 'to delete'}: ${result.finished.length}`)
    if (result.queued.length) console.log(`Queued for a Dropbox copy (move on a later run): ${result.queued.map(q => q.key).join(', ')}`)
    if (result.kept.length) {
        console.log(`Kept on R2 (${result.kept.length}):`)
        for (const k of result.kept) console.log(`  ${k.problem ? 'PROBLEM ' : ''}${k.key}  ${k.bytes === null ? '?' : gb(k.bytes)}  ${k.reason}`)
    }
    if (apply) console.log(`\n${RECORDINGS_BUCKET}: ${gb(await size())} after`)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
