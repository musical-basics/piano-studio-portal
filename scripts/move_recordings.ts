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

const SOURCE_DIR = '/Apps/ZBackup-App/lionel@musicalbasics.com'
const DEST_ROOT = '/Lesson Recordings'

const DRY_RUN = process.argv.includes('--execute') ? false : true

async function main() {
    console.log(`Dropbox Clean-up Script (Dry Run: ${DRY_RUN})\n`)

    // 1. Fetch student profiles and their mapped dropbox folders
    console.log('Fetching student profiles from Supabase...')
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, dropbox_recording_folder')
        .eq('role', 'student')
    
    if (error || !profiles) {
        console.error('Failed to fetch student profiles:', error)
        process.exit(1)
    }

    console.log(`Found ${profiles.length} student profiles.`)

    // 2. Create helper mappings
    const studentFolders: Record<string, string> = {}
    for (const p of profiles) {
        if (p.name && p.dropbox_recording_folder) {
            studentFolders[p.name.toLowerCase().trim()] = p.dropbox_recording_folder
        }
    }

    // Manual overrides or additions
    const manualMappings: Record<string, string> = {
        'jose piano teacher': 'My Own Piano Lessons',
        'piano student': 'My Own Piano Lessons',
        'olga piano teacher': 'My Own Piano Lessons',
        'micah finn': 'Micah Finn Lesson Recordings',
        'waris matharu': 'Waris Matharu Recordings',
        'ila daigle': 'Ila and Cordelia Recordings',
        'ila and cordelia': 'Ila and Cordelia Recordings',
        'ila and cordelia daigle': 'Ila and Cordelia Recordings',
        'oceanna chan': 'Oceanna Chan Recordings',
        'yakir shimon': 'Yakir Shimon Lesson Recordings',
        'nate mahon': 'Nate Mahon Recordings',
        'edwin guo': 'Edwin Guo Recordings',
        'robert alconcel': 'Robert Alconcel Recordings',
        'padhma berk': 'Padhma Berk Recordings',
    }

    // 3. List entries in source directory
    console.log(`Listing folders in "${SOURCE_DIR}"...`)
    const response = await dbx.filesListFolder({ path: SOURCE_DIR })
    const folders = response.result.entries.filter(e => e['.tag'] === 'folder')
    console.log(`Found ${folders.length} folders in backup directory.\n`)

    const moves: { from: string; to: string; reason: string }[] = []

    for (const folder of folders) {
        const folderName = folder.name
        
        // Parse date and student name from folder name
        // Example: "2026_05_25T12-15 Waris Matharu _ Piano Lesson"
        // Date part: "2026_05_25" -> "2026-05-25"
        const dateMatch = folderName.match(/^(\d{4})_(\d{2})_(\d{2})/)
        if (!dateMatch) {
            console.log(`[SKIP] Could not parse date from folder: "${folderName}"`)
            continue
        }
        
        const formattedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`

        // Match against manual mappings or student profile names by checking substring presence
        let destFolder: string | null = null
        let matchedName = ''
        const folderNameLower = folderName.toLowerCase()

        // 1. Sort keys by length descending to match most specific name first (prevent partial overlap issues)
        const sortedManualKeys = Object.keys(manualMappings).sort((a, b) => b.length - a.length)
        for (const key of sortedManualKeys) {
            if (folderNameLower.includes(key)) {
                destFolder = manualMappings[key]
                matchedName = key
                break
            }
        }

        // 2. Try database student profile names
        if (!destFolder) {
            const sortedProfileNames = Object.keys(studentFolders).sort((a, b) => b.length - a.length)
            for (const name of sortedProfileNames) {
                if (folderNameLower.includes(name)) {
                    destFolder = studentFolders[name]
                    matchedName = name
                    break
                }
            }
        }

        if (!destFolder) {
            console.log(`[SKIP] No mapped Dropbox folder found for name in: "${folderName}"`)
            continue
        }

        // Search for primary mp4 in this subfolder
        try {
            const subList = await dbx.filesListFolder({ path: folder.path_lower! })
            const mp4Files = subList.result.entries.filter(e => e['.tag'] === 'file' && e.name.toLowerCase().endsWith('.mp4'))
            
            if (mp4Files.length === 0) {
                console.log(`[SKIP] No .mp4 files found inside folder: "${folderName}"`)
                continue
            }

            // Pick the primary recording file (gallery view or standard view)
            const primaryMp4 = mp4Files.find(f => f.name.includes('shared_screen_with_gallery_view')) ||
                               mp4Files.find(f => f.name.includes('shared_screen_with_speaker_view')) ||
                               mp4Files[0]

            const srcFilePath = primaryMp4.path_display || primaryMp4.path_lower!
            const destFilePath = `${DEST_ROOT}/${destFolder}/${formattedDate} - Lesson.mp4`

            moves.push({
                from: srcFilePath,
                to: destFilePath,
                reason: `Move recording for ${matchedName} (${formattedDate})`
            })
        } catch (err: any) {
            console.error(`Error inspecting subfolder "${folderName}":`, err?.message || err)
        }
    }

    console.log('\n================== PLANNED MOVES ==================')
    console.log(`Total moves planned: ${moves.length}\n`)
    for (const m of moves) {
        console.log(`REASON: ${m.reason}`)
        console.log(`  FROM: ${m.from}`)
        console.log(`  TO:   ${m.to}`)
        console.log()
    }
    console.log('==================================================\n')

    if (DRY_RUN) {
        console.log('This was a DRY RUN. To execute these moves, run this script with "--execute".')
        return
    }

    console.log('Executing moves in Dropbox...')
    let successCount = 0
    let failureCount = 0

    for (const m of moves) {
        try {
            console.log(`Moving: "${m.from}" -> "${m.to}"`)
            await dbx.filesMoveV2({
                from_path: m.from,
                to_path: m.to,
                autorename: true,
                allow_shared_folder: true
            })
            successCount++
        } catch (err: any) {
            console.error(`  [FAILED] Could not move:`, err?.error?.error_summary || err?.message || err)
            failureCount++
        }
    }

    console.log(`\nClean-up Complete. Success: ${successCount}, Failures: ${failureCount}`)
}

main().catch(console.error)
