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
        .select('name, featured, tenure_label')
        .eq('status', 'approved')
        .eq('featured', true)
    if (error) {
        console.error(error)
        process.exit(1)
    }
    console.log(`Featured (${data?.length}):`)
    data?.forEach((r) => console.log(`  ${r.tenure_label ?? '(no label)'} | ${r.name}`))
}

main()
