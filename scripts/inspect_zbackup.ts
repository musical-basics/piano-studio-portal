import { Dropbox } from 'dropbox'
import { config } from 'dotenv'

config({ path: '.env.local' })

const refreshToken = process.env.DROPBOX_REFRESH_TOKEN
const clientId = process.env.DROPBOX_CLIENT_ID
const clientSecret = process.env.DROPBOX_CLIENT_SECRET
const sourcePath = process.env.DROPBOX_SOURCE_PATH || '/Apps/ZBackup-App/lionel@musicalbasics.com'

if (!refreshToken || !clientId || !clientSecret) {
    console.error('Missing Dropbox credentials')
    process.exit(1)
}

const dbx = new Dropbox({ clientId, clientSecret, refreshToken })

async function run() {
    console.log(`Listing contents of source path: "${sourcePath}"...\n`)
    const response = await dbx.filesListFolder({ path: sourcePath })
    const entries = response.result.entries
    console.log(`Found ${entries.length} entries.`)

    for (const entry of entries) {
        console.log(`\n- [${entry['.tag'].toUpperCase()}] Name: "${entry.name}" Path: "${entry.path_display}"`)
        if (entry['.tag'] === 'folder') {
            try {
                const subResponse = await dbx.filesListFolder({ path: entry.path_lower! })
                for (const sub of subResponse.result.entries) {
                    console.log(`    * [${sub['.tag'].toUpperCase()}] ${sub.name} (${(sub as any).size ? ((sub as any).size / (1024 * 1024)).toFixed(1) + ' MB' : 'N/A'})`)
                }
            } catch (err: any) {
                console.error(`    Failed to list folder:`, err?.message || err)
            }
        }
    }
}

run().catch(console.error)
