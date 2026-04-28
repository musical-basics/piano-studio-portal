import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
    const { data: shared } = await supabase
        .from('profiles')
        .select('id, name, email, role, status, created_at')
        .eq('id', 'e96d34d9-5cc9-43a8-81c2-9545d1b11508')
        .single()
    console.log('SHARED testimonial profile:', shared)

    const { data: robert } = await supabase
        .from('profiles')
        .select('id, name, email, role, status, created_at')
        .eq('id', '5d9ce59d-87c2-4e34-bc95-cff3f5ca08bf')
        .single()
    console.log('ROBERT profile:', robert)

    const reviewerFirstNames = ['Zoe', 'Yakir', 'Padhma', 'Bai', 'Xu', 'Jay', 'Jason', 'Susan']
    console.log('\nNAME MATCHES:')
    for (const fn of reviewerFirstNames) {
        const { data } = await supabase
            .from('profiles')
            .select('id, name, email, role, status, created_at')
            .ilike('name', `%${fn}%`)
        if (!data?.length) {
            console.log(`  ${fn}: no match`)
            continue
        }
        data.forEach((p) =>
            console.log(`  ${fn}: ${p.name} | role=${p.role} | status=${p.status} | created=${p.created_at} | ${p.id}`)
        )
    }
}

main()
