import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { MessageNotification } from '@/components/emails/message-notification'
import type { DbClient } from '@/lib/supabase/admin'
import type { Message, MessageAttachment } from '@/lib/supabase/database.types'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const MAX_ATTACHMENTS_PER_MESSAGE = 5

export type SendMessageArgs = {
    client: DbClient
    senderId: string
    recipientId: string
    content: string
    attachments?: MessageAttachment[] | null
}

export type SendMessageResult = { success?: true; message?: Message; error?: string }

export async function sendMessageCore({
    client,
    senderId,
    recipientId,
    content,
    attachments,
}: SendMessageArgs): Promise<SendMessageResult> {
    if (attachments && attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        return { error: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed per message` }
    }

    const { data, error } = await client
        .from('messages')
        .insert({
            sender_id: senderId,
            recipient_id: recipientId,
            content,
            is_read: false,
            attachments: attachments && attachments.length > 0 ? attachments : null,
        })
        .select()
        .single()

    if (error) {
        console.error('sendMessageCore error:', error)
        return { error: error.message }
    }

    if (resend) {
        try {
            const { data: senderProfile } = await client
                .from('profiles')
                .select('name')
                .eq('id', senderId)
                .single()

            const { data: recipientProfile } = await client
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
            }
        } catch (emailError) {
            console.error('sendMessageCore email failed (non-blocking):', emailError)
        }
    }

    revalidatePath('/student')
    revalidatePath('/admin')

    return { success: true, message: data as Message }
}

export async function getConversationCore(
    client: DbClient,
    userA: string,
    userB: string,
): Promise<{ messages: Message[]; error?: string }> {
    const { data, error } = await client
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userA},recipient_id.eq.${userB}),and(sender_id.eq.${userB},recipient_id.eq.${userA})`)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('getConversationCore error:', error)
        return { messages: [], error: error.message }
    }
    return { messages: (data || []) as Message[] }
}

export async function markMessagesReadCore(
    client: DbClient,
    senderId: string,
    recipientId: string,
): Promise<{ success: true } | { error: string }> {
    const { error } = await client
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', senderId)
        .eq('recipient_id', recipientId)
        .eq('is_read', false)

    if (error) {
        console.error('markMessagesReadCore error:', error)
        return { error: error.message }
    }

    revalidatePath('/student')
    revalidatePath('/admin')
    return { success: true }
}

export type ThreadSummary = {
    student_id: string
    student_name: string | null
    student_email: string | null
    has_unread_from_student: boolean
    unread_count: number
    last_message_at: string | null
    last_message_preview: string | null
    last_message_from: 'student' | 'admin' | null
}

const PREVIEW_LEN = 140

/**
 * Admin-perspective thread summary, one row per student.
 *
 * Unread semantics: `is_read` is a per-recipient flag. Here we count only
 * messages where `sender_id = student AND recipient_id = admin AND is_read = false`.
 * Outbound admin messages are ignored — an admin-sent message having
 * `is_read: false` just means the student hasn't opened it yet.
 */
export async function listThreadsCore(
    client: DbClient,
    adminId: string,
): Promise<{ threads: ThreadSummary[] }> {
    const { students } = await listStudentsWithMessagesCore(client, adminId)

    const threads: ThreadSummary[] = students.map((s: any) => {
        const last = s.lastMessage as
            | { content: string | null; created_at: string; sender_id: string }
            | null

        const lastFrom: 'student' | 'admin' | null = last
            ? last.sender_id === s.id
                ? 'student'
                : 'admin'
            : null

        const preview = last?.content
            ? last.content.length > PREVIEW_LEN
                ? last.content.slice(0, PREVIEW_LEN) + '…'
                : last.content
            : null

        return {
            student_id: s.id,
            student_name: s.name ?? null,
            student_email: s.email ?? null,
            has_unread_from_student: (s.unreadCount ?? 0) > 0,
            unread_count: s.unreadCount ?? 0,
            last_message_at: last?.created_at ?? null,
            last_message_preview: preview,
            last_message_from: lastFrom,
        }
    })

    return { threads }
}

export async function listStudentsWithMessagesCore(client: DbClient, adminId: string) {
    const { data: students, error } = await client
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('name')

    if (error || !students) {
        return { students: [] as any[] }
    }

    const studentsWithMessages = await Promise.all(
        students.map(async (student) => {
            const { data: lastMessage } = await client
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${adminId},recipient_id.eq.${student.id}),and(sender_id.eq.${student.id},recipient_id.eq.${adminId})`)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            const { count: unreadCount } = await client
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', student.id)
                .eq('recipient_id', adminId)
                .eq('is_read', false)

            return {
                ...student,
                lastMessage: lastMessage || null,
                unreadCount: unreadCount || 0,
            }
        }),
    )

    return { students: studentsWithMessages }
}
