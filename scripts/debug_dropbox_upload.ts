import { getDropboxClient, uploadBufferToDropbox, getOrCreateSharedLink } from '../lib/zoom-recordings'
import { config } from 'dotenv'
config({ path: '.env.local' })

async function run() {
    const dbx = getDropboxClient()
    const buffer = Buffer.from('debug test ' + new Date().toISOString())
    const targetPath = `/Lesson Recordings/My Own Piano Lessons/_debug_${Date.now()}.txt`

    console.log(`Uploading ${buffer.length} bytes to ${targetPath}`)
    try {
        const result = await uploadBufferToDropbox(dbx, buffer, targetPath)
        console.log('OK uploaded:', result)
        const link = await getOrCreateSharedLink(dbx, result.path)
        console.log('OK share link:', link)
    } catch (err: any) {
        console.error('FAILED:', err?.message)
        console.error('Full error object:', JSON.stringify({
            name: err?.name,
            message: err?.message,
            status: err?.status,
            error: err?.error,
            error_summary: err?.error?.error_summary,
            user_message: err?.user_message,
            stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
        }, null, 2))
    }
}
run()
