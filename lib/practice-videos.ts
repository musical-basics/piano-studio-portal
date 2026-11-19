import { AwsClient } from 'aws4fetch'

/**
 * Practice videos (#875): students upload a short video between lessons, Lionel
 * watches it in admin and comments. The files sit in a PRIVATE Cloudflare R2
 * bucket (no public URL). The browser uploads straight to R2 with a signed PUT
 * link (Vercel refuses request bodies over 4.5 MB), and playback uses a signed
 * GET link that expires after an hour.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (the same R2 key the
 * classroom uses) and PRACTICE_VIDEOS_BUCKET (default studio-practice-videos).
 * The bucket's CORS allows PUT/GET from lessons.musicalbasics.com and
 * localhost:3010/3000 only.
 */

export const PRACTICE_MAX_BYTES = 1024 * 1024 * 1024 // 1 GB: about 5 minutes of phone video
export const PRACTICE_MAX_SECONDS = 6 * 60 // "about 5 minutes", with some slack
export const PRACTICE_NOTE_MAX = 500
export const PRACTICE_COMMENT_MAX = 4000
const UPLOAD_LINK_SECONDS = 60 * 60
const PLAY_LINK_SECONDS = 60 * 60

/** Extensions we accept, by MIME type (phones send mp4 or QuickTime). */
const EXT_BY_TYPE: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
    'video/3gpp': '3gp',
}

export function practiceExtension(contentType: string, fileName: string): string | null {
    const byType = EXT_BY_TYPE[(contentType || '').toLowerCase()]
    if (byType) return byType
    const m = /\.([a-z0-9]{2,4})$/i.exec(fileName || '')
    const ext = m?.[1]?.toLowerCase()
    return ext && Object.values(EXT_BY_TYPE).includes(ext) ? ext : null
}

export function practiceStorageConfigured(): boolean {
    return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

function bucketUrl(key: string): string {
    const bucket = process.env.PRACTICE_VIDEOS_BUCKET || 'studio-practice-videos'
    const path = key.split('/').map(encodeURIComponent).join('/')
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${path}`
}

function client(): AwsClient {
    return new AwsClient({
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        service: 's3',
        region: 'auto',
    })
}

async function presign(key: string, method: 'PUT' | 'GET', seconds: number, extra: Record<string, string> = {}): Promise<string> {
    const url = new URL(bucketUrl(key))
    url.searchParams.set('X-Amz-Expires', String(seconds))
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v)
    const signed = await client().sign(new Request(url, { method }), { aws: { signQuery: true } })
    return signed.url
}

/** A link the browser PUTs the file to (no headers needed beyond Content-Type). */
export function practiceUploadUrl(key: string): Promise<string> {
    return presign(key, 'PUT', UPLOAD_LINK_SECONDS)
}

/** A link that plays the video for an hour. */
export function practicePlayUrl(key: string): Promise<string> {
    return presign(key, 'GET', PLAY_LINK_SECONDS)
}

/** The stored file's size, or null when it isn't there. */
export async function practiceObjectSize(key: string): Promise<number | null> {
    const res = await client().fetch(bucketUrl(key), { method: 'HEAD' })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`R2 HEAD ${res.status}`)
    return Number(res.headers.get('content-length') || 0)
}

export async function deletePracticeObject(key: string): Promise<void> {
    const res = await client().fetch(bucketUrl(key), { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`)
}
