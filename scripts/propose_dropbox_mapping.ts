import { Dropbox } from 'dropbox'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { writeFileSync } from 'fs'
import { join } from 'path'

config({ path: '.env.local' })

const refreshToken = process.env.DROPBOX_REFRESH_TOKEN
const clientId = process.env.DROPBOX_CLIENT_ID
const clientSecret = process.env.DROPBOX_CLIENT_SECRET
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!refreshToken || !clientId || !clientSecret) {
    console.error('Missing Dropbox credentials in .env.local')
    process.exit(1)
}
if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
}

const dbx = new Dropbox({ clientId, clientSecret, refreshToken })
const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

const ROOT = '/Lesson Recordings'
const OUT_FILE = join(process.cwd(), 'scripts', 'dropbox_folder_mapping.json')

type Proposal = {
    profile_id: string
    profile_name: string
    profile_email: string | null
    proposed_folder: string | null
    confidence: 'high' | 'medium' | 'low' | 'none'
    candidates: string[]
    note?: string
}

function tokenize(s: string): string[] {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2)
}

function scoreMatch(profileName: string, folderName: string): number {
    const profileTokens = new Set(tokenize(profileName))
    const folderTokens = tokenize(folderName)
    const ignored = new Set(['recordings', 'recording', 'lesson', 'lessons'])

    let hits = 0
    let folderTokensConsidered = 0
    for (const t of folderTokens) {
        if (ignored.has(t)) continue
        folderTokensConsidered++
        if (profileTokens.has(t)) hits++
    }
    if (folderTokensConsidered === 0) return 0
    const folderCoverage = hits / folderTokensConsidered

    let profileHits = 0
    for (const t of profileTokens) {
        if (folderTokens.includes(t)) profileHits++
    }
    const profileCoverage = profileTokens.size === 0 ? 0 : profileHits / profileTokens.size

    return (folderCoverage + profileCoverage) / 2
}

async function main() {
    console.log('Fetching profiles from Supabase...')
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, status')
        .eq('role', 'student')
        .order('name', { ascending: true })

    if (error) {
        console.error('Supabase error:', error)
        process.exit(1)
    }
    console.log(`Got ${profiles?.length ?? 0} student profiles.\n`)

    console.log(`Listing "${ROOT}" from Dropbox...`)
    const list = await dbx.filesListFolder({ path: ROOT })
    const folders = list.result.entries
        .filter(e => e['.tag'] === 'folder')
        .map(e => e.name)
    console.log(`Got ${folders.length} folders.\n`)

    const proposals: Proposal[] = []
    const usedFolders = new Set<string>()

    for (const p of profiles ?? []) {
        if (!p.name) {
            proposals.push({
                profile_id: p.id,
                profile_name: '(no name)',
                profile_email: p.email,
                proposed_folder: null,
                confidence: 'none',
                candidates: [],
                note: 'Profile has no name'
            })
            continue
        }

        const scored = folders
            .map(f => ({ folder: f, score: scoreMatch(p.name!, f) }))
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)

        const top = scored[0]
        const second = scored[1]
        const candidates = scored.slice(0, 3).map(s => `${s.folder} (${s.score.toFixed(2)})`)

        let confidence: Proposal['confidence']
        let proposed: string | null

        if (!top) {
            confidence = 'none'
            proposed = null
        } else if (top.score >= 0.7 && (!second || top.score - second.score >= 0.2)) {
            confidence = 'high'
            proposed = top.folder
        } else if (top.score >= 0.4) {
            confidence = 'medium'
            proposed = top.folder
        } else {
            confidence = 'low'
            proposed = top.folder
        }

        if (proposed) usedFolders.add(proposed)

        proposals.push({
            profile_id: p.id,
            profile_name: p.name,
            profile_email: p.email,
            proposed_folder: proposed,
            confidence,
            candidates,
            note: p.status === 'inactive' ? 'inactive student' : undefined
        })
    }

    const unmatchedFolders = folders.filter(f => !usedFolders.has(f))

    console.log('='.repeat(80))
    console.log('PROPOSED MAPPINGS')
    console.log('='.repeat(80))
    console.log()

    const byConfidence = (c: Proposal['confidence']) => proposals.filter(p => p.confidence === c)

    for (const c of ['high', 'medium', 'low', 'none'] as const) {
        const group = byConfidence(c)
        if (group.length === 0) continue
        console.log(`--- ${c.toUpperCase()} CONFIDENCE (${group.length}) ---`)
        for (const p of group) {
            const name = p.profile_name.padEnd(28)
            const folder = p.proposed_folder ?? '(no folder found)'
            const note = p.note ? ` [${p.note}]` : ''
            console.log(`  ${name} -> ${folder}${note}`)
            if (c !== 'high' && p.candidates.length > 0) {
                console.log(`    candidates: ${p.candidates.join(', ')}`)
            }
        }
        console.log()
    }

    console.log(`--- DROPBOX FOLDERS NOT MATCHED TO ANY PROFILE (${unmatchedFolders.length}) ---`)
    for (const f of unmatchedFolders) console.log(`  ${f}`)
    console.log()

    writeFileSync(OUT_FILE, JSON.stringify({ proposals, unmatchedFolders }, null, 2))
    console.log(`Wrote ${OUT_FILE}`)
    console.log()
    console.log('Next: review the file. For any wrong / missing mappings, edit the')
    console.log('"proposed_folder" field. Set to null to skip a profile. When ready,')
    console.log('run the apply step (TBD).')
}

main().catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
})
