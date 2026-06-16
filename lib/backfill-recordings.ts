// Fallback recovery for Zoom recordings that the real-time webhook missed.
//
// The only path that normally attaches a recording to a lesson is the
// `recording.completed` webhook (app/api/webhooks/zoom/route.ts). If Zoom
// fails to deliver that event (delivery hiccup, deploy downtime, signature
// mismatch, transient error past Zoom's retry budget), the recording is
// silently orphaned: it sits in Zoom's cloud but lessons.video_url stays null
// and the student never sees it.
//
// This scans for past lessons that have a zoom_meeting_id but no video_url,
// cross-references Zoom's cloud recordings, and pulls any matches into Dropbox
// + writes video_url — exactly what the webhook would have done.

import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { logLessonCore } from '@/lib/core/lessons'
import { getZoomAccessToken } from '@/lib/zoom'
import {
    downloadFromZoom,
    getDropboxClient,
    getOrCreateSharedLink,
    pickPrimaryRecordingFile,
    uploadBufferToDropbox,
    type ZoomRecordingFile,
} from '@/lib/zoom-recordings'

type ZoomMeeting = {
    id: number | string
    topic?: string
    start_time?: string
    recording_files?: ZoomRecordingFile[]
}

function ymd(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function fileNameForRecording(meetingId: string, startIso: string | undefined): string {
    const date = startIso ? new Date(startIso) : new Date()
    return `${ymd(date)} - Lesson - ${meetingId}.mp4`
}

// Fetch the studio's Zoom cloud recordings since `fromDate`, following
// pagination. Zoom caps each query at a one-month window, which comfortably
// covers Zoom's default cloud-recording retention.
async function fetchZoomRecordings(accessToken: string, fromDate: string): Promise<Map<string, ZoomMeeting>> {
    const byId = new Map<string, ZoomMeeting>()
    let pageToken = ''
    do {
        const url = new URL('https://api.zoom.us/v2/users/me/recordings')
        url.searchParams.set('page_size', '300')
        url.searchParams.set('from', fromDate)
        if (pageToken) url.searchParams.set('next_page_token', pageToken)
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        if (!res.ok) {
            throw new Error(`Zoom recordings list failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
        }
        const data: any = await res.json()
        for (const m of data.meetings || []) byId.set(String(m.id), m)
        pageToken = data.next_page_token || ''
    } while (pageToken)
    return byId
}

export type BackfillResult = {
    scanned: number
    recovered: Array<{ lessonId: string; meetingId: string; videoUrl: string }>
    skipped: Array<{ lessonId: string; meetingId: string; reason: string }>
    errors: Array<{ lessonId: string; meetingId: string; error: string }>
}

export type BackfillOptions = {
    client?: DbClient
    // How far back to look. Defaults to 30 days (Zoom's typical retention).
    fromDate?: string
    // Max recordings to actually download/upload in one run. Large files +
    // chunked Dropbox uploads are slow, so we bound work per invocation and
    // let subsequent runs pick up the rest.
    limit?: number
    log?: (msg: string) => void
}

export async function backfillMissingRecordings(opts: BackfillOptions = {}): Promise<BackfillResult> {
    const log = opts.log || (() => {})
    const supabase = opts.client || createAdminClient()
    const limit = opts.limit ?? 5

    const defaultFrom = new Date()
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30)
    const fromDate = opts.fromDate || ymd(defaultFrom)
    const today = ymd(new Date())

    const result: BackfillResult = { scanned: 0, recovered: [], skipped: [], errors: [] }

    // Past (or today's) lessons that have a meeting but no recording attached.
    // Excludes future scheduled lessons, which legitimately have no recording.
    const { data: orphans, error: orphanErr } = await supabase
        .from('lessons')
        .select('id, student_id, date, status, zoom_meeting_id, notes')
        .not('zoom_meeting_id', 'is', null)
        .is('video_url', null)
        .gte('date', fromDate)
        .lte('date', today)
        .order('date', { ascending: false })

    if (orphanErr) throw new Error(`Orphan lesson query failed: ${orphanErr.message}`)
    result.scanned = orphans?.length ?? 0
    if (!orphans || orphans.length === 0) {
        log('No orphaned lessons in window.')
        return result
    }
    log(`Found ${orphans.length} lesson(s) with a meeting id but no video_url since ${fromDate}.`)

    const accessToken = await getZoomAccessToken()
    if (!accessToken) throw new Error('Could not obtain Zoom access token')

    const recordings = await fetchZoomRecordings(accessToken, fromDate)
    log(`Zoom cloud has ${recordings.size} recording(s) in window.`)

    const dbx = getDropboxClient()
    let processed = 0

    for (const lesson of orphans as any[]) {
        if (processed >= limit) {
            result.skipped.push({ lessonId: lesson.id, meetingId: lesson.zoom_meeting_id, reason: 'per-run limit reached' })
            continue
        }

        const meetingId = String(lesson.zoom_meeting_id)
        const meeting = recordings.get(meetingId)
        if (!meeting) {
            // No cloud recording (never recorded, or retention-expired). Not an error.
            result.skipped.push({ lessonId: lesson.id, meetingId, reason: 'no cloud recording on Zoom' })
            continue
        }

        try {
            const { data: profile, error: profileErr } = await supabase
                .from('profiles')
                .select('id, name, dropbox_recording_folder')
                .eq('id', lesson.student_id)
                .single()
            if (profileErr || !profile) throw new Error(`profile lookup failed: ${profileErr?.message}`)
            if (!profile.dropbox_recording_folder) {
                result.skipped.push({ lessonId: lesson.id, meetingId, reason: `${profile.name} has no dropbox folder` })
                continue
            }

            const file = pickPrimaryRecordingFile(meeting.recording_files || [])
            if (!file?.download_url) {
                result.skipped.push({ lessonId: lesson.id, meetingId, reason: 'no suitable mp4 in recording' })
                continue
            }

            log(`Recovering lesson ${lesson.id} (${profile.name}, meeting ${meetingId})...`)
            // The OAuth access token works as the download_url access_token query param.
            const buffer = await downloadFromZoom(file.download_url, accessToken)
            const filename = fileNameForRecording(meetingId, file.recording_start || meeting.start_time)
            const targetPath = `/Lesson Recordings/${profile.dropbox_recording_folder}/${filename}`
            const uploaded = await uploadBufferToDropbox(dbx, buffer, targetPath)
            const sharedUrl = await getOrCreateSharedLink(dbx, uploaded.path)

            // Persist the recording FIRST so it can never be lost if the credit /
            // notification step below fails (mirrors the webhook's ordering).
            const { error: videoErr } = await supabase
                .from('lessons')
                .update({ video_url: sharedUrl })
                .eq('id', lesson.id)
            if (videoErr) throw new Error(`video_url update failed: ${videoErr.message}`)

            // Then run credit + completion accounting via logLessonCore, preserving
            // existing notes. revalidatePath() inside it throws when called outside a
            // request context (e.g. the CLI script); the recording is already saved,
            // so treat any failure here as non-fatal.
            try {
                const logResult = await logLessonCore({
                    client: supabase as any,
                    adminId: lesson.student_id,
                    lessonId: lesson.id,
                    notes: lesson.notes || '',
                    videoUrl: sharedUrl,
                    completedSource: 'system',
                    awaitNotifications: false,
                })
                if ('error' in logResult) log(`credit warning for ${lesson.id}: ${logResult.error} (recording saved)`)
            } catch (creditErr: any) {
                log(`credit/notify step warning for ${lesson.id}: ${creditErr?.message || creditErr} (recording saved)`)
            }

            result.recovered.push({ lessonId: lesson.id, meetingId, videoUrl: sharedUrl })
            processed++
            log(`Recovered ${lesson.id} -> ${sharedUrl}`)
        } catch (err: any) {
            const detail = err?.error?.error_summary || err?.message || String(err)
            result.errors.push({ lessonId: lesson.id, meetingId, error: detail })
            log(`ERROR recovering ${lesson.id}: ${detail}`)
        }
    }

    return result
}
