import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    downloadFromZoom,
    getDropboxClient,
    getOrCreateSharedLink,
    pickPrimaryRecordingFile,
    uploadBufferToDropbox,
    type ZoomRecordingFile,
} from '@/lib/zoom-recordings'

export const dynamic = 'force-dynamic'
// Recordings can be ~50-300MB; allow time for download + chunked Dropbox upload
export const maxDuration = 300

function verifyZoomSignature(rawBody: string, signature: string, timestamp: string, secret: string): boolean {
    const message = `v0:${timestamp}:${rawBody}`
    const expected = `v0=${crypto.createHmac('sha256', secret).update(message).digest('hex')}`
    if (expected.length !== signature.length) return false
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    } catch {
        return false
    }
}

function fileNameForRecording(meetingId: string, startIso: string | undefined): string {
    const date = startIso ? new Date(startIso) : new Date()
    const yyyy = date.getUTCFullYear()
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(date.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} - Lesson - ${meetingId}.mp4`
}

export async function POST(req: Request) {
    const logs: string[] = []
    const log = (msg: string) => {
        console.log(msg)
        logs.push(msg)
    }

    const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN
    if (!secret) {
        log('CRITICAL: ZOOM_WEBHOOK_SECRET_TOKEN not configured')
        return NextResponse.json({ error: 'webhook secret not configured', logs }, { status: 500 })
    }

    const rawBody = await req.text()
    let event: any
    try {
        event = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'invalid json', logs }, { status: 400 })
    }

    // 1. Zoom URL validation handshake (sent when subscribing the endpoint).
    //    Must be answered without signature check.
    if (event.event === 'endpoint.url_validation') {
        const plainToken = event.payload?.plainToken
        if (!plainToken) {
            return NextResponse.json({ error: 'missing plainToken' }, { status: 400 })
        }
        const encryptedToken = crypto.createHmac('sha256', secret).update(plainToken).digest('hex')
        log(`URL validation handshake answered`)
        return NextResponse.json({ plainToken, encryptedToken })
    }

    // 2. Verify signature for everything else.
    const signature = req.headers.get('x-zm-signature') || ''
    const timestamp = req.headers.get('x-zm-request-timestamp') || ''
    if (!signature || !timestamp || !verifyZoomSignature(rawBody, signature, timestamp, secret)) {
        log('Signature verification failed')
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    // 3. We only act on recording.completed. Acknowledge other events with 200
    //    so Zoom doesn't retry them.
    if (event.event !== 'recording.completed') {
        return NextResponse.json({ ok: true, ignored: event.event })
    }

    const obj = event.payload?.object
    const downloadToken: string | undefined = event.download_token
    if (!obj || !downloadToken) {
        log('Malformed recording.completed payload (missing object or download_token)')
        return NextResponse.json({ error: 'malformed payload', logs }, { status: 400 })
    }

    const meetingId = obj.id != null ? String(obj.id) : null
    const startTime: string | undefined = obj.start_time
    const recordingFiles: ZoomRecordingFile[] = obj.recording_files || []

    log(`recording.completed for meeting ${meetingId} (${recordingFiles.length} files)`)
    if (!meetingId) {
        return NextResponse.json({ error: 'missing meeting id' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Look up the lesson by zoom_meeting_id, joined to the student's profile.
    const { data: lesson, error: lessonErr } = await supabase
        .from('lessons')
        .select('id, student_id, video_url, status')
        .eq('zoom_meeting_id', meetingId)
        .maybeSingle()

    if (lessonErr) {
        log(`Supabase lesson lookup error: ${lessonErr.message}`)
        return NextResponse.json({ error: 'db error', logs }, { status: 500 })
    }
    if (!lesson) {
        log(`No lesson row found for meeting ${meetingId}; nothing to do.`)
        // Return 200 so Zoom doesn't keep retrying for unmapped meetings
        // (e.g. ad hoc meetings outside the lesson booking flow).
        return NextResponse.json({ ok: true, skipped: 'no matching lesson', logs })
    }

    if (lesson.video_url) {
        log(`Lesson ${lesson.id} already has video_url; skipping.`)
        return NextResponse.json({ ok: true, skipped: 'already processed', logs })
    }

    const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, name, dropbox_recording_folder')
        .eq('id', lesson.student_id)
        .single()
    if (profileErr || !profile) {
        log(`Profile lookup failed for ${lesson.student_id}: ${profileErr?.message}`)
        return NextResponse.json({ error: 'profile not found', logs }, { status: 500 })
    }
    if (!profile.dropbox_recording_folder) {
        log(`Profile ${profile.name} has no dropbox_recording_folder; skipping.`)
        return NextResponse.json({ ok: true, skipped: 'no dropbox folder configured', logs })
    }

    const file = pickPrimaryRecordingFile(recordingFiles)
    if (!file || !file.download_url) {
        log(`No suitable recording file in payload`)
        return NextResponse.json({ ok: true, skipped: 'no mp4 in payload', logs })
    }
    log(`Selected file: type=${file.file_type} kind=${file.recording_type} size=${file.file_size}`)

    try {
        log(`Downloading from Zoom...`)
        const buffer = await downloadFromZoom(file.download_url, downloadToken)
        log(`Downloaded ${buffer.length} bytes`)

        const dbx = getDropboxClient()
        const filename = fileNameForRecording(meetingId, file.recording_start || startTime)
        const targetPath = `/Lesson Recordings/${profile.dropbox_recording_folder}/${filename}`
        log(`Uploading to Dropbox: ${targetPath}`)
        const uploaded = await uploadBufferToDropbox(dbx, buffer, targetPath)
        log(`Uploaded to ${uploaded.path}`)

        const sharedUrl = await getOrCreateSharedLink(dbx, uploaded.path)
        log(`Share link: ${sharedUrl}`)

        const { error: updateErr } = await supabase
            .from('lessons')
            .update({ video_url: sharedUrl, status: 'completed' })
            .eq('id', lesson.id)
        if (updateErr) {
            log(`DB update failed: ${updateErr.message}`)
            return NextResponse.json({ error: 'db update failed', logs }, { status: 500 })
        }
        log(`Lesson ${lesson.id} updated.`)

        return NextResponse.json({ ok: true, lesson_id: lesson.id, path: uploaded.path, video_url: sharedUrl, logs })
    } catch (err: any) {
        log(`Processing error: ${err?.message || err}`)
        // Return 500 so Zoom retries (it retries up to 3 times with backoff).
        return NextResponse.json({ error: err?.message || 'unknown error', logs }, { status: 500 })
    }
}
