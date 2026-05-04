// One-off rescue script: pull a Zoom cloud recording for a given meeting ID,
// upload the .mp4 into the student's Dropbox folder, and write video_url +
// status='completed' to the matching lesson row.
//
// Usage:
//   npx tsx scripts/process_recording_manually.ts <zoom_meeting_id>
//
// Equivalent to what /api/webhooks/zoom does, but driven manually using the
// Zoom REST API instead of a recording.completed webhook payload (so the
// download_token issue doesn't apply — we use the OAuth access token).

import { Dropbox } from 'dropbox'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import {
    getDropboxClient,
    getOrCreateSharedLink,
    pickPrimaryRecordingFile,
    uploadBufferToDropbox,
    type ZoomRecordingFile,
} from '../lib/zoom-recordings'
import { getZoomAccessToken } from '../lib/zoom'

config({ path: '.env.local' })

async function run() {
    const meetingId = process.argv[2]
    if (!meetingId) {
        console.error('Usage: npx tsx scripts/process_recording_manually.ts <zoom_meeting_id>')
        process.exit(1)
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    console.log(`Looking up lesson by zoom_meeting_id=${meetingId}...`)
    const { data: lesson, error: lessonErr } = await supabase
        .from('lessons')
        .select('id, student_id, video_url, status')
        .eq('zoom_meeting_id', meetingId)
        .maybeSingle()
    if (lessonErr) throw lessonErr
    if (!lesson) {
        console.error(`No lesson found for meeting ${meetingId}`)
        process.exit(1)
    }
    console.log(`  lesson: ${lesson.id} (status=${lesson.status}, video_url=${lesson.video_url})`)

    if (lesson.video_url) {
        console.log('Lesson already has video_url. Pass --force to overwrite (not implemented; bail out).')
        if (!process.argv.includes('--force')) return
    }

    const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, name, dropbox_recording_folder')
        .eq('id', lesson.student_id)
        .single()
    if (profileErr || !profile) throw profileErr || new Error('No profile')
    if (!profile.dropbox_recording_folder) {
        console.error(`Profile ${profile.name} has no dropbox_recording_folder`)
        process.exit(1)
    }
    console.log(`  student: ${profile.name} -> ${profile.dropbox_recording_folder}`)

    console.log(`Fetching recording info from Zoom API (user/me/recordings)...`)
    const accessToken = await getZoomAccessToken()
    if (!accessToken) throw new Error('Could not get Zoom access token')

    // Use list_user_recordings endpoint (matches the scope we added) and find
    // the matching meeting in the response. Zoom returns the most recent ~30
    // days by default which is plenty for a recently-recorded test.
    const apiRes = await fetch(
        `https://api.zoom.us/v2/users/me/recordings?page_size=30`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!apiRes.ok) {
        const body = await apiRes.text()
        throw new Error(`Zoom API ${apiRes.status}: ${body.slice(0, 300)}`)
    }
    const list: any = await apiRes.json()
    const meeting = (list.meetings || []).find((m: any) => String(m.id) === String(meetingId))
    if (!meeting) {
        const ids = (list.meetings || []).map((m: any) => m.id).join(', ')
        throw new Error(`Meeting ${meetingId} not found in recent recordings. Found: ${ids}`)
    }
    console.log(`  found meeting in API response, topic="${meeting.topic}", start=${meeting.start_time}`)
    const data: any = meeting
    const recordingFiles: ZoomRecordingFile[] = data.recording_files || []
    console.log(`  ${recordingFiles.length} recording_files`)
    for (const f of recordingFiles) {
        console.log(`    [${f.file_type}] ${f.recording_type} ${f.file_size} bytes (${f.status})`)
    }

    const file = pickPrimaryRecordingFile(recordingFiles)
    if (!file?.download_url) throw new Error('No suitable mp4 in recording_files')
    console.log(`  selected: ${file.recording_type} ${file.file_size} bytes`)

    console.log(`Downloading from Zoom...`)
    const downloadUrl = new URL(file.download_url)
    downloadUrl.searchParams.set('access_token', accessToken)
    const dlRes = await fetch(downloadUrl, { redirect: 'follow' })
    if (!dlRes.ok) {
        const body = await dlRes.text().catch(() => '')
        throw new Error(`Download failed ${dlRes.status}: ${body.slice(0, 200)}`)
    }
    const buffer = Buffer.from(await dlRes.arrayBuffer())
    console.log(`  downloaded ${buffer.length} bytes`)
    if (buffer.length < 1024) {
        throw new Error(`Suspiciously small download: ${buffer.toString('utf8', 0, 200)}`)
    }

    const startIso = file.recording_start || data.start_time
    const date = startIso ? new Date(startIso) : new Date()
    const yyyy = date.getUTCFullYear()
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(date.getUTCDate()).padStart(2, '0')
    const filename = `${yyyy}-${mm}-${dd} - Lesson - ${meetingId}.mp4`
    const targetPath = `/Lesson Recordings/${profile.dropbox_recording_folder}/${filename}`
    console.log(`Uploading to Dropbox: ${targetPath}`)

    const dbx: Dropbox = getDropboxClient()
    const uploaded = await uploadBufferToDropbox(dbx, buffer, targetPath)
    console.log(`  uploaded to ${uploaded.path}`)

    const sharedUrl = await getOrCreateSharedLink(dbx, uploaded.path)
    console.log(`  share link: ${sharedUrl}`)

    const { error: updateErr } = await supabase
        .from('lessons')
        .update({ video_url: sharedUrl, status: 'completed' })
        .eq('id', lesson.id)
    if (updateErr) throw updateErr
    console.log(`Lesson ${lesson.id} updated. Done.`)
}

run().catch(e => {
    console.error('FAILED:', e?.message || e)
    if (e?.error) console.error('Error detail:', JSON.stringify(e.error).slice(0, 500))
    process.exit(1)
})
