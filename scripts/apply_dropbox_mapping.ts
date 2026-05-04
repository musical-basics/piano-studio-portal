import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { join } from 'path'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

const MAPPING_FILE = join(process.cwd(), 'scripts', 'dropbox_folder_mapping.final.json')

type FinalEntry = {
    profile_id: string
    profile_name: string
    profile_email: string | null
    profile_status: 'active' | 'inactive' | null
    folder: string | null
    reason: string
}

async function main() {
    const apply = process.argv.includes('--apply')

    console.log(`Reading ${MAPPING_FILE}`)
    const raw = readFileSync(MAPPING_FILE, 'utf-8')
    const { final } = JSON.parse(raw) as { final: FinalEntry[] }
    console.log(`  ${final.length} entries to apply\n`)

    // Sanity: confirm the column exists by reading one row
    const probeId = final[0]?.profile_id
    if (!probeId) {
        console.error('Empty mapping file')
        process.exit(1)
    }

    const probe = await supabase
        .from('profiles')
        .select('id, name, dropbox_recording_folder')
        .eq('id', probeId)
        .single()

    if (probe.error) {
        console.error('Failed to read dropbox_recording_folder column. Did the migration run?')
        console.error(probe.error.message)
        process.exit(1)
    }
    console.log('Column exists. Current sample:', probe.data)
    console.log()

    // Fetch current values for all mapped profile IDs
    const ids = final.map(e => e.profile_id)
    const { data: current, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, name, dropbox_recording_folder')
        .in('id', ids)
    if (fetchErr) {
        console.error('Fetch error:', fetchErr)
        process.exit(1)
    }
    const currentMap = new Map((current ?? []).map(r => [r.id, r as { id: string, name: string | null, dropbox_recording_folder: string | null }]))

    // Plan
    type Plan = { entry: FinalEntry, currentValue: string | null, action: 'noop' | 'update' }
    const plans: Plan[] = final.map(e => {
        const c = currentMap.get(e.profile_id)
        const currentValue = c?.dropbox_recording_folder ?? null
        const action = currentValue === e.folder ? 'noop' : 'update'
        return { entry: e, currentValue, action }
    })

    const updates = plans.filter(p => p.action === 'update')
    const noops = plans.filter(p => p.action === 'noop')

    console.log(`Plan: ${updates.length} updates, ${noops.length} no-ops\n`)

    if (updates.length > 0) {
        console.log('--- UPDATES ---')
        for (const p of updates) {
            const name = p.entry.profile_name.padEnd(28)
            const before = (p.currentValue ?? '(null)').padEnd(32)
            const after = p.entry.folder ?? '(null)'
            console.log(`  ${name} ${before} -> ${after}`)
        }
        console.log()
    }

    if (!apply) {
        console.log('DRY RUN. Re-run with --apply to write to the database.')
        return
    }

    console.log('Applying updates...')
    let success = 0
    const errors: { id: string, name: string, error: string }[] = []

    for (const p of updates) {
        const { error } = await supabase
            .from('profiles')
            .update({ dropbox_recording_folder: p.entry.folder })
            .eq('id', p.entry.profile_id)

        if (error) {
            errors.push({ id: p.entry.profile_id, name: p.entry.profile_name, error: error.message })
        } else {
            success++
        }
    }

    console.log(`\nDone. ${success} updated, ${errors.length} errored.`)
    if (errors.length) {
        console.log('\nErrors:')
        for (const e of errors) console.log(`  ${e.name} (${e.id}): ${e.error}`)
        process.exit(1)
    }
}

main().catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
})
