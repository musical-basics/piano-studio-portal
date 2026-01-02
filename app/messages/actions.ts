'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Message, MessageAttachment } from '@/lib/supabase/database.types'
import { Resend } from 'resend'
import { MessageNotification } from '@/components/emails/message-notification'

// Initialize Resend (will be undefined if no API key)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Allowed file types and size limits for chat attachments
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_FILE_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_ATTACHMENTS_PER_MESSAGE = 5

export type MessageWithProfile = Message & {
    sender_profile?: {
        name: string | null
        role: string
    }
}

/**
 * Send a message from the current user to another user
 * @param recipientId - The ID of the message recipient
 * @param content - The text content of the message
 * @param attachments - Optional array of attachments (images/files)
 */
export async function sendMessage(recipientId: string, content: string, attachments?: MessageAttachment[]) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Validate attachments count
    if (attachments && attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        return { error: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed per message` }
    }

    // Insert the message
    const { data, error } = await supabase
        .from('messages')
        .insert({
            sender_id: user.id,
            recipient_id: recipientId,
            content,
            is_read: false,
            attachments: attachments && attachments.length > 0 ? attachments : null
        })
        .select()
        .single()

    if (error) {
        console.error('Send message error:', error)
        return { error: error.message }
    }

    // Send email notification (non-blocking, with error handling)
    if (resend) {
        try {
            // Get sender's profile (current user)
            const { data: senderProfile } = await supabase
                .from('profiles')
                .select('name')
                .eq('id', user.id)
                .single()

            // Get recipient's profile
            const { data: recipientProfile } = await supabase
                .from('profiles')
                .select('name, email')
                .eq('id', recipientId)
                .single()

            if (recipientProfile?.email) {
                const rawSender = senderProfile?.name || 'Lionel Yu Piano Studio'
                const finalSenderName = rawSender === 'Professor Lionel' ? 'Professor Lionel Yu' : rawSender

                await resend.emails.send({
                    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                    to: recipientProfile.email,
                    subject: `New message from ${finalSenderName}`,
                    react: MessageNotification({
                        senderName: finalSenderName,
                        messageContent: content.length > 200 ? content.substring(0, 200) + '...' : content,
                        recipientName: recipientProfile.name || 'Student',
                    }),
                })
                console.log('Email notification sent to:', recipientProfile.email)
            }
        } catch (emailError) {
            // Log error but don't block the message from being sent
            console.error('Failed to send email notification:', emailError)
        }
    }

    revalidatePath('/student')
    revalidatePath('/admin')

    return { success: true, message: data }
}

/**
 * Get messages between the current user and another user (conversation)
 */
export async function getConversation(partnerId: string): Promise<{ messages: Message[], error?: string }> {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { messages: [], error: 'Unauthorized' }
    }

    // Get all messages between these two users
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Get conversation error:', error)
        return { messages: [], error: error.message }
    }

    return { messages: data || [] }
}

/**
 * Mark messages from a sender as read
 */
export async function markMessagesAsRead(senderId: string) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Update all unread messages from this sender to the current user
    const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', senderId)
        .eq('recipient_id', user.id)
        .eq('is_read', false)

    if (error) {
        console.error('Mark as read error:', error)
        return { error: error.message }
    }

    revalidatePath('/student')
    revalidatePath('/admin')

    return { success: true }
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

    // Get current user (admin)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { students: [] }
    }

    // Get all student profiles
    const { data: students, error: studentsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('name')

    if (studentsError || !students) {
        return { students: [] }
    }

    // For each student, get their last message and unread count
    const studentsWithMessages = await Promise.all(
        students.map(async (student) => {
            // Get last message in conversation
            const { data: lastMessage } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${user.id},recipient_id.eq.${student.id}),and(sender_id.eq.${student.id},recipient_id.eq.${user.id})`)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            // Count unread messages from student to admin
            const { count: unreadCount } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', student.id)
                .eq('recipient_id', user.id)
                .eq('is_read', false)

            return {
                ...student,
                lastMessage: lastMessage || null,
                unreadCount: unreadCount || 0
            }
        })
    )

    return { students: studentsWithMessages }
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

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
        .from('lesson_materials')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        })

    if (error) {
        console.error('Error uploading chat attachment:', error)
        return { error: error.message }
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('lesson_materials')
        .getPublicUrl(data.path)

    const attachment: MessageAttachment = {
        type: isImage ? 'image' : 'file',
        url: publicUrl,
        name: file.name,
        size: file.size
    }

    return { attachment }
}
