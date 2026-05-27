/**
 * cleanup_root_recordings.ts
 *
 * Scans the TOP LEVEL of /Lesson Recordings/ for any VIDEO FILES (not folders)
 * sitting loose there and moves them into the correct student subfolder.
 *
 * Usage:
 *   npx tsx scripts/cleanup_root_recordings.ts           # dry-run (safe)
 *   npx tsx scripts/cleanup_root_recordings.ts --execute # actually move files
 */

import { Dropbox } from 'dropbox'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const refreshToken = process.env.DROPBOX_REFRESH_TOKEN
const clientId = process.env.DROPBOX_CLIENT_ID
const clientSecret = process.env.DROPBOX_CLIENT_SECRET
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!refreshToken || !clientId || !clientSecret || !supabaseUrl || !serviceKey) {
    console.error('Missing Dropbox or Supabase credentials in .env.local')
    process.exit(1)
}

const dbx = new Dropbox({ clientId, clientSecret, refreshToken })
const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

const ROOT = '/Lesson Recordings'
const DRY_RUN = !process.argv.includes('--execute')

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.avi', '.mkv']

// ─── Name Parsing ───────────────────────────────────────────────────────────
// Try to extract a YYYY-MM-DD date from Zoom-style filenames:
//   "2026-05-24 12.30.30 Waris Matharu's Piano Lesson 12345.mp4"
//   "GMT20260524-153000_Recording.mp4"
//   "2026_05_24 Waris.mp4"

function parseDateFromFilename(name: string): string | null {
    // ISO date: 2026-05-24 or 2026_05_24
    const isoMatch = name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/)
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

    // GMT prefix: GMT20260524-153000
    const gmtMatch = name.match(/GMT(\d{4})(\d{2})(\d{2})/)
    if (gmtMatch) return `${gmtMatch[1]}-${gmtMatch[2]}-${gmtMatch[3]}`

    return null
}

// ─── Student Name Matching ───────────────────────────────────────────────────
// Returns the destination subfolder name if we can identify the student from
// the filename (or the date alone as fallback for unambiguous cases).

