"use client"

import type React from "react"
import { useCallback, useRef, useState } from "react"

/**
 * Drag-and-drop attachments for the chat surfaces.
 *
 * Files can be dropped anywhere on the conversation, not just onto the paperclip.
 * The same accept list and 5-file cap as the file picker applies, and anything
 * rejected is reported back so the UI can say why rather than silently ignoring
 * the drop.
 *
 * `dragDepth` counts enter/leave pairs: dragging across a child element fires
 * `dragleave` on the parent, so a naive boolean makes the overlay flicker.
 */

/** Extensions accepted when a file's MIME type is missing or unhelpful. */
const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx", ".musicxml", ".mxl", ".xml"]

const ACCEPTED_MIME_PREFIXES = ["image/"]
const ACCEPTED_MIME_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

/** Kept in step with MAX_FILE_SIZE in app/messages/actions.ts. */
const MAX_FILE_SIZE = 10 * 1024 * 1024

export function isAcceptedChatFile(file: File): boolean {
    if (ACCEPTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) return true
    if (ACCEPTED_MIME_TYPES.includes(file.type)) return true
    const name = file.name.toLowerCase()
    return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export interface ChatDropResult {
    /** Files that passed the type and size checks, capped to the remaining slots. */
    accepted: File[]
    /** Human-readable reason the rest were dropped, or null if everything was taken. */
    error: string | null
}

/** Filter a batch of files the same way for both the picker and a drop. */
export function screenChatFiles(files: File[], remainingSlots: number): ChatDropResult {
    const accepted: File[] = []
    const rejectedType: string[] = []
    const rejectedSize: string[] = []

    for (const file of files) {
        if (!isAcceptedChatFile(file)) {
            rejectedType.push(file.name)
            continue
        }
        if (file.size > MAX_FILE_SIZE) {
            rejectedSize.push(file.name)
            continue
        }
        accepted.push(file)
    }

    const overflow = Math.max(0, accepted.length - Math.max(0, remainingSlots))
    const taken = accepted.slice(0, Math.max(0, remainingSlots))

    const reasons: string[] = []
    if (rejectedType.length > 0) {
        reasons.push(
            `${rejectedType.join(", ")} ${rejectedType.length === 1 ? "isn't" : "aren't"} a supported file type (images, PDF, Word, MusicXML)`,
        )
    }
    if (rejectedSize.length > 0) {
        reasons.push(`${rejectedSize.join(", ")} is over the 10MB limit`)
    }
    if (overflow > 0) {
        reasons.push(`only 5 attachments can be sent at once, so ${overflow} ${overflow === 1 ? "was" : "were"} skipped`)
    }

    return { accepted: taken, error: reasons.length > 0 ? reasons.join("; ") : null }
}

interface Options {
    /** Called with the files that survived screening. Never called with an empty list. */
    onFiles: (files: File[]) => void
    /** Called with a human-readable reason when some files were rejected. */
    onReject?: (reason: string) => void
    /** How many more attachments the composer can hold. */
    remainingSlots: number
    /** Ignore drops entirely (e.g. while a send is in flight). */
    disabled?: boolean
}

export interface ChatFileDrop {
    /** True while a drag carrying files is over the drop zone. */
    isDragging: boolean
    /** Spread onto the element that should accept drops. */
    dropHandlers: {
        onDragEnter: (e: React.DragEvent) => void
        onDragOver: (e: React.DragEvent) => void
        onDragLeave: (e: React.DragEvent) => void
        onDrop: (e: React.DragEvent) => void
    }
}

export function useChatFileDrop({ onFiles, onReject, remainingSlots, disabled = false }: Options): ChatFileDrop {
    const [isDragging, setIsDragging] = useState(false)
    const dragDepth = useRef(0)

    // A drag of selected text or a link isn't an attachment; only react to files.
    const carriesFiles = (e: React.DragEvent) =>
        Array.from(e.dataTransfer?.types || []).includes("Files")

    const onDragEnter = useCallback((e: React.DragEvent) => {
        if (disabled || !carriesFiles(e)) return
        e.preventDefault()
        dragDepth.current += 1
        setIsDragging(true)
    }, [disabled])

    const onDragOver = useCallback((e: React.DragEvent) => {
        if (disabled || !carriesFiles(e)) return
        // Without this the browser navigates away to the dropped file.
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
    }, [disabled])

    const onDragLeave = useCallback((e: React.DragEvent) => {
        if (disabled || !carriesFiles(e)) return
        e.preventDefault()
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setIsDragging(false)
    }, [disabled])

    const onDrop = useCallback((e: React.DragEvent) => {
        if (disabled) return
        e.preventDefault()
        dragDepth.current = 0
        setIsDragging(false)

        const files = Array.from(e.dataTransfer?.files || [])
        if (files.length === 0) return

        if (remainingSlots <= 0) {
            onReject?.("You can attach up to 5 files per message.")
            return
        }

        const { accepted, error } = screenChatFiles(files, remainingSlots)
        if (accepted.length > 0) onFiles(accepted)
        if (error) onReject?.(error)
    }, [disabled, remainingSlots, onFiles, onReject])

    return {
        isDragging,
        dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
    }
}
