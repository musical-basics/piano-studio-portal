import { createClient } from '@/lib/supabase/client'
import {
    createChatUploadTarget,
    createLibraryUploadTarget,
    createSheetMusicUploadTarget,
    type UploadTarget,
} from '@/app/actions/upload-targets'
import type { MessageAttachment } from '@/lib/supabase/database.types'
import { MAX_CHAT_FILE_SIZE, MAX_STORAGE_FILE_SIZE, formatMegabytes } from '@/lib/upload-limits'

/**
 * Browser-side uploads for chat attachments, library files and lesson sheet
 * music. Each one compresses the file if it is a PDF, asks the server for a
 * signed upload ticket, then sends the file directly to storage.
 */

const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

/** Compress PDFs; everything else passes through untouched. */
async function prepareFile(file: File): Promise<File> {
    if (!isPdf(file)) return file
    // Loaded on demand so the PDF library is only downloaded when it's needed.
    const { compressPdfFile } = await import('@/lib/pdf-compress-browser')
    return compressPdfFile(file)
}

function tooLargeMessage(original: File, prepared: File, limit: number): string {
    const compressed = prepared !== original ? ' even after compression' : ''
    return `${original.name} is ${formatMegabytes(prepared.size)}${compressed}. The limit is ${formatMegabytes(limit)}.`
}

/** Send the file to its signed storage path. Resolves to an error message, or null on success. */
async function sendToStorage(file: File, target: UploadTarget): Promise<string | null> {
    // The stored content type comes from the blob itself, so retype it to the
    // one the server chose (MusicXML files arrive with no usable type).
    const body = new File([file], file.name, { type: target.contentType })
    const { error } = await createClient().storage
        .from(target.bucket)
        .uploadToSignedUrl(target.path, target.token, body, { cacheControl: '3600' })

    if (error) {
        console.error('Direct upload failed:', error)
        return `Upload failed: ${error.message}`
    }
    return null
}

export async function uploadChatAttachment(file: File): Promise<{ attachment?: MessageAttachment; error?: string }> {
    try {
        const prepared = await prepareFile(file)
        if (prepared.size > MAX_CHAT_FILE_SIZE) {
            return { error: tooLargeMessage(file, prepared, MAX_CHAT_FILE_SIZE) }
        }

        const { target, error } = await createChatUploadTarget({ name: prepared.name, size: prepared.size, type: prepared.type })
        if (error || !target) return { error: error || 'Upload failed' }

        const uploadError = await sendToStorage(prepared, target)
        if (uploadError) return { error: uploadError }

        return {
            attachment: {
                type: prepared.type.startsWith('image/') ? 'image' : 'file',
                url: target.publicUrl,
                name: file.name,
                size: prepared.size,
            },
        }
    } catch (err: any) {
        console.error('Unexpected error during upload:', err)
        return { error: `Unexpected upload error: ${err?.message || err}` }
    }
}

async function uploadForUrl(
    file: File,
    createTarget: (info: { name: string; size: number; type: string }) => Promise<{ target?: UploadTarget; error?: string }>,
): Promise<{ url?: string; error?: string }> {
    try {
        const prepared = await prepareFile(file)
        if (prepared.size > MAX_STORAGE_FILE_SIZE) {
            return { error: tooLargeMessage(file, prepared, MAX_STORAGE_FILE_SIZE) }
        }

        const { target, error } = await createTarget({ name: prepared.name, size: prepared.size, type: prepared.type })
        if (error || !target) return { error: error || 'Upload failed' }

        const uploadError = await sendToStorage(prepared, target)
        if (uploadError) return { error: uploadError }

        return { url: target.publicUrl }
    } catch (err: any) {
        console.error('Unexpected error during upload:', err)
        return { error: `Unexpected upload error: ${err?.message || err}` }
    }
}

export function uploadLibraryFile(file: File): Promise<{ url?: string; error?: string }> {
    return uploadForUrl(file, createLibraryUploadTarget)
}

export function uploadSheetMusic(file: File, lessonId: string): Promise<{ url?: string; error?: string }> {
    return uploadForUrl(file, (info) => createSheetMusicUploadTarget(info, lessonId))
}
