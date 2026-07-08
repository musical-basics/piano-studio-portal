"use client"

import type React from "react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { Message } from "@/lib/supabase/database.types"
import { getConversationPage, getNewMessages, markMessagesAsRead } from "@/app/messages/actions"

/**
 * Reverse-infinite-scroll chat state.
 *
 * Instead of loading a whole conversation on open, this loads the newest page and
 * then:
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
    /** Reset all state (e.g. when switching conversations). */
    reset: () => void
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
    /** Called after the initial page loads, so the caller can scroll to bottom. */
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

    // Guards so overlapping calls (poll firing mid-load, double scroll events) don't race.
    const loadingRef = useRef(false)

    useLayoutEffect(() => {
        if (pendingScrollAdjust.current == null) return
        const el = scrollContainerRef.current
        if (el) {
            el.scrollTop = el.scrollHeight - pendingScrollAdjust.current
        }
        pendingScrollAdjust.current = null
    }, [messages])

    const reset = useCallback(() => {
        setMessages([])
        setHasMore(false)
        setIsLoadingOlder(false)
        loadingRef.current = false
        pendingScrollAdjust.current = null
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
        try {
            const { messages: page, hasMore: more } = await getConversationPage(partnerId, { asUserId })
            setMessages(page || [])
            setHasMore(more)
            if (markRead) await markMessagesAsRead(partnerId, asUserId)
            onInitialLoadedRef.current?.()
        } catch (err) {
            console.error("usePaginatedConversation: loadInitial failed", err)
        } finally {
            setIsLoadingInitial(false)
            loadingRef.current = false
        }
    }, [partnerId, asUserId, markRead])

    const loadOlder = useCallback(async () => {
        if (!partnerId || !hasMoreRef.current || loadingRef.current) return
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
                    setMessages(page)
                    setHasMore(more)
                    added = true
                }
            } else {
                const { messages: fresh } = await getNewMessages(partnerId, newest.created_at, asUserId)
                if (fresh && fresh.length > 0) {
                    setMessages((prev) => {
                        const merged = mergeAppend(prev, fresh)
                        if (merged !== prev) added = true
                        return merged
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
        reset,
    }
}
