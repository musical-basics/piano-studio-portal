"use client"

import { Paperclip, Reply, X } from "lucide-react"
import type { Message, MessageReplyContext } from "@/lib/supabase/database.types"

/**
 * Shared chat pieces for replying to a specific message.
 *
 * A reply stores only a pointer to its parent; the quoted line is resolved
 * server-side on every read, so editing the original rewrites the quote and
 * deleting it collapses the quote to "Message deleted".
 */

interface ReplyMessageButtonProps {
  onClick: () => void
  className?: string
}

/** Reply affordance shown next to every message bubble, yours and theirs. */
export function ReplyMessageButton({ onClick, className }: ReplyMessageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Reply"
      aria-label="Reply to message"
      className={`reveal-on-hover text-muted-foreground hover:text-foreground p-1.5 rounded ${className || ""}`}
    >
      <Reply className="h-3.5 w-3.5" />
    </button>
  )
}

/** Short label for whoever wrote a message, from the viewer's perspective. */
export function replyAuthorLabel(senderId: string, selfId: string, partnerName?: string | null): string {
  if (senderId === selfId) return "You"
  return partnerName || "Them"
}

interface QuotedReplyProps {
  reply: MessageReplyContext
  /** Who wrote the quoted message ("You", the student's name, …). */
  authorLabel: string
  /** Rendered inside a dark (own-message) bubble, so the quote inverts. */
  onDark?: boolean
  /** Jumps to the original if it is still on screen. Omit to render it inert. */
  onJump?: () => void
}

/** The quoted strip at the top of a reply bubble. */
export function QuotedReply({ reply, authorLabel, onDark = false, onJump }: QuotedReplyProps) {
  const body = reply.deleted
    ? "Message deleted"
    : reply.excerpt || (reply.has_attachments ? "Attachment" : "")

  return (
    <button
      type="button"
      onClick={onJump}
      disabled={!onJump}
      className={`w-full text-left mb-1.5 pl-2 border-l-2 rounded-r-sm py-0.5 ${
        onDark
          ? "border-primary-foreground/40 bg-primary-foreground/10"
          : "border-primary/40 bg-muted/60"
      } ${onJump ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
    >
      <span
        className={`block text-[10px] font-semibold ${
          onDark ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {authorLabel}
      </span>
      <span
        className={`block text-xs truncate ${reply.deleted ? "italic" : ""} ${
          onDark ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}
      >
        {reply.has_attachments && !reply.deleted && <Paperclip className="inline h-3 w-3 mr-1 -mt-0.5" />}
        {body}
      </span>
    </button>
  )
}

interface ReplyingToBannerProps {
  message: Message
  /** Who wrote the message being replied to. */
  authorLabel: string
  onCancel: () => void
}

/** The "Replying to …" strip that sits above the composer until you send or cancel. */
export function ReplyingToBanner({ message, authorLabel, onCancel }: ReplyingToBannerProps) {
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0
  const preview = message.content && message.content !== "📎 Attachment"
    ? message.content
    : hasAttachments
      ? "Attachment"
      : ""

  return (
    <div className="flex items-start gap-2 px-4 py-2 border-b bg-muted/40">
      <Reply className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground">Replying to {authorLabel}</p>
        <p className="text-xs text-muted-foreground truncate">{preview}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        title="Cancel reply"
        aria-label="Cancel reply"
        className="text-muted-foreground hover:text-foreground p-1 rounded shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * Scroll a quoted message into view and flash it.
 *
 * Only reaches messages already loaded: history is paginated, so an old enough
 * parent simply isn't in the DOM and the jump is a no-op rather than a fetch.
 */
export function jumpToMessage(container: HTMLElement | null, messageId: string) {
  const target = container?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
  if (!target) return
  target.scrollIntoView({ behavior: "smooth", block: "center" })
  target.classList.remove("message-flash")
  // Force a reflow so re-adding the class restarts the animation on a repeat jump.
  void target.offsetWidth
  target.classList.add("message-flash")
  setTimeout(() => target.classList.remove("message-flash"), 1400)
}
