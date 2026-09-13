"use client"

import type React from "react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { Message } from "@/lib/supabase/database.types"
import { getConversationPage, getNewMessages, markMessagesAsRead, deleteMessage, editMessage, toggleMessageReaction } from "@/app/messages/actions"
import { applyToggle, type ReactionMap, type ReactionSummary } from "@/lib/chat-reactions"

/**
 * Reverse-infinite-scroll chat state.
 *
 * Instead of loading a whole conversation on open, this loads the newest page and
 * then:
 *  - the viewport is pinned to the newest message instantly (pre-paint) once the
 *    initial page renders; `loadOlder()` stays inert until that has happened, so
 *    scroll events fired while the chat is settling can't chain-load history.
 *  - `loadOlder()` fetches the previous page when the user scrolls to the top,
 *    preserving the visual scroll position (so the viewport doesn't jump).
 *  - `poll()` fetches only messages newer than the newest one already loaded and
 *    appends them, so the 5s polling loop never wipes older pages that were
 *    scrolled into view.
 *  - `appendLocal()` adds an optimistically-sent message.
 *
 * Merges are de-duplicated by id, so a polled message that overlaps an optimistic
 * one won't appear twice.
 */

export interface UsePaginatedConversationResult {
    messages: Message[]
    /** Emoji reactions for the loaded messages, keyed by message id. */
    reactions: ReactionMap
    isLoadingInitial: boolean
    isLoadingOlder: boolean
    hasMore: boolean
    /** Attach to the scrollable messages container. */
    scrollContainerRef: React.RefObject<HTMLDivElement | null>
    /** Load the newest page for a freshly-selected/opened conversation. */
    loadInitial: () => Promise<void>
    /** Load the previous (older) page, preserving scroll position. */
    loadOlder: () => Promise<void>
    /** Poll for messages newer than the newest loaded one and append them. Returns whether any were added. */
    poll: () => Promise<boolean>
    /** Append a locally-created (optimistic) message. */
    appendLocal: (message: Message) => void
    /**
     * Delete a message the current user sent, turning it into a tombstone
     * immediately and rolling back if the server rejects it. Resolves to an
     * error string on failure, or null on success.
     */
    remove: (messageId: string) => Promise<string | null>
    /**
     * Rewrite the text of a message the current user sent, applying it
     * optimistically and rolling back if the server rejects it. Resolves to an
     * error string on failure, or null on success.
     */
    edit: (messageId: string, content: string) => Promise<string | null>
    /**
     * Add or remove one of your reactions on a message, applying it
     * optimistically and rolling back if the server rejects it. Resolves to an
     * error string on failure, or null on success.
     */
    toggleReaction: (messageId: string, emoji: string) => Promise<string | null>
    /** Reset all state (e.g. when switching conversations). */
    reset: () => void
}

/** How many of the newest loaded messages the poll re-checks reactions for. */
const REACTION_POLL_WINDOW = 80

function sameReactions(a: ReactionSummary[] | undefined, b: ReactionSummary[]): boolean {
    if (!a || a.length !== b.length) return false
    return a.every((r, i) => r.emoji === b[i].emoji && r.count === b[i].count && r.mine === b[i].mine)
}

/**
 * Fold a poll's reaction answer into local state.
 *
 * The answer covers exactly the ids the client asked about, so an id that comes
 * back with nothing has had its last reaction removed — that has to clear the
 * chips rather than leave the stale ones up. Returns the previous object
 * unchanged when nothing moved, so a quiet tick costs no re-render.
 */
function applyReactionUpdate(prev: ReactionMap, incoming: ReactionMap, coveredIds: string[]): ReactionMap {
    const next = { ...prev }
    let changed = false

    for (const id of coveredIds) {
        const list = incoming[id]
        if (!list || list.length === 0) {
            if (prev[id]?.length) {
                delete next[id]
                changed = true
            }
            continue
        }
        if (!sameReactions(prev[id], list)) {
            next[id] = list
            changed = true
        }
    }

    return changed ? next : prev
}

/** Local stand-in for the redaction the server applies to a deleted message. */
function tombstone(message: Message): Message {
    return { ...message, content: "", attachments: null, deleted_at: message.deleted_at ?? new Date().toISOString() }
}

function mergeAppend(existing: Message[], incoming: Message[]): Message[] {
    if (incoming.length === 0) return existing
    const seen = new Set(existing.map((m) => m.id))
    const fresh = incoming.filter((m) => !seen.has(m.id))
    if (fresh.length === 0) return existing
    return [...existing, ...fresh]
}

