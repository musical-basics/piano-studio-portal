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
const INACTIVE_FOLDER = 'Old Students Recordings'
const OWN_LESSONS_FOLDER = 'My Own Piano Lessons'
const NEW_FOLDERS_TO_CREATE = ['Robert Alconcel Recordings']
const OUT_FILE = join(process.cwd(), 'scripts', 'dropbox_folder_mapping.final.json')

// Profiles whose recordings should route to "My Own Piano Lessons"
// (Lionel's lessons WITH his teachers, recorded under different profile names).
const OWN_LESSONS_PROFILE_NAMES = new Set([
    'Jose Piano Teacher',
    'Olga Piano Teacher',
    'Piano Student',
])

// Manual overrides for active-student profile names that don't fuzzy-match cleanly,
// or that we just want to lock in deterministically.
const NAME_TO_FOLDER_OVERRIDES: Record<string, string> = {
    'Robert Alconcel': 'Robert Alconcel Recordings',
}

type FinalEntry = {
    profile_id: string
    profile_name: string
    profile_email: string | null
    profile_status: 'active' | 'inactive' | null
    folder: string | null
    reason: string
}

async function ensureFolder(name: string): Promise<'created' | 'exists'> {
    const path = `${ROOT}/${name}`
    try {
        await dbx.filesGetMetadata({ path })
        return 'exists'
    } catch (err: any) {
        const summary = err?.error?.error_summary || ''
        if (!summary.startsWith('path/not_found')) throw err
    }
    await dbx.filesCreateFolderV2({ path, autorename: false })
    return 'created'
}

async function main() {
    console.log('Step 1: Ensure required folders exist in Dropbox')
    for (const name of NEW_FOLDERS_TO_CREATE) {
        const result = await ensureFolder(name)
        console.log(`  /${ROOT.replace(/^\//, '')}/${name} -> ${result}`)
    }
    const inactiveResult = await ensureFolder(INACTIVE_FOLDER)
    console.log(`  /${ROOT.replace(/^\//, '')}/${INACTIVE_FOLDER} -> ${inactiveResult} (sanity check)`)
    console.log()

    console.log('Step 2: Fetch profiles + list folders')
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, status')
        .eq('role', 'student')
        .order('name', { ascending: true })
    if (error) {
        console.error('Supabase error:', error)
        process.exit(1)
    }

    const list = await dbx.filesListFolder({ path: ROOT })
    const existingFolders = new Set(
        list.result.entries.filter(e => e['.tag'] === 'folder').map(e => e.name)
    )

    console.log(`  ${profiles?.length ?? 0} student profiles, ${existingFolders.size} folders\n`)

    console.log('Step 3: Build final mapping')

    const tokenize = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2)
    const ignored = new Set(['recordings', 'recording', 'lesson', 'lessons'])

    const fuzzyMatch = (profileName: string): string | null => {
        const profileTokens = new Set(tokenize(profileName))
        let best: { folder: string, score: number } | null = null
        let runnerUp: number = 0

        for (const folder of existingFolders) {
            const folderTokens = tokenize(folder)
            let hits = 0
            let considered = 0
            for (const t of folderTokens) {
                if (ignored.has(t)) continue
                considered++
                if (profileTokens.has(t)) hits++
            }
            if (considered === 0) continue
            const folderCoverage = hits / considered
            let profileHits = 0
            for (const t of profileTokens) if (folderTokens.includes(t)) profileHits++
            const profileCoverage = profileTokens.size === 0 ? 0 : profileHits / profileTokens.size
            const score = (folderCoverage + profileCoverage) / 2

            if (!best || score > best.score) {
                runnerUp = best?.score ?? 0
                best = { folder, score }
            } else if (score > runnerUp) {
                runnerUp = score
            }
        }

        if (!best) return null
        if (best.score >= 0.7 && best.score - runnerUp >= 0.2) return best.folder
        return null
    }

    const final: FinalEntry[] = []

    for (const p of profiles ?? []) {
        if (!p.name) {
            final.push({
                profile_id: p.id,
                profile_name: '(no name)',
                profile_email: p.email,
                profile_status: p.status,
                folder: null,
                reason: 'no name on profile'
            })
            continue
        }

        // Rule 1: explicit "own lessons" profiles → My Own Piano Lessons
        if (OWN_LESSONS_PROFILE_NAMES.has(p.name)) {
            final.push({
                profile_id: p.id,
                profile_name: p.name,
                profile_email: p.email,
                profile_status: p.status,
                folder: OWN_LESSONS_FOLDER,
                reason: 'Lionel\'s own lessons (mapped to shared bucket)'
            })
            continue
        }

        // Rule 2: explicit name-based override
        if (NAME_TO_FOLDER_OVERRIDES[p.name]) {
            const f = NAME_TO_FOLDER_OVERRIDES[p.name]
            final.push({
                profile_id: p.id,
                profile_name: p.name,
                profile_email: p.email,
                profile_status: p.status,
                folder: f,
                reason: existingFolders.has(f) ? 'manual override (folder exists)' : 'manual override (folder missing!)'
            })
            continue
        }

        // Rule 3: inactive students → shared inactive bucket, regardless of fuzzy match
        if (p.status === 'inactive') {
            final.push({
                profile_id: p.id,
                profile_name: p.name,
                profile_email: p.email,
                profile_status: p.status,
                folder: INACTIVE_FOLDER,
                reason: 'inactive student'
            })
            continue
        }

        // Rule 4: active student → high-confidence fuzzy match
        const matched = fuzzyMatch(p.name)
        if (matched) {
            final.push({
                profile_id: p.id,
                profile_name: p.name,
                profile_email: p.email,
                profile_status: p.status,
                folder: matched,
                reason: 'fuzzy-matched existing folder'
            })
            continue
        }

        // Rule 5: nothing matched
        final.push({
            profile_id: p.id,
            profile_name: p.name,
            profile_email: p.email,
            profile_status: p.status,
            folder: null,
            reason: 'no folder match'
        })
    }

    console.log('Step 4: Print final mapping\n')
    console.log('='.repeat(80))
    for (const entry of final) {
        const name = entry.profile_name.padEnd(28)
        const status = (entry.profile_status ?? '').padEnd(8)
        const folder = entry.folder ?? '(skip)'
        console.log(`  [${status}] ${name} -> ${folder}`)
        console.log(`              reason: ${entry.reason}`)
    }
    console.log()

    // Sanity warnings
    const missingFolders = final.filter(e => e.folder && !existingFolders.has(e.folder))
    if (missingFolders.length) {
        console.log('WARNING: the following entries map to folders not currently in Dropbox:')
        for (const m of missingFolders) {
            console.log(`  ${m.profile_name} -> ${m.folder}`)
        }
        console.log()
    }

    writeFileSync(OUT_FILE, JSON.stringify({ final }, null, 2))
    console.log(`Wrote ${OUT_FILE}`)
    console.log()
    console.log('No DB writes have been performed. Review the mapping above; when ready,')
    console.log('the next step is the apply script.')
}

main().catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
})
