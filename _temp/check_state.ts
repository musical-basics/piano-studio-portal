import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
    const { data, error } = await supabase
        .from('reviews')
        .select('id, name, tenure_label, status')
        .eq('status', 'approved')
    if (error) {
        console.error('Likely missing column. Error:', error.message)
        return
    }
    data?.forEach((r) => console.log(`  ${r.tenure_label ?? '(null)'} | ${r.name} | ${r.id}`))
}

main()
