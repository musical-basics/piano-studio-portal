import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Dropbox } from 'dropbox'
import { Resend } from 'resend'
import NewRecordingEmail from '@/components/emails/new-recording-email'
import { formatRecordingName } from '@/lib/format-recording-name'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.avi', '.mkv']
const LESSON_RECORDINGS_ROOT = '/Lesson Recordings'

function getDropboxClient() {
    return new Dropbox({
        clientId: process.env.DROPBOX_CLIENT_ID!,
        clientSecret: process.env.DROPBOX_CLIENT_SECRET!,
        refreshToken: process.env.DROPBOX_REFRESH_TOKEN!,
        fetch: fetch.bind(globalThis),
    })
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('key') !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    console.log(`[Cron/new-recordings] Starting at ${now.toISOString()}`)

    // 1. Fetch all active students that have a dropbox folder configured
    const { data: students, error: studentsError } = await supabase
        .from('profiles')
        .select('id, name, email, dropbox_recording_folder, last_recording_notified_at')
        .eq('role', 'student')
        .not('dropbox_recording_folder', 'is', null)
        .not('email', 'is', null)

    if (studentsError) {
        console.error('[Cron/new-recordings] Error fetching students:', studentsError)
        return NextResponse.json({ error: studentsError.message }, { status: 500 })
    }

    if (!students || students.length === 0) {
        console.log('[Cron/new-recordings] No eligible students found.')
        return NextResponse.json({ success: true, notified: 0 })
    }

    console.log(`[Cron/new-recordings] Checking ${students.length} student(s)...`)

    // 2. Fetch admin info for sender details
    const { data: admin } = await supabase
        .from('profiles')
        .select('studio_name')
        .eq('role', 'admin')
        .limit(1)
        .single()

    const studioName = admin?.studio_name || 'Lionel Yu Piano Studio'
    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/student`
        : 'https://studio.musicalbasics.com/student'

    const dbx = getDropboxClient()
    let notified = 0
    let errors = 0

    for (const student of students) {
        if (!student.dropbox_recording_folder || !student.email) continue

        const folderPath = `${LESSON_RECORDINGS_ROOT}/${student.dropbox_recording_folder}`
        const lastNotified = student.last_recording_notified_at
            ? new Date(student.last_recording_notified_at)
            : null

        try {
            // List files in their folder
            const res = await dbx.filesListFolder({ path: folderPath })
            const videoFiles = res.result.entries.filter(e => {
                if (e['.tag'] !== 'file') return false
                const lower = e.name.toLowerCase()
                return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext))
            }) as any[]

            // Find files that are newer than last notification time
            const newFiles = videoFiles.filter(f => {
                const modified = new Date(f.client_modified)
                // If we've never notified, only alert on files from the last 7 days
                // to avoid spamming a student who just got the feature
                if (!lastNotified) {
                    const sevenDaysAgo = new Date()
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
                    return modified > sevenDaysAgo
                }
                return modified > lastNotified
            })

            if (newFiles.length === 0) {
                console.log(`[Cron/new-recordings] No new files for ${student.name}`)
                continue
            }

            console.log(
                `[Cron/new-recordings] ${newFiles.length} new file(s) for ${student.name} — sending email to ${student.email}`
            )

            // Format file info for email
            const formattedFiles = newFiles.map((f: any) => {
                const formattedName = formatRecordingName(f.name)
                const date = new Date(f.client_modified).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                })
                return { name: f.name, formattedName, date }
            })

            // Send email
            const { error: emailError } = await resend.emails.send({
                from: `${studioName} <notifications@updates.musicalbasics.com>`,
                to: student.email,
                subject:
                    newFiles.length === 1
                        ? 'New lesson recording available 🎹'
                        : `${newFiles.length} new lesson recordings available 🎹`,
                react: NewRecordingEmail({
                    studentName: student.name || 'Student',
                    newFiles: formattedFiles,
                    dashboardUrl,
                    studioName,
                }),
            })

            if (emailError) {
                console.error(`[Cron/new-recordings] Email failed for ${student.name}:`, emailError)
                errors++
                continue
            }

            // Update last_recording_notified_at to now
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ last_recording_notified_at: now.toISOString() })
                .eq('id', student.id)

            if (updateError) {
                console.error(
                    `[Cron/new-recordings] Failed to update timestamp for ${student.name}:`,
                    updateError
                )
            }

            notified++
        } catch (err: any) {
            const summary = err?.error?.error_summary || err?.message || String(err)
            // Silently skip "folder not found" — student may not have recordings yet
            if (typeof summary === 'string' && summary.includes('path/not_found')) {
                console.log(`[Cron/new-recordings] Folder not found for ${student.name}, skipping.`)
            } else {
                console.error(`[Cron/new-recordings] Error checking ${student.name}:`, summary)
                errors++
            }
        }
    }

    console.log(
        `[Cron/new-recordings] Done. Notified: ${notified}, Errors: ${errors}`
    )

    return NextResponse.json({
        success: true,
        checked: now.toISOString(),
        stats: { students: students.length, notified, errors },
    })
}
