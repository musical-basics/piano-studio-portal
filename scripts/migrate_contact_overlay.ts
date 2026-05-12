/**
 * One-off: migrate the three known Commander contact-routing overlay values
 * into the new first-class profiles columns added in migration
 * 20260511000000_profiles_contact_routing.sql.
 *
 * Idempotent — safe to re-run; matches students by name and only writes the
 * specific contact-routing fields.
 *
 * Run:
 *   pnpm tsx scripts/migrate_contact_overlay.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})

type Patch = {
    matchName: string
    description: string
    update: {
        preferred_name?: string | null
        parent_contact_name?: string | null
        contact_salutation?: string | null
        primary_contact_role?: 'student' | 'parent' | null
    }
}

const PATCHES: Patch[] = [
    {
        matchName: 'Robert Alconcel',
        description: 'Address Robert as "Rob"',
        update: {
            preferred_name: 'Rob',
            contact_salutation: 'Rob',
            primary_contact_role: 'student',
        },
    },
    {
        matchName: 'Edwin Guo',
        description: 'Route Edwin\'s comms to parent/contact Zou',
        update: {
            parent_contact_name: 'Zou',
            contact_salutation: 'Zou',
            primary_contact_role: 'parent',
        },
    },
    {
        matchName: 'Ila Daigle',
        description: 'Route Ila\'s comms to parent/contact Amanda',
        update: {
            parent_contact_name: 'Amanda',
            contact_salutation: 'Amanda',
            primary_contact_role: 'parent',
        },
    },
]

async function main() {
    for (const patch of PATCHES) {
        const { data: matches, error: findErr } = await supabase
            .from('profiles')
            .select(
                'id, name, preferred_name, parent_contact_name, contact_salutation, primary_contact_role',
            )
            .eq('role', 'student')
            .ilike('name', patch.matchName)

        if (findErr) {
            console.error(`[${patch.matchName}] lookup failed:`, findErr.message)
            continue
        }
        if (!matches || matches.length === 0) {
            console.warn(`[${patch.matchName}] no student found`)
            continue
        }
        if (matches.length > 1) {
            console.warn(
                `[${patch.matchName}] multiple matches (${matches.length}); skipping for safety:`,
                matches.map((m) => `${m.id}=${m.name}`).join(', '),
            )
            continue
        }

        const student = matches[0]
        console.log(`\n[${patch.matchName}] ${patch.description}`)
        console.log('  id:', student.id)
        console.log('  before:', {
            preferred_name: (student as any).preferred_name,
            parent_contact_name: (student as any).parent_contact_name,
            contact_salutation: (student as any).contact_salutation,
            primary_contact_role: (student as any).primary_contact_role,
        })

        const { data: updated, error: updErr } = await supabase
            .from('profiles')
            .update({
                ...patch.update,
                updated_at: new Date().toISOString(),
            })
            .eq('id', student.id)
            .eq('role', 'student')
            .select(
                'id, name, preferred_name, parent_contact_name, contact_salutation, primary_contact_role',
            )
            .single()

        if (updErr) {
            console.error('  UPDATE failed:', updErr.message)
            continue
        }
        console.log('  after: ', {
            preferred_name: (updated as any).preferred_name,
            parent_contact_name: (updated as any).parent_contact_name,
            contact_salutation: (updated as any).contact_salutation,
            primary_contact_role: (updated as any).primary_contact_role,
        })
    }
    console.log('\nDone.')
}

main().catch((err) => {
    console.error('Unexpected error:', err)
    process.exit(1)
})
