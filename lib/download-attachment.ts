/**
 * Saving chat attachments to disk.
 *
 * Two browser facts shape this:
 *
 *  1. `<a download>` is ignored for cross-origin hrefs. Attachments live on
 *     Supabase Storage, a different origin from the portal, so a plain download
 *     link opens the file in a tab instead of saving it. Storage does honor a
 *     `?download=<name>` query param by replying with `Content-Disposition:
 *     attachment`, which is what makes the link actually save.
 *  2. Fetching the file and saving a blob URL is same-origin from the browser's
 *     point of view, so the filename is respected and no tab is opened. Storage
 *     serves public objects with permissive CORS, so this works; if it ever
 *     doesn't, we fall back to the `?download=` link.
 */

/** Public Storage objects live under this path; only those honor `?download=`. */
const SUPABASE_PUBLIC_OBJECT_PATH = '/storage/v1/object/public/'

/**
 * The URL to hand a browser when the intent is "save this", not "show this".
 *
 * Non-Storage URLs are returned untouched: appending a query param to an
 * arbitrary host is at best useless and at worst breaks a signed link.
 */
export function toDownloadUrl(rawUrl: string, fileName?: string): string {
    try {
        const url = new URL(rawUrl)
        if (!url.pathname.includes(SUPABASE_PUBLIC_OBJECT_PATH)) return rawUrl
        url.searchParams.set('download', fileName || '')
        return url.toString()
    } catch {
        return rawUrl
    }
}

/** Click a synthetic anchor. The only way to start a download from script. */
function clickDownload(href: string, fileName: string, sameOrigin: boolean) {
    const link = document.createElement('a')
    link.href = href
    link.download = fileName
    // A cross-origin href ignores `download`, so it would navigate the page away.
    // Send those to a new tab; the Content-Disposition header does the saving.
    if (!sameOrigin) link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
}

/**
 * Save one attachment, preferring the blob path so the file lands in Downloads
 * with its real name rather than opening in a tab.
 */
export async function downloadAttachment(url: string, fileName: string): Promise<void> {
    try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        clickDownload(objectUrl, fileName, true)
        // Revoked on a delay: revoking synchronously can cancel the save in
        // some browsers before they've read the blob.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (err) {
        console.warn('downloadAttachment: blob fetch failed, falling back to a direct link', err)
        clickDownload(toDownloadUrl(url, fileName), fileName, false)
    }
}

export interface DownloadableAttachment {
    url: string
    name: string
}

/**
 * Save every attachment on a message, one after another.
 *
 * Sequential rather than parallel: browsers throttle or silently drop a burst of
 * simultaneous downloads, and a chat message holds at most five files, so the
 * wait is short. Chrome asks once for permission to save multiple files.
 *
 * `onProgress` reports files finished so the caller can show a counter. One
 * failure doesn't abort the rest; the count of failures comes back at the end.
 */
export async function downloadAllAttachments(
    attachments: DownloadableAttachment[],
    onProgress?: (completed: number, total: number) => void,
): Promise<{ failed: number }> {
    let failed = 0

    for (let i = 0; i < attachments.length; i++) {
        const attachment = attachments[i]
        try {
            await downloadAttachment(attachment.url, attachment.name)
        } catch (err) {
            console.error(`downloadAllAttachments: ${attachment.name} failed`, err)
            failed++
        }
        onProgress?.(i + 1, attachments.length)

        // A short gap between saves: back-to-back anchor clicks are what makes a
        // browser treat the batch as a popup burst and block the tail of it.
        if (i < attachments.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 300))
        }
    }

    return { failed }
}