interface Options {
    /** The other participant's id. Null until resolved (e.g. admin id being fetched). */
    partnerId: string | null
    /** Impersonation target for admin previews; forwarded to the server actions. */
    asUserId?: string
    /**
     * Called after the initial page loads (e.g. to clear an unread badge).
     * Scrolling to the bottom is handled internally; don't scroll here.
     */
    onInitialLoaded?: () => void
    /**
     * Called once the partner's messages have actually been marked read on the
     * server. Use this to clear an unread badge that lives outside the chat.
     */
    onRead?: () => void
    /** Whether to mark the partner's messages as read after loading. Defaults to true. */
    markRead?: boolean
}

export function usePaginatedConversation(options: Options): UsePaginatedConversationResult {
    const { partnerId, asUserId, onInitialLoaded, onRead, markRead = true } = options

    // Keep the latest onInitialLoaded in a ref so loadInitial stays identity-stable
    // even when callers pass an inline arrow (avoids re-running load effects each render).
    const onInitialLoadedRef = useRef(onInitialLoaded)
    onInitialLoadedRef.current = onInitialLoaded

    const onReadRef = useRef(onRead)
    onReadRef.current = onRead

    const [messages, setMessages] = useState<Message[]>([])
    const [reactions, setReactions] = useState<ReactionMap>({})
    const [isLoadingInitial, setIsLoadingInitial] = useState(false)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false)
    const [hasMore, setHasMore] = useState(false)

    // Mirror of `messages` read inside stable callbacks (poll/loadOlder) so they
    // don't need `messages` in their deps and stay identity-stable across renders
    // (important for the setInterval polling loop).
    const messagesRef = useRef<Message[]>([])
    messagesRef.current = messages

    const reactionsRef = useRef<ReactionMap>({})
    reactionsRef.current = reactions

    const hasMoreRef = useRef(false)
    hasMoreRef.current = hasMore

    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // When we prepend older messages we capture the scroll height beforehand so a
    // layout effect can restore the viewport to the same message after the DOM grows.
    const pendingScrollAdjust = useRef<number | null>(null)

    // Set when a fresh page has been fetched and the viewport should jump to the
    // newest message as soon as it renders. Done pre-paint with an instant jump
    // (never a smooth animation: an animated scroll starts at the top of the
    // container, and the scroll events it emits while passing through the
    // near-top zone would trigger loadOlder over and over, interrupting the
    // animation halfway and chain-loading the entire history).
    const pendingInitialScroll = useRef(false)

    // False until the initial bottom-pin has been applied; loadOlder is inert
    // before then, so nothing can chain-load pages while the chat is settling.
    const initialPositionedRef = useRef(false)

    // Guards so overlapping calls (poll firing mid-load, double scroll events) don't race.
    const loadingRef = useRef(false)

    // Filled in below; lets the fill-viewport effect call loadOlder without
    // being declared after it.
    const loadOlderRef = useRef<(() => Promise<void>) | null>(null)

    useLayoutEffect(() => {
        const el = scrollContainerRef.current
        if (pendingInitialScroll.current) {
            pendingInitialScroll.current = false
            pendingScrollAdjust.current = null
            if (el) el.scrollTop = el.scrollHeight
            initialPositionedRef.current = true
            return
        }
        if (pendingScrollAdjust.current == null) return
        if (el) {
            el.scrollTop = el.scrollHeight - pendingScrollAdjust.current
        }
        pendingScrollAdjust.current = null
    }, [messages])

    // If the loaded messages don't overflow the container there's no scrollbar,
    // so the scroll-up trigger can never fire; keep fetching older pages until
    // the container becomes scrollable (or history runs out).
    useLayoutEffect(() => {
        const el = scrollContainerRef.current
        if (!el || !initialPositionedRef.current) return
        if (hasMore && !loadingRef.current && el.scrollHeight <= el.clientHeight) {
            loadOlderRef.current?.()
        }
    }, [messages, hasMore])

    /**
     * Mirror the server-side read flip in local state.
     *
     * The rows currently held were fetched before markMessagesAsRead ran, so
     * without this every unread count derived from them (the panel header badge,
     * the tab dot) would stay lit until the next full refetch.
     */
    const applyReadLocally = useCallback((partner: string) => {
        setMessages((prev) => {
            let changed = false
            const next = prev.map((m) => {
                if (m.sender_id !== partner || m.is_read) return m
                changed = true
                return { ...m, is_read: true }
            })
            return changed ? next : prev
        })
        onReadRef.current?.()
    }, [])

    const reset = useCallback(() => {
        setMessages([])
        setReactions({})
        setHasMore(false)
        setIsLoadingOlder(false)
        loadingRef.current = false
        pendingScrollAdjust.current = null
        pendingInitialScroll.current = false
        initialPositionedRef.current = false
    }, [])

    const loadInitial = useCallback(async () => {
        if (!partnerId) return
        setIsLoadingInitial(true)
        loadingRef.current = true
        // Clear any prior conversation's messages up front so a stale thread can't
        // flash, and so an interleaved poll can't append against the old cursor.
        messagesRef.current = []
        setMessages([])
        setReactions({})
        setHasMore(false)
        initialPositionedRef.current = false
        try {
            const { messages: page, hasMore: more, reactions: pageReactions } = await getConversationPage(partnerId, { asUserId })
            // These state updates must land in ONE commit: callers hide the list
            // behind a spinner while isLoadingInitial is true, so if the loading
            // flag cleared in a later render than the messages, the bottom-pin
            // layout effect would fire against the spinner DOM and the list
            // would then appear scrolled to the top.
            pendingInitialScroll.current = true
            setMessages(page || [])
            setReactions(pageReactions || {})
            setHasMore(more)
            setIsLoadingInitial(false)
            loadingRef.current = false
            onInitialLoadedRef.current?.()
            if (markRead) {
                await markMessagesAsRead(partnerId, asUserId)
                applyReadLocally(partnerId)
            }
        } catch (err) {
            console.error("usePaginatedConversation: loadInitial failed", err)
        } finally {
            setIsLoadingInitial(false)
            loadingRef.current = false
        }
    }, [partnerId, asUserId, markRead, applyReadLocally])

    const loadOlder = useCallback(async () => {
        if (!partnerId || !hasMoreRef.current || loadingRef.current) return
        // Not armed until the initial page has rendered and been pinned to the
        // bottom; scroll events fired before then are layout noise, not the user.
        if (!initialPositionedRef.current) return
        const oldest = messagesRef.current[0]
        if (!oldest) return

        loadingRef.current = true
        setIsLoadingOlder(true)

        // Capture current scroll height so we can restore position after prepending.
        const el = scrollContainerRef.current
        if (el) pendingScrollAdjust.current = el.scrollHeight

        try {
            const { messages: older, hasMore: more, reactions: olderReactions } = await getConversationPage(partnerId, {
                before: oldest.created_at,
                asUserId,
            })
            if (olderReactions && Object.keys(olderReactions).length > 0) {
                setReactions((prev) => ({ ...olderReactions, ...prev }))
            }
            if (older && older.length > 0) {
                setMessages((prev) => {
                    const seen = new Set(prev.map((m) => m.id))
                    const fresh = older.filter((m) => !seen.has(m.id))
                    return [...fresh, ...prev]
                })
            } else {
                pendingScrollAdjust.current = null
            }
            setHasMore(more)
        } catch (err) {
            console.error("usePaginatedConversation: loadOlder failed", err)
            pendingScrollAdjust.current = null
        } finally {
            setIsLoadingOlder(false)
            loadingRef.current = false
        }
    }, [partnerId, asUserId])
    loadOlderRef.current = loadOlder

    const poll = useCallback(async (): Promise<boolean> => {
        // Skip while an initial load / older-page fetch is mid-flight to avoid
        // racing the cursor or appending against a just-switched conversation.
        if (!partnerId || loadingRef.current) return false
        try {
            let added = false
            // Use the newest loaded message as the cursor. If the thread is empty
            // (nothing loaded yet), fall back to a fresh initial page.
            const current = messagesRef.current
            const newest = current[current.length - 1]
            if (!newest) {
                const { messages: page, hasMore: more, reactions: pageReactions } = await getConversationPage(partnerId, { asUserId })
                if (page && page.length > 0) {
                    pendingInitialScroll.current = true
                    setMessages(page)
                    setReactions(pageReactions || {})
                    setHasMore(more)
                    added = true
                }
            } else {
                // Reaction reconciliation asks about the messages on screen. Capped
                // so a long scroll-back doesn't grow the 5s poll's query without
                // bound; older bubbles keep the chips they were loaded with until
                // the thread is reopened.
                const loadedIds = current.slice(-REACTION_POLL_WINDOW).map((m) => m.id)
                const { messages: fresh, deletedIds, edited, reactions: polled } = await getNewMessages(
                    partnerId,
                    newest.created_at,
                    asUserId,
                    loadedIds,
                )
                if (fresh && fresh.length > 0) {
                    setMessages((prev) => {
                        const merged = mergeAppend(prev, fresh)
                        if (merged !== prev) added = true
                        return merged
                    })
                }
                // Reconcile edits the append-only cursor can't see: an edited
                // message may sit anywhere in history. Only rows whose edit
                // stamp differs from what we hold are swapped in, so this is a
                // no-op on the vast majority of ticks.
                if (edited && edited.length > 0) {
                    const byId = new Map(edited.map((m) => [m.id, m]))
                    setMessages((prev) => {
                        let changed = false
                        const next = prev.map((m) => {
                            const fresher = byId.get(m.id)
                            if (!fresher || m.deleted_at || fresher.edited_at === m.edited_at) return m
                            changed = true
                            return fresher
                        })
                        return changed ? next : prev
                    })
                }
                // Reconcile deletions the append-only cursor can't see: a message
                // deleted by the other participant may sit anywhere in history.
                if (deletedIds && deletedIds.length > 0) {
                    const deleted = new Set(deletedIds)
                    setMessages((prev) => {
                        let changed = false
                        const next = prev.map((m) => {
                            if (!deleted.has(m.id) || m.deleted_at) return m
                            changed = true
                            return tombstone(m)
                        })
                        return changed ? next : prev
                    })
                }
                // Reactions, like edits, can land on a message anywhere in the
                // loaded history, so the answer covers every id we asked about
                // (not just the new arrivals) and replaces only what moved.
                if (polled) {
                    const covered = [...loadedIds, ...(fresh || []).map((m) => m.id)]
                    setReactions((prev) => applyReactionUpdate(prev, polled, covered))
                }
            }
            if (added && markRead) {
                await markMessagesAsRead(partnerId, asUserId)
                applyReadLocally(partnerId)
            }
            return added
        } catch (err) {
            console.error("usePaginatedConversation: poll failed", err)
            return false
        }
    }, [partnerId, asUserId, markRead, applyReadLocally])

    const appendLocal = useCallback((message: Message) => {
        setMessages((prev) => mergeAppend(prev, [message]))
    }, [])

    const remove = useCallback(async (messageId: string): Promise<string | null> => {
        const original = messagesRef.current.find((m) => m.id === messageId)
        if (!original || original.deleted_at) return null

        // Optimistic: tombstone it now, restore the original if the server says no.
        setMessages((prev) => prev.map((m) => (m.id === messageId ? tombstone(m) : m)))

        try {
            const result = await deleteMessage(messageId, asUserId)
            if (result.error) {
                setMessages((prev) => prev.map((m) => (m.id === messageId ? original : m)))
                return result.error
            }
            if (result.message) {
                setMessages((prev) => prev.map((m) => (m.id === messageId ? result.message! : m)))
            }
            return null
        } catch (err) {
            console.error("usePaginatedConversation: remove failed", err)
            setMessages((prev) => prev.map((m) => (m.id === messageId ? original : m)))
            return err instanceof Error ? err.message : "Failed to delete message"
        }
    }, [asUserId])

    const edit = useCallback(async (messageId: string, content: string): Promise<string | null> => {
        const original = messagesRef.current.find((m) => m.id === messageId)
        if (!original || original.deleted_at) return null

        const trimmed = content.trim()
        if (trimmed === original.content) return null

        // Optimistic: show the new text now, restore the original if the server says no.
        setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, content: trimmed, edited_at: new Date().toISOString() } : m)),
        )

        try {
            const result = await editMessage(messageId, trimmed, asUserId)
            if (result.error) {
                setMessages((prev) => prev.map((m) => (m.id === messageId ? original : m)))
                return result.error
            }
            if (result.message) {
                setMessages((prev) => prev.map((m) => (m.id === messageId ? result.message! : m)))
            }
            return null
        } catch (err) {
            console.error("usePaginatedConversation: edit failed", err)
            setMessages((prev) => prev.map((m) => (m.id === messageId ? original : m)))
            return err instanceof Error ? err.message : "Failed to edit message"
        }
    }, [asUserId])

    const toggleReaction = useCallback(async (messageId: string, emoji: string): Promise<string | null> => {
        const before = reactionsRef.current[messageId] || []

        // Optimistic: the chip reacts to the tap immediately; a rejection puts
        // the previous set back rather than leaving a phantom reaction up.
        setReactions((prev) => ({ ...prev, [messageId]: applyToggle(before, emoji) }))

        try {
            const result = await toggleMessageReaction(messageId, emoji, asUserId)
            if (result.error) {
                setReactions((prev) => ({ ...prev, [messageId]: before }))
                return result.error
            }
            setReactions((prev) => ({ ...prev, [messageId]: result.reactions || [] }))
            return null
        } catch (err) {
            console.error("usePaginatedConversation: toggleReaction failed", err)
            setReactions((prev) => ({ ...prev, [messageId]: before }))
            return err instanceof Error ? err.message : "Failed to react"
        }
    }, [asUserId])

    return {
        messages,
        reactions,
        isLoadingInitial,
        isLoadingOlder,
        hasMore,
        scrollContainerRef,
        loadInitial,
        loadOlder,
        poll,
        appendLocal,
        remove,
        edit,
        toggleReaction,
        reset,
    }
}
