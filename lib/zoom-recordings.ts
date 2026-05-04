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
    return new Dropbox({ clientId, clientSecret, refreshToken })
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
