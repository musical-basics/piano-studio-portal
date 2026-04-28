import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
    const ids = [
        '2747fbbf-f97a-47d3-a6aa-7a9f163bb3e2', // existing Padhma B.
        'fd737234-4e33-44e3-800b-9f0e6041caf5', // existing Zou W.
        'cad01304-b603-44b5-abe6-009e95db718b', // existing Yakir S.
    ]
    const { data } = await supabase.from('reviews').select('id, name, text, created_at').in('id', ids)
    data?.forEach((r) => {
        console.log(`\n=== ${r.name} (${r.created_at}) [${r.id}] ===`)
        console.log(r.text)
    })
}

main()
