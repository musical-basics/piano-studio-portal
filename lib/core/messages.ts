import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { MessageNotification } from '@/components/emails/message-notification'
import type { DbClient } from '@/lib/supabase/admin'
import type { Message, MessageAttachment } from '@/lib/supabase/database.types'
import { resolveSalutation } from '@/lib/core/students'

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

    // Consolidated profile retrieval for notifications (email & webhook)
    try {
        const { data: senderProfile } = await client
            .from('profiles')
            .select('name, role')
            .eq('id', senderId)
            .single()

        const { data: recipientProfile } = await client
            .from('profiles')
            .select('name, email, role')
            .eq('id', recipientId)
            .single()

        // 1. Resend Email Notification
        if (resend && recipientProfile?.email) {
            try {
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
            } catch (emailError) {
                console.error('sendMessageCore email failed (non-blocking):', emailError)
            }
        }

        // 2. Webhook Notification for inbound student messages
        const webhookUrl = process.env.COMMANDER_MESSAGE_WEBHOOK_URL
        const webhookSecret = process.env.COMMANDER_MESSAGE_WEBHOOK_SECRET

        if (webhookUrl && webhookSecret) {
            const isStudentToAdmin = senderProfile?.role === 'student' && recipientProfile?.role === 'admin'
            if (isStudentToAdmin) {
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 5000)

                try {
                    const payload = {
                        event: 'piano_studio.message.created',
                        message: {
                            id: data.id,
                            student_id: senderId,
                            student_name: senderProfile?.name || null,
                            content: data.content,
                            created_at: data.created_at,
                        },
                    }

                    const response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Piano-Studio-Webhook-Secret': webhookSecret,
                        },
                        body: JSON.stringify(payload),
                        signal: controller.signal,
                    })

                    clearTimeout(timeoutId)
                    if (!response.ok) {
                        console.error(`[Webhook] Failed to deliver message webhook: ${response.status} ${response.statusText}`)
                    } else {
                        console.log(`[Webhook] Message webhook delivered successfully to ${webhookUrl}`)
                    }
                } catch (webhookError: any) {
                    clearTimeout(timeoutId)
                    console.error('[Webhook] Message webhook delivery failed (non-blocking):', webhookError.message || webhookError)
                }
            }
        }
    } catch (notificationError) {
        console.error('sendMessageCore notifications failed (non-blocking):', notificationError)
    }

    try {
        revalidatePath('/student')
        revalidatePath('/admin')
    } catch (e) {
        // Safe to ignore outside of Next.js server context (e.g. standalone test scripts)
    }

    return { success: true, message: data as Message }
}

/**
 * Strip the payload of a soft-deleted message.
 *
 * The row is retained in the database for audit, but content and attachments
 * must never reach a client once the sender has deleted it. Every read path
 * funnels through here so the UI only ever sees a tombstone.
 */
function redactDeleted(message: Message): Message {
    if (!message?.deleted_at) return message
    return { ...message, content: '', attachments: null }
}

function redactDeletedAll(messages: Message[]): Message[] {
    return messages.map(redactDeleted)
}

export type DeleteMessageResult = { success: true; message: Message } | { error: string }

/**
 * Soft-delete a message. Only the sender may delete their own message.
 *
 * Ownership is checked here rather than via RLS: the update runs on a
 * service-role client, so no client-facing write policy (which could not
 * restrict *which* columns change) has to be opened on `messages`.
 *
 * Idempotent: deleting an already-deleted message succeeds without rewriting
 * `deleted_at`, so the original deletion timestamp is preserved.
 */
export async function deleteMessageCore({
    client,
    actorId,
    messageId,
}: {
    client: DbClient
    actorId: string
    messageId: string
}): Promise<DeleteMessageResult> {
    const { data: existing, error: fetchError } = await client
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single()

    if (fetchError || !existing) {
        return { error: 'Message not found' }
    }
    if (existing.sender_id !== actorId) {
        return { error: 'You can only delete messages you sent' }
    }
    if (existing.deleted_at) {
        return { success: true, message: redactDeleted(existing as Message) }
    }

    const { data, error } = await client
        .from('messages')
        .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
        .eq('id', messageId)
        .select()
        .single()

    if (error) {
        console.error('deleteMessageCore error:', error)
        return { error: error.message }
    }

    try {
        revalidatePath('/student')
        revalidatePath('/admin')
    } catch (e) {
        // Safe to ignore outside of Next.js server context (e.g. standalone test scripts)
    }

    return { success: true, message: redactDeleted(data as Message) }
}

/**
 * Ids of every soft-deleted message in a conversation.
 *
 * The chat poll is append-only (it only asks for messages newer than the newest
 * one loaded), so a deletion of an OLDER message would otherwise never reach the
 * other participant's open tab. Returning the full deleted set each poll is
 * self-healing and stays cheap: deletions are rare, the partial index on
 * `deleted_at` covers the filter, and only ids come back over the wire.
 */
export async function getDeletedMessageIdsCore(
    client: DbClient,
    userA: string,
    userB: string,
): Promise<string[]> {
    const { data, error } = await client
        .from('messages')
        .select('id')
        .or(`and(sender_id.eq.${userA},recipient_id.eq.${userB}),and(sender_id.eq.${userB},recipient_id.eq.${userA})`)
        .not('deleted_at', 'is', null)

    if (error) {
        console.error('getDeletedMessageIdsCore error:', error)
        return []
    }
    return (data || []).map((row: any) => row.id as string)
}

