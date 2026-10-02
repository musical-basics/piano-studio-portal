/**
 * Size rules for files uploaded through the portal, shared by the file pickers
 * and the server so the two can't drift apart.
 */

/** Largest attachment a chat message can carry, measured after compression. */
export const MAX_CHAT_FILE_SIZE = 10 * 1024 * 1024

/** PDFs are compressed in the browser before upload, so a larger original is accepted. */
export const MAX_PDF_SOURCE_SIZE = 50 * 1024 * 1024

/** The storage bucket's own ceiling; nothing larger can be stored. */
export const MAX_STORAGE_FILE_SIZE = 50 * 1024 * 1024

export function formatMegabytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
