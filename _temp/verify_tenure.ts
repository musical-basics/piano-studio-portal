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
        .select('name, student_since, student_until, status')
        .eq('status', 'approved')
        .order('student_since', { ascending: true, nullsFirst: false })
    if (error) {
        console.error(error)
        process.exit(1)
    }
    data?.forEach((r) =>
        console.log(`  since=${r.student_since ?? '-'} | until=${r.student_until ?? '-'} | ${r.name}`)
    )
}

main()