function matchStudentFolder(
    filename: string,
    studentFolders: Record<string, string>
): { folder: string; matchedKey: string } | null {
    const lower = filename.toLowerCase()

    // Sort by key length descending to match the most specific name first
    const keys = Object.keys(studentFolders).sort((a, b) => b.length - a.length)

    for (const key of keys) {
        if (lower.includes(key.toLowerCase())) {
            return { folder: studentFolders[key], matchedKey: key }
        }
    }
    return null
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n📁  Dropbox Root Cleanup (DRY_RUN=${DRY_RUN})\n`)

    // 1. Fetch student profile → folder mappings from Supabase
    console.log('Fetching student profiles from Supabase...')
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, dropbox_recording_folder')
        .eq('role', 'student')

    if (profilesError || !profiles) {
        console.error('Failed to fetch student profiles:', profilesError)
        process.exit(1)
    }

    // Build name → folder map (lowercase keys for case-insensitive matching)
    const studentFolders: Record<string, string> = {}
    for (const p of profiles) {
        if (p.name && p.dropbox_recording_folder) {
            studentFolders[p.name.toLowerCase().trim()] = p.dropbox_recording_folder
        }
    }

    // Merge any known manual aliases
    const aliases: Record<string, string> = {
        'jose piano teacher': 'My Own Piano Lessons',
        'piano student': 'My Own Piano Lessons',
        'olga piano teacher': 'My Own Piano Lessons',
        'micah finn': 'Micah Finn Lesson Recordings',
        'waris matharu': 'Waris Matharu Recordings',
        'ila daigle': 'Ila and Cordelia Recordings',
        'ila and cordelia': 'Ila and Cordelia Recordings',
        'oceanna chan': 'Oceanna Chan Recordings',
        'yakir shimon': 'Yakir Shimon Lesson Recordings',
        'nate mahon': 'Nate Mahon Recordings',
        'edwin guo': 'Edwin Guo Recordings',
        'robert alconcel': 'Robert Alconcel Recordings',
        'padhma berk': 'Padhma Berk Recordings',
        'mohammed habbab': 'Mohammed Habbab',
    }
    Object.assign(studentFolders, aliases)

    console.log(`Loaded ${Object.keys(studentFolders).length} student mappings.\n`)

    // 2. List root entries of /Lesson Recordings/
    console.log(`Listing files in "${ROOT}"...`)
    let rootEntries
    try {
        const res = await dbx.filesListFolder({ path: ROOT })
        rootEntries = res.result.entries
    } catch (err: any) {
        console.error('Failed to list root folder:', err?.error?.error_summary || err?.message)
        process.exit(1)
    }

    // We only care about FILES (not subfolders) with video extensions
    const rootFiles = rootEntries.filter(e => {
        if (e['.tag'] !== 'file') return false
        const lower = e.name.toLowerCase()
        return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext))
    })

    console.log(`Found ${rootFiles.length} loose video file(s) in root.\n`)

    if (rootFiles.length === 0) {
        console.log('✅  Root is already clean — nothing to move.')
        return
    }

    // 3. Plan moves
    const moves: { from: string; to: string; reason: string }[] = []
    const skipped: { file: string; reason: string }[] = []

    for (const file of rootFiles) {
        const srcPath = (file as any).path_display || (file as any).path_lower
        const filename = file.name

        // Parse date from filename
        const date = parseDateFromFilename(filename) || 'unknown-date'

        // Match student
        const match = matchStudentFolder(filename, studentFolders)

        if (!match) {
            skipped.push({ file: filename, reason: 'No student name matched in filename' })
            continue
        }

        // Build destination: /Lesson Recordings/<StudentFolder>/<date> - Lesson.mp4
        const ext = filename.slice(filename.lastIndexOf('.'))
        const destPath = `${ROOT}/${match.folder}/${date} - Lesson${ext}`

        moves.push({
            from: srcPath,
            to: destPath,
            reason: `Matched student: "${match.matchedKey}" → ${match.folder}`,
        })
    }

    // 4. Print plan
    console.log('══════════════════════════════════════════════════════')
    console.log(`PLANNED MOVES: ${moves.length}`)
    console.log('══════════════════════════════════════════════════════')
    for (const m of moves) {
        console.log(`\n  REASON: ${m.reason}`)
        console.log(`    FROM: ${m.from}`)
        console.log(`      TO: ${m.to}`)
    }

    if (skipped.length > 0) {
        console.log(`\n══════════════════════════════════════════════════════`)
        console.log(`SKIPPED: ${skipped.length}`)
        console.log('══════════════════════════════════════════════════════')
        for (const s of skipped) {
            console.log(`  [SKIP] ${s.file}`)
            console.log(`         Reason: ${s.reason}`)
        }
    }

    console.log('\n══════════════════════════════════════════════════════\n')

    if (DRY_RUN) {
        console.log('🔍  DRY RUN complete. No files were moved.')
        console.log('    To execute, run:  npx tsx scripts/cleanup_root_recordings.ts --execute\n')
        return
    }

    // 5. Execute moves
    console.log('🚚  Executing moves...\n')
    let success = 0
    let failed = 0

    for (const m of moves) {
        try {
            console.log(`Moving: "${m.from}"`)
            console.log(`    → "${m.to}"`)
            await dbx.filesMoveV2({
                from_path: m.from,
                to_path: m.to,
                autorename: true,
                allow_shared_folder: true,
            })
            console.log('    ✅  Done\n')
            success++
        } catch (err: any) {
            const msg = err?.error?.error_summary || err?.message || String(err)
            console.error(`    ❌  FAILED: ${msg}\n`)
            failed++
        }
    }

    console.log(`\n🏁  Cleanup complete. Success: ${success} | Failed: ${failed}`)
}

main().catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
})
