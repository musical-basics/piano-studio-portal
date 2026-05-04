import { Dropbox } from 'dropbox'
import { config } from 'dotenv'
config({ path: '.env.local' })

const dbx = new Dropbox({
    clientId: process.env.DROPBOX_CLIENT_ID,
    clientSecret: process.env.DROPBOX_CLIENT_SECRET,
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
})

async function run() {
    const path = '/Lesson Recordings/My Own Piano Lessons'
    const list = await dbx.filesListFolder({ path })
    const recent = list.result.entries
        .filter((e: any) => e.name.includes('81610751874') || e.name.includes('2026-05-04'))
    console.log(`Files matching test meeting in ${path}:`)
    for (const e of recent) {
        console.log(`  [${e['.tag']}] ${e.name} (size=${(e as any).size})`)
    }
    if (recent.length === 0) {
        console.log('  (none yet)')
        console.log()
        console.log('Most recent 5 entries in folder:')
        const sorted = [...list.result.entries].sort((a: any, b: any) => (b.server_modified || '').localeCompare(a.server_modified || ''))
        for (const e of sorted.slice(0, 5)) {
            console.log(`  [${e['.tag']}] ${e.name} (modified=${(e as any).server_modified || 'n/a'})`)
        }
    }
}
run().catch(e => { console.error(e); process.exit(1) })
