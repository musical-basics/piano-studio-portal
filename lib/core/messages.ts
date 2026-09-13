import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { MessageNotification } from '@/components/emails/message-notification'
import type { DbClient } from '@/lib/supabase/admin'
import type { Message, MessageAttachment, MessageReplyContext } from '@/lib/supabase/database.types'
import { isReactionEmoji, REACTION_EMOJIS } from '@/lib/chat-reactions'
import type { ReactionMap, ReactionSummary } from '@/lib/chat-reactions'
import { resolveSalutation } from '@/lib/core/students'
import { resolveNotificationEmail } from '@/lib/notification-email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const MAX_ATTACHMENTS_PER_MESSAGE = 5

export type SendMessageArgs = {
    client: DbClient
    senderId: string
    recipientId: string
    content: string
    attachments?: MessageAttachment[] | null
    /** Id of the message being replied to, when this send quotes an earlier one. */
    replyToId?: string | null
}

export type SendMessageResult = { success?: true; message?: Message; error?: string }

export async function sendMessageCore({
    client,
    senderId,
    recipientId,
    content,
    attachments,
    replyToId,
}: SendMessageArgs): Promise<SendMessageResult> {
    if (attachments && attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        return { error: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed per message` }
    }

    // Only a message from this same conversation may be quoted, so a reply can't
    // be used to pull a snippet of an unrelated thread into view.
    let parentId: string | null = null
    if (replyToId) {
        const { data: parent } = await client
            .from('messages')
            .select('id, sender_id, recipient_id')
            .eq('id', replyToId)
            .single()

        const between =
            (parent?.sender_id === senderId && parent?.recipient_id === recipientId) ||
            (parent?.sender_id === recipientId && parent?.recipient_id === senderId)
        if (!parent || !between) {
            return { error: 'You can only reply to a message in this conversation' }
        }
        parentId = parent.id
    }

    const { data, error } = await client
        .from('messages')
        .insert({
            sender_id: senderId,
            recipient_id: recipientId,
            content,
            is_read: false,
            attachments: attachments && attachments.length > 0 ? attachments : null,
            ...(parentId ? { reply_to_id: parentId } : {}),
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

        // Selected with `*` rather than a column list: the notification-email
        // override is a newer column, and a stale schema must not turn a missing
        // column into a failed send.
        const { data: recipientProfile } = await client
            .from('profiles')
            .select('*')
            .eq('id', recipientId)
            .single()

        // Students can redirect their own notifications (e.g. off a parent's
        // inbox onto their own) without changing the login identity.
        const recipientEmail = resolveNotificationEmail(recipientProfile)

        // 1. Resend Email Notification
        if (resend && recipientEmail) {
            try {
                const rawSender = senderProfile?.name || 'Lionel Yu Piano Studio'
                const finalSenderName = rawSender === 'Professor Lionel' ? 'Professor Lionel Yu' : rawSender

                await resend.emails.send({
                    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                    to: recipientEmail,
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

    const [hydrated] = await attachReplyContext(client, [data as Message])
    return { success: true, message: hydrated }
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

/** Longest quoted excerpt shown above a reply before it is cut off. */
const REPLY_EXCERPT_LENGTH = 140

/**
 * Resolve the parent of every reply in a page of messages.
 *
 * The excerpt is looked up rather than copied at send time, which costs one
 * extra query per page but keeps a quote honest: editing the original rewrites
 * every quote of it, and deleting it turns the quote into "Message deleted"
 * instead of preserving text the sender took back.
 *
 * Degrades to "no quotes" if the lookup fails (including before the reply_to_id
 * migration has been applied) rather than failing the whole read.
 */
async function attachReplyContext(client: DbClient, messages: Message[]): Promise<Message[]> {
    const parentIds = Array.from(
        new Set(messages.map((m) => m.reply_to_id).filter((id): id is string => Boolean(id))),
    )
    if (parentIds.length === 0) return messages

    const { data, error } = await client
        .from('messages')
        .select('id, sender_id, content, attachments, deleted_at')
        .in('id', parentIds)

    if (error) {
        console.error('attachReplyContext error:', error)
        return messages
    }

    const byId = new Map<string, MessageReplyContext>()
    for (const row of (data || []) as any[]) {
        const deleted = Boolean(row.deleted_at)
        const content: string = deleted ? '' : row.content || ''
        byId.set(row.id, {
            id: row.id,
            sender_id: row.sender_id,
            excerpt:
                content.length > REPLY_EXCERPT_LENGTH
                    ? content.slice(0, REPLY_EXCERPT_LENGTH) + '…'
                    : content,
            deleted,
            has_attachments: !deleted && Array.isArray(row.attachments) && row.attachments.length > 0,
        })
    }

    return messages.map((m) =>
        m.reply_to_id ? { ...m, reply_to: byId.get(m.reply_to_id) ?? null } : m,
    )
}

/**
 * Reactions for a set of messages, summarized per emoji from `selfId`'s view.
 *
 * Returned as a map keyed by message id rather than folded into the message
 * rows: the chat poll swaps reaction state in on its own cadence, and keeping it
 * out of the row means a reaction never looks like an edit to the message body.
 *
 * Degrades to "no reactions" on error (including before this feature's migration
 * has been applied) so a chat still loads.
 */
export async function getReactionsForMessagesCore(
    client: DbClient,
    messageIds: string[],
    selfId: string,
): Promise<ReactionMap> {
    if (messageIds.length === 0) return {}

    const { data, error } = await client
        .from('message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', messageIds)

    if (error) {
        console.error('getReactionsForMessagesCore error:', error)
        return {}
    }

    const order = REACTION_EMOJIS as readonly string[]
    const map: ReactionMap = {}

    for (const row of (data || []) as any[]) {
        const list = (map[row.message_id] ||= [])
        const existing = list.find((r) => r.emoji === row.emoji)
        if (existing) {
            existing.count += 1
            existing.mine = existing.mine || row.user_id === selfId
        } else {
            list.push({ emoji: row.emoji, count: 1, mine: row.user_id === selfId })
        }
    }

    for (const list of Object.values(map)) {
        list.sort((a, b) => order.indexOf(a.emoji) - order.indexOf(b.emoji))
    }

    return map
}

export type ToggleReactionResult = { success: true; reactions: ReactionSummary[] } | { error: string }

/**
 * Add or remove one of your reactions on a message.
 *
 * Either participant may react to either side of the conversation — unlike edit
 * and delete, which are the sender's alone. Participation is checked here rather
 * than via RLS because the write runs on the service-role client (so an admin
 * previewing a student's view reacts as that student).
 *
 * The emoji must be one the UI offers; the database deliberately doesn't
 * constrain the set, so this is the gate.
 */
export async function toggleReactionCore({
    client,
    actorId,
    messageId,
    emoji,
}: {
    client: DbClient
    actorId: string
    messageId: string
    emoji: string
}): Promise<ToggleReactionResult> {
    if (!isReactionEmoji(emoji)) {
        return { error: 'Unsupported reaction' }
    }

    const { data: message, error: fetchError } = await client
        .from('messages')
        .select('id, sender_id, recipient_id, deleted_at')
        .eq('id', messageId)
        .single()

    if (fetchError || !message) {
        return { error: 'Message not found' }
    }
    if (message.sender_id !== actorId && message.recipient_id !== actorId) {
        return { error: 'You can only react to messages in your own conversations' }
    }
    if (message.deleted_at) {
        return { error: 'This message was deleted' }
    }

    const { data: existing } = await client
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', actorId)
        .eq('emoji', emoji)
        .maybeSingle()

    if (existing) {
        const { error } = await client.from('message_reactions').delete().eq('id', existing.id)
        if (error) {
            console.error('toggleReactionCore delete error:', error)
            return { error: error.message }
        }
    } else {
        const { error } = await client
            .from('message_reactions')
            .insert({ message_id: messageId, user_id: actorId, emoji })
        if (error) {
            console.error('toggleReactionCore insert error:', error)
            return { error: error.message }
        }
    }

    const map = await getReactionsForMessagesCore(client, [messageId], actorId)
    return { success: true, reactions: map[messageId] || [] }
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

export type EditMessageResult = { success: true; message: Message } | { error: string }

/** Longest a message body may be after an edit. Matches what the composer accepts. */
export const MAX_MESSAGE_LENGTH = 5000

/**
 * Edit a message you sent.
 *
 * Ownership is checked here rather than via RLS, for the same reason as the
 * delete path: the update runs on a service-role client, so no client-facing
 * write policy on `content` has to be opened.
 *
 * `edited_at` is stamped so both participants see an "edited" marker. Attachments
 * are untouched — an edit rewrites the text only. A deleted message can't be
 * edited back into existence.
 *
 * The email notification that went out when the message was first sent still
 * quotes the original text; nothing recalls it.
 */
export async function editMessageCore({
    client,
    actorId,
    messageId,
    content,
}: {
    client: DbClient
    actorId: string
    messageId: string
    content: string
}): Promise<EditMessageResult> {
    const trimmed = content.trim()

    const { data: existing, error: fetchError } = await client
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single()

    if (fetchError || !existing) {
        return { error: 'Message not found' }
    }
    if (existing.sender_id !== actorId) {
        return { error: 'You can only edit messages you sent' }
    }
    if (existing.deleted_at) {
        return { error: 'This message was deleted' }
    }

    // An empty body is only meaningful when attachments carry the message; a
    // text-only message edited down to nothing should be deleted instead.
    const hasAttachments = Array.isArray(existing.attachments) && existing.attachments.length > 0
    if (!trimmed && !hasAttachments) {
        return { error: 'Message cannot be empty. Delete it instead.' }
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
        return { error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` }
    }
    if (trimmed === existing.content) {
        return { success: true, message: existing as Message }
    }

    const { data, error } = await client
        .from('messages')
        .update({ content: trimmed, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .select()
        .single()

    if (error) {
        console.error('editMessageCore error:', error)
        return { error: error.message }
    }

    try {
        revalidatePath('/student')
        revalidatePath('/admin')
    } catch (e) {
        // Safe to ignore outside of Next.js server context (e.g. standalone test scripts)
    }

    return { success: true, message: data as Message }
}

/** How many recently-edited messages the poll reconciles against per tick. */
const EDIT_RECONCILE_LIMIT = 25

/**
 * The most recently edited messages in a conversation.
 *
 * Same problem as deletions: the poll cursor is append-only, so an edit to a
 * message already scrolled into view would never reach the other participant.
 * Rather than trusting a client clock to say "edited since when", this returns
 * the newest edits in the thread and lets the client keep whichever rows differ
 * from what it already has. Edits are rare and the partial index on `edited_at`
 * covers the filter.
 */
export async function getEditedMessagesCore(
    client: DbClient,
    userA: string,
    userB: string,
): Promise<Message[]> {
    const { data, error } = await client
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userA},recipient_id.eq.${userB}),and(sender_id.eq.${userB},recipient_id.eq.${userA})`)
        .not('edited_at', 'is', null)
        .order('edited_at', { ascending: false })
        .limit(EDIT_RECONCILE_LIMIT)

    if (error) {
        // Also the path taken when the `edited_at` column hasn't been migrated
        // yet: degrade to "no edits" rather than breaking the whole poll.
        console.error('getEditedMessagesCore error:', error)
        return []
    }
    return attachReplyContext(client, redactDeletedAll((data || []) as Message[]))
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
): Promise<{ messages: Message[]; hasMore: boolean; reactions: ReactionMap; error?: string }> {
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
            return { messages: [], hasMore: false, reactions: {}, error: error.message }
        }
        return { ...(await hydrate(client, redactDeletedAll((data || []) as Message[]), userA)), hasMore: false }
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
        return { messages: [], hasMore: false, reactions: {}, error: error.message }
    }

    const rows = (data || []) as Message[]
    const hasMore = rows.length > opts.limit
    const page = hasMore ? rows.slice(0, opts.limit) : rows
    // Reverse the descending page back to ascending (oldest -> newest) for the UI.
    page.reverse()
    return { ...(await hydrate(client, redactDeletedAll(page), userA)), hasMore }
}

/**
 * Round out a page of raw rows with the two things a bubble needs beyond its own
 * columns: the message it quotes, and the reactions sitting under it.
 */
async function hydrate(
    client: DbClient,
    rows: Message[],
    selfId: string,
): Promise<{ messages: Message[]; reactions: ReactionMap }> {
    const [messages, reactions] = await Promise.all([
        attachReplyContext(client, rows),
        getReactionsForMessagesCore(client, rows.map((m) => m.id), selfId),
    ])
    return { messages, reactions }
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
    return { messages: await attachReplyContext(client, redactDeletedAll((data || []) as Message[])) }
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