/** Default number of messages loaded per page for the reverse-infinite-scroll chat. */
export const CONVERSATION_PAGE_SIZE = 15

interface GetConversationOptions {
    /** Max messages to return. Omit to fetch the entire conversation (legacy behavior). */
    limit?: number
    /**
     * Cursor for reverse pagination: only return messages strictly OLDER than this
     * ISO timestamp. Used to load the next page when scrolling up.
     */
    before?: string
}

/**
 * Fetch a conversation between two users, oldest -> newest.
 *
 * With no options, returns the whole history (unchanged legacy behavior).
 *
 * With `limit`, returns the newest `limit` messages (optionally older than
 * `before`) as a page, still ordered ascending for rendering, plus `hasMore`
 * indicating whether older messages remain beyond this page. This powers the
 * "load older on scroll up" behavior.
 */
export async function getConversationCore(
    client: DbClient,
    userA: string,
    userB: string,
    opts: GetConversationOptions = {},
): Promise<{ messages: Message[]; hasMore: boolean; error?: string }> {
    const between = `and(sender_id.eq.${userA},recipient_id.eq.${userB}),and(sender_id.eq.${userB},recipient_id.eq.${userA})`

    // Legacy path: no pagination requested -> fetch everything ascending.
    if (opts.limit == null) {
        const { data, error } = await client
            .from('messages')
            .select('*')
            .or(between)
            .order('created_at', { ascending: true })

        if (error) {
            console.error('getConversationCore error:', error)
            return { messages: [], hasMore: false, error: error.message }
        }
        return { messages: redactDeletedAll((data || []) as Message[]), hasMore: false }
    }

    // Paginated path: grab the newest page (descending), fetching one extra row
    // to detect whether older messages remain, then reverse for rendering.
    let query = client
        .from('messages')
        .select('*')
        .or(between)
        .order('created_at', { ascending: false })

    if (opts.before) {
        query = query.lt('created_at', opts.before)
    }

    const { data, error } = await query.limit(opts.limit + 1)

    if (error) {
        console.error('getConversationCore error:', error)
        return { messages: [], hasMore: false, error: error.message }
    }

    const rows = (data || []) as Message[]
    const hasMore = rows.length > opts.limit
    const page = hasMore ? rows.slice(0, opts.limit) : rows
    // Reverse the descending page back to ascending (oldest -> newest) for the UI.
    page.reverse()
    return { messages: redactDeletedAll(page), hasMore }
}

/**
 * Fetch messages in a conversation strictly NEWER than `after` (ISO timestamp),
 * oldest -> newest. Used by the polling loop to append only new messages without
 * clobbering older pages already loaded into state.
 */
export async function getNewMessagesSinceCore(
    client: DbClient,
    userA: string,
    userB: string,
    after: string,
): Promise<{ messages: Message[]; error?: string }> {
    const { data, error } = await client
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userA},recipient_id.eq.${userB}),and(sender_id.eq.${userB},recipient_id.eq.${userA})`)
        .gt('created_at', after)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('getNewMessagesSinceCore error:', error)
        return { messages: [], error: error.message }
    }
    return { messages: redactDeletedAll((data || []) as Message[]) }
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

    try {
        revalidatePath('/student')
        revalidatePath('/admin')
    } catch (e) {
        // Safe to ignore outside of Next.js server context (e.g. standalone test scripts)
    }
    return { success: true }
}

export type ThreadSummary = {
    student_id: string
    student_name: string | null
    student_email: string | null
    student_preferred_name: string | null
    parent_contact_name: string | null
    contact_salutation: string | null
    primary_contact_role: 'student' | 'parent' | null
    salutation: string | null
    has_unread_from_student: boolean
    unread_count: number
    last_message_at: string | null
    last_message_preview: string | null
    last_message_from: 'student' | 'admin' | null
}

const PREVIEW_LEN = 140

/** Sidebar/thread-list stand-in for a message whose sender deleted it. */
export const DELETED_PREVIEW = 'Message deleted'

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
            | { content: string | null; created_at: string; sender_id: string; deleted_at?: string | null }
            | null

        const lastFrom: 'student' | 'admin' | null = last
            ? last.sender_id === s.id
                ? 'student'
                : 'admin'
            : null

        const preview = last?.deleted_at
            ? DELETED_PREVIEW
            : last?.content
                ? last.content.length > PREVIEW_LEN
                    ? last.content.slice(0, PREVIEW_LEN) + '…'
                    : last.content
                : null

        return {
            student_id: s.id,
            student_name: s.name ?? null,
            student_email: s.email ?? null,
            student_preferred_name: s.preferred_name ?? null,
            parent_contact_name: s.parent_contact_name ?? null,
            contact_salutation: s.contact_salutation ?? null,
            primary_contact_role: (s.primary_contact_role ?? null) as 'student' | 'parent' | null,
            salutation: resolveSalutation(s),
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

            // A message the student deleted before it was opened must not keep
            // the unread badge lit — there is nothing left to read.
            const { count: unreadCount } = await client
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', student.id)
                .eq('recipient_id', adminId)
                .eq('is_read', false)
                .is('deleted_at', null)

            return {
                ...student,
                lastMessage: lastMessage ? redactDeleted(lastMessage as Message) : null,
                unreadCount: unreadCount || 0,
            }
        }),
    )

    return { students: studentsWithMessages }
}
