"use client"

import { useState } from "react"
import { SmilePlus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { REACTION_EMOJIS, REACTION_LABELS, type ReactionSummary } from "@/lib/chat-reactions"

/**
 * Shared chat pieces for reacting to a message.
 *
 * Both the admin chat and the student surfaces use these so a reaction looks
 * and behaves identically on either side of the conversation. Unlike editing
 * and deleting, either participant may react to either side's messages.
 */

interface ReactionPickerButtonProps {
  /** Toggles the chosen emoji; resolves to an error string, or null on success. */
  onReact: (emoji: string) => Promise<string | null>
  className?: string
}

/** Smiley affordance that opens the small fixed emoji set. */
export function ReactionPickerButton({ onReact, className }: ReactionPickerButtonProps) {
  const [open, setOpen] = useState(false)

  const handlePick = (emoji: string) => {
    setOpen(false)
    // Fire and forget: the chip updates optimistically, and a rejection rolls
    // itself back, so there is nothing to await here.
    void onReact(emoji)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="React"
          aria-label="React to message"
          className={`reveal-on-hover text-muted-foreground hover:text-foreground p-1.5 rounded ${className || ""}`}
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-auto p-1 flex gap-0.5">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handlePick(emoji)}
            title={REACTION_LABELS[emoji]}
            aria-label={REACTION_LABELS[emoji]}
            className="text-xl leading-none px-2 py-1.5 rounded-md hover:bg-muted transition-transform hover:scale-110"
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

interface ReactionChipsProps {
  reactions: ReactionSummary[] | undefined
  /** Toggles your own reaction for that emoji. */
  onToggle: (emoji: string) => Promise<string | null>
  /** Side of the bubble the chips hang under. */
  align?: "start" | "end"
  className?: string
}

/**
 * The reaction chips under a bubble. Yours are outlined so you can tell at a
 * glance which ones a tap would take back.
 */
export function ReactionChips({ reactions, onToggle, align = "start", className }: ReactionChipsProps) {
  if (!reactions || reactions.length === 0) return null

  return (
    <div
      className={`flex flex-wrap gap-1 mt-1 ${align === "end" ? "justify-end" : "justify-start"} ${className || ""}`}
    >
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => void onToggle(reaction.emoji)}
          title={reaction.mine ? `Remove your ${REACTION_LABELS[reaction.emoji] || "reaction"}` : REACTION_LABELS[reaction.emoji]}
          aria-pressed={reaction.mine}
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors ${
            reaction.mine
              ? "bg-primary/10 border-primary/40 text-foreground"
              : "bg-background border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <span className="text-xs leading-none">{reaction.emoji}</span>
          <span className="tabular-nums">{reaction.count}</span>
        </button>
      ))}
    </div>
  )
}
