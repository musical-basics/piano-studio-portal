"use client"

import type React from "react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { Message } from "@/lib/supabase/database.types"
import { getConversationPage, getNewMessages, markMessagesAsRead, deleteMessage } from "@/app/messages/actions"

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
    /** Reset all state (e.g. when switching conversations). */
    reset: () => void
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
    /** Whether to mark the partner's messages as read after loading. Defaults to true. */
    markRead?: boolean
}

export function usePaginatedConversation(options: Options): UsePaginatedConversationResult {
    const { partnerId, asUserId, onInitialLoaded, markRead = true } = options

    // Keep the latest onInitialLoaded in a ref so loadInitial stays identity-stable
    // even when callers pass an inline arrow (avoids re-running load effects each render).
    const onInitialLoadedRef = useRef(onInitialLoaded)
    onInitialLoadedRef.current = onInitialLoaded

    const [messages, setMessages] = useState<Message[]>([])
    const [isLoadingInitial, setIsLoadingInitial] = useState(false)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false)
    const [hasMore, setHasMore] = useState(false)

    // Mirror of `messages` read inside stable callbacks (poll/loadOlder) so they
    // don't need `messages` in their deps and stay identity-stable across renders
    // (important for the setInterval polling loop).
    const messagesRef = useRef<Message[]>([])
    messagesRef.current = messages

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

    const reset = useCallback(() => {
        setMessages([])
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
        setHasMore(false)
        initialPositionedRef.current = false
        try {
            const { messages: page, hasMore: more } = await getConversationPage(partnerId, { asUserId })
            // These state updates must land in ONE commit: callers hide the list
            // behind a spinner while isLoadingInitial is true, so if the loading
            // flag cleared in a later render than the messages, the bottom-pin
            // layout effect would fire against the spinner DOM and the list
            // would then appear scrolled to the top.
            pendingInitialScroll.current = true
            setMessages(page || [])
            setHasMore(more)
            setIsLoadingInitial(false)
            loadingRef.current = false
            onInitialLoadedRef.current?.()
            if (markRead) await markMessagesAsRead(partnerId, asUserId)
        } catch (err) {
            console.error("usePaginatedConversation: loadInitial failed", err)
        } finally {
            setIsLoadingInitial(false)
            loadingRef.current = false
        }
    }, [partnerId, asUserId, markRead])

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
            const { messages: older, hasMore: more } = await getConversationPage(partnerId, {
                before: oldest.created_at,
                asUserId,
            })
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
                const { messages: page, hasMore: more } = await getConversationPage(partnerId, { asUserId })
                if (page && page.length > 0) {
                    pendingInitialScroll.current = true
                    setMessages(page)
                    setHasMore(more)
                    added = true
                }
            } else {
                const { messages: fresh, deletedIds } = await getNewMessages(partnerId, newest.created_at, asUserId)
                if (fresh && fresh.length > 0) {
                    setMessages((prev) => {
                        const merged = mergeAppend(prev, fresh)
                        if (merged !== prev) added = true
                        return merged
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
            }
            if (added && markRead) await markMessagesAsRead(partnerId, asUserId)
            return added
        } catch (err) {
            console.error("usePaginatedConversation: poll failed", err)
            return false
        }
    }, [partnerId, asUserId, markRead])

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

    return {
        messages,
        isLoadingInitial,
        isLoadingOlder,
        hasMore,
        scrollContainerRef,
        loadInitial,
        loadOlder,
        poll,
        appendLocal,
        remove,
        reset,
    }
}
