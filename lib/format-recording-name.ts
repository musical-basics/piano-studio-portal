/**
 * Shared utility for formatting Dropbox/Zoom recording filenames.
 * Safe to import on both client and server — no 'use server' directive.
 */

/**
 * Convert a raw Zoom/Dropbox filename into a clean, human-readable display name.
 *
 * Handles patterns like:
 *   "2026-05-24 12.30.30 Waris Matharu's Piano Lesson 1234567890.mp4"
 *   "GMT20260524-153000_Recording_1920x1080.mp4"
 *   "shared_screen_with_speaker_view.mp4"
 *   "2026-05-24 - Lesson.mp4"  (already clean from our move script)
 */
export function formatRecordingName(filename: string): string {
    // Remove extension
    let name = filename.replace(/\.(mp4|mov|m4v|avi|mkv)$/i, '')

    // If the whole name is a Zoom-style shared_screen variant, give a generic label
    if (/^(shared_screen|speaker_view|gallery_view|active_speaker)/i.test(name)) {
        return 'Lesson Recording'
    }

    // Strip GMT prefix timestamp: GMT20260524-153000
    name = name.replace(/^GMT\d{8}-\d{6}[_-]?/i, '')

    // Try to extract a date in common formats: YYYY-MM-DD, YYYY_MM_DD, or YYYYMMDD
    const isoMatch = name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/)
    const compactMatch = name.match(/(\d{4})(\d{2})(\d{2})/)
    let formattedDate = ''

    if (isoMatch) {
        const d = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00`)
        if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            })
        }
        // Remove the date part from the name string
        name = name.replace(isoMatch[0], '').trim()
    } else if (compactMatch) {
        const d = new Date(`${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}T12:00:00`)
        if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            })
        }
        name = name.replace(compactMatch[0], '').trim()
    }

    // Strip known Zoom suffixes
    name = name
        .replace(/_?shared_screen_with_gallery_view/gi, '')
        .replace(/_?shared_screen_with_speaker_view/gi, '')
        .replace(/_?active_speaker/gi, '')
        .replace(/_?gallery_view/gi, '')
        .replace(/_?Recording/gi, '')
        .replace(/_?\d{3,4}x\d{3,4}/g, '') // resolution e.g. 1920x1080
        .replace(/\d{10,}/g, '')            // long numeric IDs (Zoom meeting IDs)
        .replace(/[_-]+$/, '')              // trailing dashes/underscores
        .replace(/^\s*[-–_]+\s*/, '')       // leading dashes
        .replace(/\s{2,}/g, ' ')            // collapse multiple spaces
        .trim()

    // If we got a date, build a clean "Lesson – Month D, YYYY" label
    if (formattedDate) {
        // Check if remaining name has meaningful student/lesson context beyond just "Piano Lesson"
        const hasContent = name.length > 2 && !/^(piano\s+lesson|lesson)$/i.test(name.trim())
        return hasContent
            ? `${name.trim()} — ${formattedDate}`
            : `Lesson — ${formattedDate}`
    }

    // Fallback: clean up underscores/dashes and return what we have
    return name.replace(/[_-]+/g, ' ').trim() || 'Lesson Recording'
}
