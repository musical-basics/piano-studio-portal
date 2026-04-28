import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

// Duplicates I inserted earlier — already exist as 2025-12-25 entries.
const DUPLICATE_IDS = [
    'cd7c00f9-b1b1-4c68-a51f-4265ec5c832e', // Zoe W. (existing entry "Zou W." stays)
    'f9f0d532-fb4b-4510-8516-ca49e1e85141', // Yakir S.
    'a879c233-7cf3-4ee7-9979-3d7434c9aee6', // Padhma B.
]

// Tenure backfill for the 5 net-new reviews.
const STUDENT_SINCE: Record<string, number> = {
    '783b7b3c-5c9c-46f8-ba4f-9ff20da11b4e': 2023, // Susan C.
    'f935242f-dc41-4c5e-85a7-1c85ab447e64': 2023, // Bai V.
    '83d237c3-cd38-4e6c-9fa6-4f3bac416f58': 2023, // Jason B.
    '12c9a7cd-0cda-423f-a542-62748ae24697': 2024, // Xu Y. (parent — kids started 2024)
    'df938b4b-9c8f-434e-b166-4c8aaeed3301': 2025, // Jay W.
}

async function main() {
    const { error: delErr, count } = await supabase
        .from('reviews')
        .delete({ count: 'exact' })
        .in('id', DUPLICATE_IDS)
    if (delErr) {
        console.error('Delete failed:', delErr)
        process.exit(1)
    }
    console.log(`Deleted ${count ?? 0} duplicate reviews.`)

    for (const [id, year] of Object.entries(STUDENT_SINCE)) {
        const { error, data } = await supabase
            .from('reviews')
            .update({ student_since: year })
            .eq('id', id)
            .select('name, student_since')
            .single()
        if (error) {
            console.error(`Update failed for ${id}:`, error)
            process.exit(1)
        }
        console.log(`  ${data.name} → student_since=${data.student_since}`)
    }

    const { data: final } = await supabase
        .from('reviews')
        .select('name, status, student_since, student_id, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
    console.log('\nFINAL APPROVED REVIEWS:')
    final?.forEach((r) =>
        console.log(`  ${r.created_at.slice(0, 10)} | since=${r.student_since ?? '-'} | sid=${r.student_id ?? '-'} | ${r.name}`)
    )
}

main()
