import { NextResponse } from 'next/server'
import { Dropbox } from 'dropbox'
import { createClient } from '@/lib/supabase/server'

// Force dynamic to ensure it runs every time (no caching)
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    // Initialize a log array to return to the user for easy debugging
    const logs: string[] = []
    const log = (message: string) => {
        console.log(message) // Log to Vercel Console
        logs.push(message)   // Add to response array
    }

    log("🚀 Starting Nightly Janitor Process...")

    // 1. Initialize Dropbox & Supabase
    const refresh_token = process.env.DROPBOX_REFRESH_TOKEN
    const clientId = process.env.DROPBOX_CLIENT_ID
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET

    // Default to root if variable is missing, but log it clearly
    const sourceRoot = process.env.DROPBOX_SOURCE_PATH || ''
    log(`📂 Target Source Folder: "${sourceRoot || '(Dropbox Root)'}"`)

    if (!refresh_token || !clientId || !clientSecret) {
        const error = '❌ CRITICAL: Missing Dropbox Credentials in Environment Variables'
        console.error(error)
        return NextResponse.json({ error, logs }, { status: 500 })
    }

    const dbx = new Dropbox({
        clientId,
        clientSecret,
        refreshToken: refresh_token
    })

    const supabase = await createClient()
    const results = []
    const errors = []

    try {
        // 2. List all folders in the source directory
        log("🔍 Scanning Dropbox for folders...")
        const listResponse = await dbx.filesListFolder({ path: sourceRoot })
        const entries = listResponse.result.entries

        log(`📊 Found ${entries.length} items in source folder.`)

        if (entries.length === 0) {
            log("⚠️ WARNING: Source folder is empty. Is 'DROPBOX_SOURCE_PATH' correct?")
        }

        for (const entry of entries) {
            const folderName = entry.name

            // We only care about FOLDERS (Zoom creates a folder per meeting)
            if (entry['.tag'] !== 'folder') {
                log(`⏭️ Skipping "${folderName}" (Not a folder)`)
                continue
            }

            // 3. Parse the Folder Name
            // Regex: Match Date (YYYY_MM_DD) and Name (between space and "_ Piano Lesson")
            const regex = /^(\d{4}_\d{2}_\d{2})T[\d-]+\s+(.+?)\s+_\s+Piano Lesson/
            const match = folderName.match(regex)

            if (!match) {
                log(`⚠️ Skipping "${folderName}": Name format does not match regex.`)
                continue
            }

            const rawDate = match[1] // 2025_12_15
            const studentName = match[2].trim() // Padhma Berk
            const lessonDate = rawDate.replace(/_/g, '-') // 2025-12-15

            log(`✅ Processing Match: Student="${studentName}", Date="${lessonDate}"`)

            // 4. Find the Student in Supabase
            log(`🔎 Database: Searching for student "${studentName}"...`)
            const { data: student } = await supabase
                .from('profiles')
                .select('id')
                .eq('name', studentName)
                .single()

            if (!student) {
                const msg = `❌ Student not found in DB: "${studentName}"`
                log(msg)
                errors.push({ file: folderName, error: msg })
                continue
            }
            log(`👤 Student Found! ID: ${student.id}`)

            // 5. Find the Lesson in Supabase
            log(`🔎 Database: Searching for lesson on ${lessonDate}...`)
            const { data: lesson } = await supabase
                .from('lessons')
                .select('id')
                .eq('student_id', student.id)
                .eq('date', lessonDate)
                .single()

            if (!lesson) {
                const msg = `❌ Lesson row not found for ${studentName} on ${lessonDate}`
                log(msg)
                errors.push({ file: folderName, error: msg })
                continue
            }
            log(`📅 Lesson Found! ID: ${lesson.id}`)

            // 6. Move the Folder on Dropbox
            const targetFolder = `/Lesson Recordings/${studentName} Recordings/${folderName}`
            log(`🚚 Moving Dropbox folder to: "${targetFolder}"...`)

            try {
                // Move the entire folder
                await dbx.filesMoveV2({
                    from_path: entry.path_lower!,
                    to_path: targetFolder,
                    autorename: true
                })
                log(`✅ Move Successful.`)

                // 7. Find the .mp4 file INSIDE the moved folder
                log(`🎥 Scanning inside new folder for .mp4...`)
                const folderContent = await dbx.filesListFolder({ path: targetFolder })
                const videoFile = folderContent.result.entries.find(f => f.name.endsWith('.mp4'))

                if (!videoFile) {
                    throw new Error('No .mp4 file found inside moved folder')
                }
                log(`✅ Found video file: "${videoFile.name}"`)

                // 8. Generate Link for the .mp4
                log(`🔗 Generating shared link...`)
                const linkResponse = await dbx.sharingCreateSharedLinkWithSettings({
                    path: videoFile.path_lower!
                })
                const videoUrl = linkResponse.result.url
                log(`✅ Link Created: ${videoUrl}`)

                // 9. Update Supabase
                log(`💾 Updating Supabase Lesson ID ${lesson.id}...`)
                const { error: updateError } = await supabase
                    .from('lessons')
                    .update({
                        video_url: videoUrl,
                        status: 'completed'
                    })
                    .eq('id', lesson.id)

                if (updateError) throw updateError
                log(`🎉 SUCCESS: Lesson updated completely.`)

                results.push({
                    student: studentName,
                    date: lessonDate,
                    status: 'Success',
                    video: videoUrl
                })

            } catch (err: any) {
                const msg = `❌ Error during Dropbox Ops/DB Update: ${err.message}`
                console.error(msg)
                log(msg)
                errors.push({ file: folderName, error: err.message })
            }
        }

        log("🏁 Janitor Run Complete.")

        return NextResponse.json({
            success: true,
            processed: results.length,
            results,
            errors,
            logs // We return the full log history in the JSON response
        })

    } catch (globalError: any) {
        console.error('Critical Script Failure:', globalError)
        return NextResponse.json({
            error: globalError.message,
            logs
        }, { status: 500 })
    }
}