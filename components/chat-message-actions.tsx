"use client"

import { ReactionPickerButton } from "@/components/chat-message-reactions"
import { ReplyMessageButton } from "@/components/chat-message-reply"
import { EditMessageButton } from "@/components/chat-message-edit"
import { DeleteMessageButton } from "@/components/chat-message-delete"

/**
 * The hover cluster that sits beside a message bubble.
 *
 * One component so the three chat surfaces (admin chat, student panel, floating
 * widget) offer the same controls in the same order. React and reply are
 * available on every message; edit and delete only appear for your own, and only
 * when the surface passes their handlers.
 *
 * The cluster is rendered on the inner edge of the bubble — left of your own
 * messages, right of theirs — so it never overlaps text or attachments.
 */
interface MessageActionsProps {
  /** Toggles one of your reactions; resolves to an error string, or null. */
  onReact: (emoji: string) => Promise<string | null>
  onReply: () => void
  /** Own messages only: opens the in-place editor. */
  onEdit?: () => void
  /** Own messages only: soft-deletes the message. */
  onDelete?: () => Promise<string | null>
  /** Shown in the delete confirmation so you can see what you're removing. */
  deletePreview?: string | null
}

export function MessageActions({ onReact, onReply, onEdit, onDelete, deletePreview }: MessageActionsProps) {
  return (
    <div className="flex items-center shrink-0">
      <ReactionPickerButton onReact={onReact} />
      <ReplyMessageButton onClick={onReply} />
      {onEdit && <EditMessageButton onClick={onEdit} />}
      {onDelete && <DeleteMessageButton preview={deletePreview} onConfirm={onDelete} />}
    </div>
  )
}
