/**
 * Telling a classroom lesson video apart from a Zoom one by its link, and
 * playing either in a <video> tag. Pure: safe in client components.
 *
 * A classroom video starts out on Cloudflare R2 (a pub-....r2.dev link). Since
 * #1020 one older than 60 days moves to its copy in the student's Dropbox
 * folder ("YYYY-MM-DD - Classroom Lesson.mp4", lib/classroom-dropbox-copies.ts)
 * and its link becomes a Dropbox share link to that file. Zoom recordings are
 * Dropbox share links too, but never carry "Classroom Lesson" in their name.
 */

const R2_HOST_RE = /r2\.dev|r2\.cloudflarestorage/i
const CLASSROOM_COPY_IN_LINK_RE = /classroom[\s_+-]*lesson/i

/** The link's file name, decoded ("" when it is not a link). */
function lastPart(url: string): string {
    try {
        return decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    } catch {
        return ''
    }
}

/** True for a classroom lesson video, still on R2 or moved to Dropbox. */
export function isClassroomVideoUrl(url: string | null | undefined): boolean {
    if (!url) return false
    if (R2_HOST_RE.test(url)) return true
    return /dropbox/i.test(url) && CLASSROOM_COPY_IN_LINK_RE.test(lastPart(url))
}

/** True while the video is still on R2. */
export function isR2VideoUrl(url: string | null | undefined): boolean {
    return !!url && R2_HOST_RE.test(url)
}

/**
 * A link a <video> tag can play: a Dropbox share link goes to Dropbox's
 * direct-content host (the same switch components/video-player.tsx makes);
 * anything else is returned as it is.
 */
export function playableVideoUrl(url: string): string {
    try {
        const u = new URL(url)
        if (/(^|\.)dropbox\.com$/i.test(u.hostname)) {
            u.hostname = 'dl.dropboxusercontent.com'
            u.searchParams.set('raw', '1')
            u.searchParams.delete('dl')
            return u.toString()
        }
    } catch {
        // Not a link: hand it back.
    }
    return url
}
