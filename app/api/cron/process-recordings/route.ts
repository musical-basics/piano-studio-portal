import { NextResponse } from 'next/server'
import { Dropbox } from 'dropbox'
import { createClient } from '@/lib/supabase/server'

// Force dynamic to ensure it runs every time (no caching)
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    // 1. Initialize Dropbox & Supabase
    const refresh_token = process.env.DROPBOX_REFRESH_TOKEN
    const clientId = process.env.DROPBOX_CLIENT_ID
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET

    // IMPORTANT: Use the path from your screenshot
    const sourceRoot = process.env.DROPBOX_SOURCE_PATH || ''

    if (!refresh_token || !clientId || !clientSecret) {
        return NextResponse.json({ error: 'Missing Dropbox Credentials' }, { status: 500 })
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
        const listResponse = await dbx.filesListFolder({ path: sourceRoot })
        const entries = listResponse.result.entries

        console.log(`Found ${entries.length} items in source path: ${sourceRoot || 'Root'}`)

        for (const entry of entries) {
            // We only care about FOLDERS (Zoom creates a folder per meeting)
            if (entry['.tag'] !== 'folder') continue

            const folderName = entry.name // e.g., "2025_12_15T11-29 Padhma Berk _ Piano Lesson"

            // 3. Parse the Folder Name
            // Regex: Match Date (YYYY_MM_DD) and Name (between space and "_ Piano Lesson")
            const regex = /^(\d{4}_\d{2}_\d{2})T[\d-]+\s+(.+?)\s+_\s+Piano Lesson/
            const match = folderName.match(regex)

            if (!match) {
                console.log(`Skipping: ${folderName} (Does not match pattern)`)
                continue
            }

            const rawDate = match[1] // 2025_12_15
            const studentName = match[2].trim() // Padhma Berk
            const lessonDate = rawDate.replace(/_/g, '-') // 2025-12-15

            console.log(`Processing: ${studentName} on ${lessonDate}`)

            // 4. Find the Lesson in Supabase
            // We search for a completed or scheduled lesson for this student/date
            const { data: student } = await supabase
                .from('profiles')
                .select('id')
                .eq('name', studentName)
                .single()

            if (!student) {
                console.warn(`Student not found in DB: ${studentName}`)
                errors.push({ file: folderName, error: 'Student not found' })
                continue
            }

            const { data: lesson } = await supabase
                .from('lessons')
                .select('id')
                .eq('student_id', student.id)
                .eq('date', lessonDate)
                .single()

            if (!lesson) {
                console.warn(`Lesson not found for ${studentName} on ${lessonDate}`)
                errors.push({ file: folderName, error: 'Lesson row not found' })
                continue
            }

            // 5. Move the Folder on Dropbox
            // Target: /Lesson Recordings/[Student Name] Recordings/[Original Folder Name]
            const targetFolder = `/Lesson Recordings/${studentName} Recordings/${folderName}`

            try {
                // Move the entire folder
                await dbx.filesMoveV2({
                    from_path: entry.path_lower!,
                    to_path: targetFolder,
                    autorename: true
                })
                console.log(`Moved folder to: ${targetFolder}`)

                // 6. Find the .mp4 file INSIDE the moved folder
                // We list files in the NEW location
                const folderContent = await dbx.filesListFolder({ path: targetFolder })
                const videoFile = folderContent.result.entries.find(f => f.name.endsWith('.mp4'))

                if (!videoFile) {
                    throw new Error('No .mp4 file found inside lesson folder')
                }

                // 7. Generate Link for the .mp4
                const linkResponse = await dbx.sharingCreateSharedLinkWithSettings({
                    path: videoFile.path_lower!
                })
                const videoUrl = linkResponse.result.url

                // 8. Update Supabase
                const { error: updateError } = await supabase
                    .from('lessons')
                    .update({
                        video_url: videoUrl,
                        status: 'completed'
                    })
                    .eq('id', lesson.id)

                if (updateError) throw updateError

                results.push({
                    student: studentName,
                    date: lessonDate,
                    status: 'Success',
                    video: videoUrl
                })

            } catch (err: any) {
                console.error(`Error processing ${folderName}:`, err)
                errors.push({ file: folderName, error: err.message })
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            results,
            errors
        })

    } catch (globalError: any) {
        return NextResponse.json({ error: globalError.message }, { status: 500 })
    }
}