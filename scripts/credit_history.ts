// Read the credit_transactions ledger.
// Usage:
//   npx tsx scripts/credit_history.ts                  # 50 most recent changes
//   npx tsx scripts/credit_history.ts <student name>   # one student's history
//   npx tsx scripts/credit_history.ts --since 2026-06-17  # changes since a date
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

async function run() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const args = process.argv.slice(2)
  const sinceIdx = args.indexOf('--since')
  const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null
  const nameArg = args.filter((a, i) => a !== '--since' && i !== sinceIdx + 1).join(' ').trim()

  let studentId: string | null = null
  if (nameArg) {
    const { data: p } = await s.from('profiles').select('id, name').ilike('name', `%${nameArg}%`).limit(1).single()
    if (!p) { console.log(`No student matching "${nameArg}"`); return }
    studentId = (p as any).id
    console.log(`History for ${(p as any).name}:`)
  }

  let q = s.from('credit_transactions')
    .select('changed_at, previous_credits, new_credits, delta, source, note, student_id')
    .order('changed_at', { ascending: false })
    .limit(50)
  if (studentId) q = q.eq('student_id', studentId)
  if (since) q = q.gte('changed_at', since)
  const { data, error } = await q
  if (error) { console.error('Query failed (is the migration applied?):', error.message); return }

  const ids = [...new Set((data || []).map((r: any) => r.student_id))]
  const { data: profs } = await s.from('profiles').select('id, name').in('id', ids)
  const nm = new Map((profs || []).map((p: any) => [p.id, p.name]))
  for (const r of (data || []) as any[]) {
    const sign = r.delta > 0 ? `+${r.delta}` : `${r.delta}`
    console.log(`  ${r.changed_at}  ${nm.get(r.student_id) || r.student_id}  ${r.previous_credits} -> ${r.new_credits} (${sign})${r.source ? `  [${r.source}]` : ''}`)
  }
  console.log(`\n${data?.length ?? 0} row(s).`)
}
run().catch(e => { console.error(e); process.exit(1) })
