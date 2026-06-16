// Run the recording backfill immediately from the CLI (same logic the cron uses).
// Usage: npx tsx scripts/backfill_recordings.ts [fromDate yyyy-mm-dd] [limit]
import { config } from 'dotenv'
config({ path: '.env.local' })
import { backfillMissingRecordings } from '../lib/backfill-recordings'

async function run() {
    const fromDate = process.argv[2]
    const limit = process.argv[3] ? Number(process.argv[3]) : undefined
    const result = await backfillMissingRecordings({ fromDate, limit, log: (m) => console.log(m) })
    console.log('\n=== SUMMARY ===')
    console.log(JSON.stringify(result, null, 2))
}
run().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1) })
