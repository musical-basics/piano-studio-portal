import { Dropbox } from 'dropbox'
import { config } from 'dotenv'

config({ path: '.env.local' })

const refreshToken = process.env.DROPBOX_REFRESH_TOKEN
const clientId = process.env.DROPBOX_CLIENT_ID
const clientSecret = process.env.DROPBOX_CLIENT_SECRET

if (!refreshToken || !clientId || !clientSecret) {
    console.error('Missing Dropbox credentials in .env.local')
    process.exit(1)
}

const dbx = new Dropbox({ clientId, clientSecret, refreshToken })

const ROOT = '/Lesson Recordings'
const SAMPLE_FOLDERS_TO_DRILL_INTO = 3

async function inspect() {
    console.log(`Listing "${ROOT}" (read-only)\n`)

    let topLevel
    try {
        topLevel = await dbx.filesListFolder({ path: ROOT })
    } catch (err: any) {
        console.error(`Failed to list "${ROOT}":`, err?.error?.error_summary || err?.message || err)
        process.exit(1)
    }

    const entries = topLevel.result.entries
    console.log(`${ROOT} (${entries.length} entries)`)

    const folders = entries.filter(e => e['.tag'] === 'folder')
    const files = entries.filter(e => e['.tag'] === 'file')

    for (const f of folders) {
        console.log(`  [DIR]  ${f.name}`)
    }
    for (const f of files) {
        console.log(`  [FILE] ${f.name}`)
    }

    console.log(`\nDrilling into first ${SAMPLE_FOLDERS_TO_DRILL_INTO} folders:\n`)

    for (const folder of folders.slice(0, SAMPLE_FOLDERS_TO_DRILL_INTO)) {
        const subPath = folder.path_lower!
        console.log(`${folder.name}/`)
        try {
            const sub = await dbx.filesListFolder({ path: subPath })
            const subEntries = sub.result.entries.slice(0, 8)
            for (const e of subEntries) {
                const tag = e['.tag'] === 'folder' ? '[DIR] ' : '[FILE]'
                console.log(`  ${tag} ${e.name}`)
            }
            if (sub.result.entries.length > subEntries.length) {
                console.log(`  ... and ${sub.result.entries.length - subEntries.length} more`)
            }

            const firstSubFolder = sub.result.entries.find(e => e['.tag'] === 'folder')
            if (firstSubFolder) {
                console.log(`  ${firstSubFolder.name}/ (one level deeper)`)
                const deeper = await dbx.filesListFolder({ path: firstSubFolder.path_lower! })
                for (const e of deeper.result.entries.slice(0, 6)) {
                    const tag = e['.tag'] === 'folder' ? '[DIR] ' : '[FILE]'
                    console.log(`    ${tag} ${e.name}`)
                }
            }
        } catch (err: any) {
            console.error(`  Failed to list:`, err?.error?.error_summary || err?.message || err)
        }
        console.log('')
    }
}

inspect().catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
})
