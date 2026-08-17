'use server'

import { createClient } from '@/lib/supabase/server'
import type { Message, MessageAttachment } from '@/lib/supabase/database.types'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
    sendMessageCore,
    getConversationCore,
    getNewMessagesSinceCore,
    getDeletedMessageIdsCore,
    deleteMessageCore,
    markMessagesReadCore,
    listStudentsWithMessagesCore,
    CONVERSATION_PAGE_SIZE,
} from '@/lib/core/messages'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImpersonationTarget } from '@/app/actions/impersonate'

/**
 * Resolve the effective "self" id for a messaging action.
 *
 * - No asUserId, or asUserId === the real user: act as the real user (the
 *   common case for both real students and the admin's own chat).
 * - asUserId differs: only honored when the caller is an admin actively
 *   impersonating exactly that student (admin previewing the student view).
 *   Otherwise it is ignored and we fall back to the real user, so a student
 *   can never read or write another user's thread by passing an id.
 */
async function resolveSelfId(realUserId: string, asUserId?: string): Promise<string> {
    if (!asUserId || asUserId === realUserId) return realUserId
    const { studentId } = await getImpersonationTarget()
    return studentId === asUserId ? asUserId : realUserId
}

// Allowed file types and size limits for chat attachments
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_FILE_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export type MessageWithProfile = Message & {
    sender_profile?: {
        name: string | null
        role: string
    }
}

export async function sendMessage(recipientId: string, content: string, attachments?: MessageAttachment[], asUserId?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const senderId = await resolveSelfId(user.id, asUserId)

    return sendMessageCore({
        client: supabase as any,
        senderId,
        recipientId,
        content,
        attachments,
    })
}

/**
 * Load a page of a conversation for the reverse-infinite-scroll chat.
 *
 * - First page: call with no `before`; returns the newest `CONVERSATION_PAGE_SIZE`
 *   messages plus `hasMore`.
 * - Older pages: pass the `created_at` of the oldest currently-loaded message as
 *   `before` to fetch the previous page.
 */
export async function getConversationPage(
    partnerId: string,
    opts: { before?: string; limit?: number; asUserId?: string } = {},
): Promise<{ messages: Message[]; hasMore: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { messages: [], hasMore: false, error: 'Unauthorized' }

    const selfId = await resolveSelfId(user.id, opts.asUserId)

    return getConversationCore(supabase as any, selfId, partnerId, {
        limit: opts.limit ?? CONVERSATION_PAGE_SIZE,
        before: opts.before,
    })
}

/**
 * Fetch only messages newer than `after` for the polling loop, so new messages
 * are appended without wiping older pages already loaded in the UI.
 *
 * Also returns the ids of every deleted message in the thread. The append-only
 * cursor can't surface a deletion of an older message, so the client reconciles
 * against this set to turn already-rendered bubbles into tombstones.
 */
export async function getNewMessages(
    partnerId: string,
    after: string,
    asUserId?: string,
): Promise<{ messages: Message[]; deletedIds: string[]; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { messages: [], deletedIds: [], error: 'Unauthorized' }

    const selfId = await resolveSelfId(user.id, asUserId)

    const [fresh, deletedIds] = await Promise.all([
        getNewMessagesSinceCore(supabase as any, selfId, partnerId, after),
        getDeletedMessageIdsCore(supabase as any, selfId, partnerId),
    ])

    return { messages: fresh.messages, deletedIds, error: fresh.error }
}

/**
 * Delete a message you sent.
 *
 * Soft delete: the row is kept for audit, but content and attachments are
 * redacted on every read and the UI shows a "Message deleted" tombstone to both
 * participants. Ownership is enforced in the core against the resolved self id,
 * so passing someone else's message id fails.
 *
 * Note this does not unsend the email notification that went out when the
 * message was first sent.
 */
export async function deleteMessage(
    messageId: string,
    asUserId?: string,
): Promise<{ success?: true; message?: Message; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const selfId = await resolveSelfId(user.id, asUserId)

    // Service-role client: the ownership check above is the authorization, and
    // this avoids opening a client-writable UPDATE policy on `messages`.
    return deleteMessageCore({ client: createAdminClient(), actorId: selfId, messageId })
}

export async function getConversation(partnerId: string, asUserId?: string): Promise<{ messages: Message[], hasMore: boolean, error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { messages: [], hasMore: false, error: 'Unauthorized' }

    const selfId = await resolveSelfId(user.id, asUserId)

    return getConversationCore(supabase as any, selfId, partnerId)
}

export async function markMessagesAsRead(senderId: string, asUserId?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const selfId = await resolveSelfId(user.id, asUserId)

    return markMessagesReadCore(supabase as any, senderId, selfId)
}

/**
 * Get admin user's profile (for students to message)
 */
export async function getAdminProfile() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('role', 'admin')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error) {
        console.error('Get admin error:', error)
        return { admin: null }
    }

    return { admin: data }
}

/**
 * Get all students with their latest message (for admin chat sidebar)
 */
export async function getStudentsWithMessages() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { students: [] }

    return listStudentsWithMessagesCore(supabase as any, user.id)
}

/**
 * Get unread message count for a user
 */
export async function getUnreadCount(): Promise<number> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return 0
    }

    const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)
        .is('deleted_at', null)

    return count || 0
}

/**
 * Upload a file attachment for chat messages
 * Both students and admins can upload attachments
 */
export async function uploadChatAttachment(formData: FormData): Promise<{ attachment?: MessageAttachment; error?: string }> {
    const supabase = await createClient()

    // Get current user (both students and admins can upload)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const file = formData.get('file') as File
    if (!file) {
        return { error: 'No file provided' }
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        return { error: `File size must be under ${MAX_FILE_SIZE / (1024 * 1024)}MB` }
    }

    // Determine file type category
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
    const isDocument = ALLOWED_FILE_TYPES.includes(file.type)

    if (!isImage && !isDocument) {
        return { error: 'Invalid file type. Allowed: images (JPEG, PNG, GIF, WebP) and documents (PDF, Word)' }
    }

    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `chat-attachments/${user.id}/${timestamp}_${sanitizedName}`

    // Use Service Role Key to bypass RLS for storage
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (!serviceKey) {
        console.error('UPLOAD ERROR: SUPABASE_SERVICE_KEY is missing')
        return { error: 'Server configuration error: Missing service key' }
    }

    try {
        const supabaseAdmin = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceKey
        )

        console.log(`Attempting upload with service key for file: ${filePath}`)

        // Upload to Supabase Storage using Admin client
        const { data, error } = await supabaseAdmin.storage
            .from('lesson_materials')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type // Explicitly set content type
            })

        if (error) {
            console.error('Error uploading chat attachment (Supabase Error):', error)
            return { error: `Upload failed: ${error.message}` }
        }

        // Get public URL using Admin client
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('lesson_materials')
            .getPublicUrl(data.path)

        return {
            attachment: {
                type: isImage ? 'image' : 'file',
                url: publicUrl,
                name: file.name,
                size: file.size
            }
        }

    } catch (err: any) {
        console.error('Unexpected error during upload:', err)
        return { error: `Unexpected upload error: ${err.message || err}` }
    }
}
