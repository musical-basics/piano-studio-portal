"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Shared chat pieces for editing your own messages.
 *
 * Both the admin chat and the student panel use these so an edit looks and
 * behaves identically on either side of the conversation. Editing is text-only:
 * attachments stay as they were sent.
 */

interface EditMessageButtonProps {
  onClick: () => void
  className?: string
}

/** Pencil affordance shown next to your own message bubbles. */
export function EditMessageButton({ onClick, className }: EditMessageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Edit message"
      aria-label="Edit message"
      className={`reveal-on-hover text-muted-foreground hover:text-foreground p-1.5 rounded ${className || ""}`}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}

interface MessageEditorProps {
  initialValue: string
  /** Saves the new text; resolves to an error string, or null on success. */
  onSave: (content: string) => Promise<string | null>
  onCancel: () => void
  /** Rendered inside a dark (own-message) bubble, so the controls invert. */
  onDark?: boolean
}

/**
 * In-place editor that replaces a message bubble's text while editing.
 *
 * Enter saves, Shift+Enter adds a line, Escape cancels — matching the composer
 * below it.
 */
export function MessageEditor({ initialValue, onSave, onCancel, onDark = false }: MessageEditorProps) {
  const [value, setValue] = useState(initialValue)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    // Caret at the end, not over the whole body: the usual edit is a small fix.
    el.setSelectionRange(el.value.length, el.value.length)
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const handleSave = async () => {
    if (isSaving) return
    if (value.trim() === initialValue.trim()) {
      onCancel()
      return
    }
    setIsSaving(true)
    setError(null)
    const err = await onSave(value)
    setIsSaving(false)
    if (err) {
      setError(err)
      return
    }
    onCancel()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="space-y-2 min-w-[200px]">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          e.target.style.height = "auto"
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        rows={1}
        className={`w-full resize-none rounded-md border px-2 py-1.5 text-sm leading-relaxed outline-none focus:ring-1 max-h-48 ${
          onDark
            ? "bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/50 focus:ring-primary-foreground/40"
            : "bg-background border-input focus:ring-ring"
        }`}
      />

      {error && (
        <p className={`text-xs ${onDark ? "text-primary-foreground" : "text-destructive"}`}>{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 px-2" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          <span className="ml-1 text-xs">Save</span>
        </Button>
        <Button
          size="sm"
          variant={onDark ? "secondary" : "ghost"}
          className="h-7 px-2"
          onClick={onCancel}
          disabled={isSaving}
        >
          <X className="h-3.5 w-3.5" />
          <span className="ml-1 text-xs">Cancel</span>
        </Button>
        <span className={`text-[10px] ${onDark ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          Enter to save · Esc to cancel
        </span>
      </div>
    </div>
  )
}

/** "(edited)" marker appended to a bubble's timestamp. */
export function EditedMarker({ className }: { className?: string }) {
  return <span className={className}> · edited</span>
}
