"use client"

import { useState } from "react"
import { Ban, Loader2, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/**
 * Shared chat pieces for deleting your own messages.
 *
 * Both the admin chat and the student panel use these so a delete looks and
 * behaves identically on either side of the conversation.
 */

/**
 * Stand-in bubble for a message whose sender deleted it. Rendered for both
 * participants; the server never sends the original content once deleted.
 */
export function DeletedMessageBubble({ isOwn, timestamp }: { isOwn: boolean; timestamp: string }) {
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl border border-dashed bg-muted/40 text-muted-foreground">
        <p className="text-sm italic flex items-center gap-1.5">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          Message deleted
        </p>
        <p className="text-[10px] text-right mt-1 opacity-70">{timestamp}</p>
      </div>
    </div>
  )
}

interface DeleteMessageButtonProps {
  /** Runs the delete; resolves to an error string, or null on success. */
  onConfirm: () => Promise<string | null>
  /** Shown in the confirmation dialog so the user can see what they're removing. */
  preview?: string | null
  className?: string
}

/**
 * Trash affordance shown on your own message bubbles, with a confirmation step.
 * Deliberately spells out that the delete does not recall the email that was
 * sent when the message first went out.
 */
export function DeleteMessageButton({ onConfirm, preview, className }: DeleteMessageButtonProps) {
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async (e: React.MouseEvent) => {
    // Keep the dialog open while the request is in flight so a failure can be shown.
    e.preventDefault()
    setIsDeleting(true)
    setError(null)
    const err = await onConfirm()
    setIsDeleting(false)
    if (err) {
      setError(err)
      return
    }
    setOpen(false)
  }

  const trimmedPreview = preview && preview.length > 140 ? preview.slice(0, 140) + "…" : preview

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true) }}
        title="Delete message"
        aria-label="Delete message"
        className={`opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded ${className || ""}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <AlertDialog open={open} onOpenChange={(next) => { if (!isDeleting) setOpen(next) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be replaced with &ldquo;Message deleted&rdquo; for both of you. The email
              notification that went out when it was sent can&apos;t be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {trimmedPreview && (
            <p className="text-sm bg-muted rounded-md p-3 border max-h-32 overflow-y-auto whitespace-pre-wrap">
              {trimmedPreview}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
