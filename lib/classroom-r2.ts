import { AwsClient } from 'aws4fetch'

/**
 * Cloudflare R2, read through its S3 API: the classroom's lesson recordings
 * (bucket musicalbasics-recordings, public at the pub-....r2.dev address kept in
 * classroom_recordings.url) and the size of every bucket on the account.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, the same account
 * key practice videos use (lib/practice-videos.ts); it reaches every bucket.
 * CLASSROOM_R2_BUCKET overrides the recordings bucket's name.
 *
 * Cloudflare's free tier is 10 GB of storage per ACCOUNT, all buckets together
 * (the classroom recordings, families' practice videos and the other sites'
 * buckets on it), averaged over the month; past it each GB costs $0.015 a month.
 */

export const RECORDINGS_BUCKET = process.env.CLASSROOM_R2_BUCKET || 'musicalbasics-recordings'
/** Families' practice videos (#875, lib/practice-videos.ts). */
export const PRACTICE_BUCKET = process.env.PRACTICE_VIDEOS_BUCKET || 'studio-practice-videos'
/** The studio's own buckets: the only ones the storage alert counts (other projects share the account). */
export const STUDIO_BUCKETS = [RECORDINGS_BUCKET, PRACTICE_BUCKET]
/** The account's free storage, in bytes (Cloudflare counts 1 GB = 10^9 bytes here). */
export const R2_FREE_BYTES = 10 * 1e9
export const R2_PRICE_PER_GB_MONTH = 0.015

export type R2Object = { key: string; size: number; lastModified: string }

/** What the move and check jobs need from R2; tests pass a fake. */
export type R2Api = {
    listObjects(bucket: string): Promise<R2Object[]>
    objectSize(bucket: string, key: string): Promise<number | null>
    deleteObject(bucket: string, key: string): Promise<void>
}

export function r2Configured(): boolean {
    return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

function client(): AwsClient {
    if (!r2Configured()) throw new Error('R2 is not set up (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)')
    return new AwsClient({
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        service: 's3',
        region: 'auto',
    })
}

function endpoint(bucket = '', key = ''): string {
    const path = [bucket, ...(key ? key.split('/') : [])].filter(Boolean).map(encodeURIComponent).join('/')
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${path}`
}

function unescapeXml(s: string): string {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function tag(xml: string, name: string): string | null {
    const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))
    return m ? unescapeXml(m[1]) : null
}

export async function listR2Buckets(): Promise<string[]> {
    const res = await client().fetch(endpoint())
    if (!res.ok) throw new Error(`R2 list buckets: HTTP ${res.status}`)
    const xml = await res.text()
    return [...xml.matchAll(/<Bucket>([\s\S]*?)<\/Bucket>/g)].map(m => tag(m[1], 'Name')).filter((n): n is string => !!n)
}

export async function listR2Objects(bucket: string): Promise<R2Object[]> {
    const c = client()
    const out: R2Object[] = []
    let token: string | null = null
    do {
        const url = new URL(endpoint(bucket))
        url.searchParams.set('list-type', '2')
        url.searchParams.set('max-keys', '1000')
        if (token) url.searchParams.set('continuation-token', token)
        const res = await c.fetch(url.toString())
        if (!res.ok) throw new Error(`R2 list ${bucket}: HTTP ${res.status}`)
        const xml = await res.text()
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
            const key = tag(m[1], 'Key')
            if (key) out.push({ key, size: Number(tag(m[1], 'Size') || 0), lastModified: tag(m[1], 'LastModified') || '' })
        }
        token = tag(xml, 'IsTruncated') === 'true' ? tag(xml, 'NextContinuationToken') : null
    } while (token)
    return out
}

/** The object's size, or null when it is not there. */
export async function r2ObjectSize(bucket: string, key: string): Promise<number | null> {
    const res = await client().fetch(endpoint(bucket, key), { method: 'HEAD' })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`R2 HEAD ${key}: HTTP ${res.status}`)
    return Number(res.headers.get('content-length') || 0)
}

export async function deleteR2Object(bucket: string, key: string): Promise<void> {
    const res = await client().fetch(endpoint(bucket, key), { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key}: HTTP ${res.status}`)
}

export const liveR2: R2Api = {
    listObjects: listR2Objects,
    objectSize: r2ObjectSize,
    deleteObject: deleteR2Object,
}

/** The object's key in a public R2 link ("<student>_<ms>.mp4"), or null for any other link. */
export function r2KeyFromUrl(url: string | null | undefined): string | null {
    if (!url || !/r2\.dev|r2\.cloudflarestorage/i.test(url)) return null
    try {
        const key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''))
        return key || null
    } catch {
        return null
    }
}

export type R2Usage = {
    /** The studio's own buckets together (classroom and practice videos): what the alert counts. */
    bytes: number
    files: number
    /** The studio's buckets, biggest first. */
    buckets: { name: string; bytes: number; files: number }[]
    /** Every bucket on the account, other projects' too: information only, never alerted on. */
    account: { bytes: number; buckets: number }
}

/** Sizes the studio's buckets, and every bucket on the account for the info line (a few list calls each). */
export async function measureR2(): Promise<R2Usage> {
    const names = await listR2Buckets()
    const all: R2Usage['buckets'] = []
    for (const name of names) {
        const objects = await listR2Objects(name)
        all.push({ name, bytes: objects.reduce((sum, o) => sum + o.size, 0), files: objects.length })
    }
    const buckets = all.filter(b => STUDIO_BUCKETS.includes(b.name)).sort((a, b) => b.bytes - a.bytes)
    return {
        bytes: buckets.reduce((sum, b) => sum + b.bytes, 0),
        files: buckets.reduce((sum, b) => sum + b.files, 0),
        buckets,
        account: { bytes: all.reduce((sum, b) => sum + b.bytes, 0), buckets: all.length },
    }
}
