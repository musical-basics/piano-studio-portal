// Run the ZBackup -> per-student-folder organizer immediately (same logic the
// cron uses). Moves files and attaches them to lessons. Use to clear a backlog.
// Usage: npx tsx scripts/organize_recordings.ts [limit]
import { config } from 'dotenv'
config({ path: '.env.local' })
import { organizeZBackupRecordings } from '../lib/organize-recordings'

async function run() {
    const limit = process.argv[2] ? Number(process.argv[2]) : undefined
    const result = await organizeZBackupRecordings({ limit, log: (m) => console.log(m) })
    console.log('\n=== SUMMARY ===')
    console.log(`scanned=${result.scanned} moved=${result.moved.length} skipped=${result.skipped.length} errors=${result.errors.length}`)
    console.log(JSON.stringify(result, null, 2))
}
run().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1) })
