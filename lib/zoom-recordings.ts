import { Dropbox } from 'dropbox'

export type ZoomRecordingFile = {
    id?: string
    file_type?: string
    file_extension?: string
    file_size?: number
    download_url?: string
    play_url?: string
    status?: string
    recording_type?: string
    recording_start?: string
    recording_end?: string
}

export function getDropboxClient(): Dropbox {
    const refreshToken = process.env.DROPBOX_REFRESH_TOKEN
    const clientId = process.env.DROPBOX_CLIENT_ID
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET
    if (!refreshToken || !clientId || !clientSecret) {
        throw new Error('Missing Dropbox credentials (DROPBOX_REFRESH_TOKEN / DROPBOX_CLIENT_ID / DROPBOX_CLIENT_SECRET)')
    }
    // Pass fetch explicitly: in Next.js's serverless bundle the Dropbox SDK
    // can't auto-detect the global fetch and dies with "this.fetch is not a
    // function" inside filesUpload. Works locally without this because tsx
    // exposes globals differently.
    return new Dropbox({
        clientId,
        clientSecret,
        refreshToken,
        fetch: fetch.bind(globalThis),
    })
}

export function pickPrimaryRecordingFile(files: ZoomRecordingFile[]): ZoomRecordingFile | null {
    if (!Array.isArray(files) || files.length === 0) return null
    const completed = files.filter(f => f.status === 'completed')
    const pool = completed.length ? completed : files
    return (
        pool.find(f => f.recording_type === 'shared_screen_with_speaker_view' && f.file_type === 'MP4') ||
        pool.find(f => f.recording_type === 'shared_screen_with_speaker_view') ||
        pool.find(f => f.file_type === 'MP4') ||
        null
    )
}

// A recording shorter than this is a no-show (the teacher waiting in an empty
// room) or a dropped-connection fragment, not a lesson. Robert Alconcel's
// 2026-10-22 no-show was a 2-3 minute clip that the webhook logged as a lesson,
// charging him a credit and filing an empty video in his recordings.
export const MIN_LESSON_RECORDING_MINUTES = 5

// ZBackup copies carry no timing, so the organizer judges length by the
// audio-only track. A lesson's track runs ~0.8-1 MB a minute; silence is
// smaller still, so this sits around the same 5 minutes.
export const MIN_LESSON_AUDIO_BYTES = 4 * 1024 * 1024

/**
 * Length of a Zoom recording in minutes, from the longest file's start/end
 * stamps, falling back to the meeting's own duration. Null when neither is
 * available, so callers can fail open rather than drop a real lesson.
 */
export function recordingMinutes(files: ZoomRecordingFile[], fallbackMinutes?: number | null): number | null {
    const spans = (files || [])
        .filter(f => f.recording_start && f.recording_end)
        .map(f => (Date.parse(f.recording_end!) - Date.parse(f.recording_start!)) / 60000)
        .filter(n => Number.isFinite(n) && n >= 0)
    if (spans.length) return Math.max(...spans)
    return typeof fallbackMinutes === 'number' && Number.isFinite(fallbackMinutes) ? fallbackMinutes : null
}

export function isTooShortForLesson(files: ZoomRecordingFile[], fallbackMinutes?: number | null): boolean {
    const minutes = recordingMinutes(files, fallbackMinutes)
    return minutes !== null && minutes < MIN_LESSON_RECORDING_MINUTES
}

export async function downloadFromZoom(downloadUrl: string, downloadToken: string): Promise<Buffer> {
    // Auth via query parameter, NOT Authorization header. Zoom's download URLs
    // redirect from zoom.us to a regional CDN (us04web.zoom.us, etc.), and
    // Node's fetch strips Authorization on cross-origin redirects for security.
    // Query-string auth survives the redirect.
    const url = new URL(downloadUrl)
    url.searchParams.set('access_token', downloadToken)

    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Zoom download failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`)
    }
    const contentType = res.headers.get('content-type') || ''
    const ab = await res.arrayBuffer()
    const buf = Buffer.from(ab)
    if (buf.length < 1024) {
        // Sanity guard: Zoom returning a short HTML error page would slip past
        // res.ok. Real recordings are megabytes.
        throw new Error(`Zoom download returned suspiciously small body (${buf.length} bytes, content-type "${contentType}", first bytes: ${buf.toString('utf8', 0, 200)})`)
    }
    return buf
}

const DROPBOX_CHUNK = 150 * 1024 * 1024 // Dropbox single-call limit

export async function uploadBufferToDropbox(
    dbx: Dropbox,
    buffer: Buffer,
    targetPath: string,
): Promise<{ path: string }> {
    if (buffer.length === 0) throw new Error('Empty file buffer')

    if (buffer.length <= DROPBOX_CHUNK) {
        const res = await dbx.filesUpload({
            path: targetPath,
            contents: buffer,
            mode: { '.tag': 'add' },
            autorename: true,
            mute: true,
        })
        return { path: res.result.path_display || targetPath }
    }

    // Chunked upload session for files > 150MB
    const firstEnd = DROPBOX_CHUNK
    const start = await dbx.filesUploadSessionStart({
        contents: buffer.subarray(0, firstEnd),
        close: false,
    })
    const sessionId = start.result.session_id

    let offset = firstEnd
    while (offset < buffer.length) {
        const remaining = buffer.length - offset
        const end = Math.min(offset + DROPBOX_CHUNK, buffer.length)
        const chunk = buffer.subarray(offset, end)
        const isLast = remaining <= DROPBOX_CHUNK

        if (isLast) {
            const finish = await dbx.filesUploadSessionFinish({
                contents: chunk,
                cursor: { session_id: sessionId, offset },
                commit: {
                    path: targetPath,
                    mode: { '.tag': 'add' },
                    autorename: true,
                    mute: true,
                },
            })
            return { path: finish.result.path_display || targetPath }
        }

        await dbx.filesUploadSessionAppendV2({
            contents: chunk,
            cursor: { session_id: sessionId, offset },
            close: false,
        })
        offset = end
    }

    throw new Error('Unreachable: upload loop exited without finish')
}

export async function getOrCreateSharedLink(dbx: Dropbox, path: string): Promise<string> {
    try {
        const res = await dbx.sharingCreateSharedLinkWithSettings({ path })
        return res.result.url
    } catch (err: any) {
        const summary = err?.error?.error?.['.tag'] || err?.error?.error_summary || ''
        if (typeof summary === 'string' && summary.includes('shared_link_already_exists')) {
            const existing = await dbx.sharingListSharedLinks({ path, direct_only: true })
            const url = existing.result.links?.[0]?.url
            if (url) return url
        }
        throw err
    }
}
