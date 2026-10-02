'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_CHAT_FILE_SIZE, MAX_STORAGE_FILE_SIZE, formatMegabytes } from '@/lib/upload-limits'

/**
 * Uploads go from the browser straight to Supabase storage. Sending the file
 * through a server action instead caps it at Vercel's 4.5MB request limit, which
 * rejects the request before any of our code runs.
 *
 * Each action here checks who is asking and what they want to upload, then hands
 * back a one-time signed upload ticket for a path the server chose. The browser
 * can write that one object and nothing else.
 */

const BUCKET = 'lesson_materials'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_FILE_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
// Sheet music. Browsers report these inconsistently (usually '' or
// application/octet-stream), so they are matched on extension instead of MIME
// type and given an explicit content type when uploaded.
const SHEET_MUSIC_CONTENT_TYPES: Record<string, string> = {
    '.musicxml': 'application/vnd.recordare.musicxml+xml',
    '.mxl': 'application/vnd.recordare.musicxml',
    '.xml': 'text/xml',
}

export type UploadFileInfo = {
    name: string
    size: number
    type: string
}

export type UploadTarget = {
    bucket: string
    path: string
    token: string
    publicUrl: string
    contentType: string
}

type UploadTargetResult = { target?: UploadTarget; error?: string }

function validFileInfo(file: UploadFileInfo): boolean {
    return Boolean(file)
        && typeof file.name === 'string' && file.name.length > 0
        && typeof file.type === 'string'
        && typeof file.size === 'number' && Number.isFinite(file.size) && file.size > 0
}

const sanitizeName = (fileName: string) => fileName.replace(/[^a-zA-Z0-9._-]/g, '_')

async function currentUser() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return { supabase, user }
}

async function currentAdmin() {
    const { supabase, user } = await currentUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    return profile?.role === 'admin' ? user : null
}

async function signUpload(path: string, contentType: string): Promise<UploadTargetResult> {
    // Service role: the signed ticket, not the caller's own storage permissions,
    // is what authorises the write.
    const storage = createAdminClient().storage.from(BUCKET)
    const { data, error } = await storage.createSignedUploadUrl(path)
    if (error || !data) {
        console.error('Error creating signed upload URL:', error)
        return { error: `Upload failed: ${error?.message ?? 'could not start the upload'}` }
    }

    const { data: { publicUrl } } = storage.getPublicUrl(path)
    return { target: { bucket: BUCKET, path, token: data.token, publicUrl, contentType } }
}

/** Chat attachment. Students and the admin can both attach files. */
export async function createChatUploadTarget(file: UploadFileInfo): Promise<UploadTargetResult> {
    const { user } = await currentUser()
    if (!user) return { error: 'Unauthorized' }
    if (!validFileInfo(file)) return { error: 'No file provided' }

    if (file.size > MAX_CHAT_FILE_SIZE) {
        return { error: `File size must be under ${formatMegabytes(MAX_CHAT_FILE_SIZE)}` }
    }

    const extension = (file.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase()
    const sheetMusicType = SHEET_MUSIC_CONTENT_TYPES[extension]
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
    const isDocument = ALLOWED_FILE_TYPES.includes(file.type) || Boolean(sheetMusicType)
    if (!isImage && !isDocument) {
        return { error: 'Invalid file type. Allowed: images (JPEG, PNG, GIF, WebP), documents (PDF, Word) and sheet music (MusicXML, MXL)' }
    }

    const path = `chat-attachments/${user.id}/${Date.now()}_${sanitizeName(file.name)}`
    return signUpload(path, sheetMusicType || file.type || 'application/octet-stream')
}

/** Library file. Admin only. */
export async function createLibraryUploadTarget(file: UploadFileInfo): Promise<UploadTargetResult> {
    const admin = await currentAdmin()
    if (!admin) return { error: 'Only admins can upload files' }
    if (!validFileInfo(file)) return { error: 'No file provided' }

    if (file.size > MAX_STORAGE_FILE_SIZE) {
        return { error: `File size must be under ${formatMegabytes(MAX_STORAGE_FILE_SIZE)}` }
    }

    const path = `library/${Date.now()}_${sanitizeName(file.name)}`
    return signUpload(path, file.type || 'application/octet-stream')
}

/** Sheet music attached to a logged lesson. Admin only. */
export async function createSheetMusicUploadTarget(file: UploadFileInfo, lessonId: string): Promise<UploadTargetResult> {
    const admin = await currentAdmin()
    if (!admin) return { error: 'Only admins can upload files' }
    if (!validFileInfo(file)) return { error: 'Missing file or lesson ID' }
    // The id becomes a folder name, so it has to be the uuid it claims to be.
    if (typeof lessonId !== 'string' || !/^[0-9a-f-]{36}$/i.test(lessonId)) {
        return { error: 'Missing file or lesson ID' }
    }

    if (file.size > MAX_STORAGE_FILE_SIZE) {
        return { error: `File size must be under ${formatMegabytes(MAX_STORAGE_FILE_SIZE)}` }
    }

    const path = `sheet_music/${lessonId}/${Date.now()}_${sanitizeName(file.name)}`
    return signUpload(path, file.type || 'application/octet-stream')
}
