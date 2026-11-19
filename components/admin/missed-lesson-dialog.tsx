"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CalendarX, CheckCircle2, DollarSign, Loader2, MessageCircle, XCircle } from "lucide-react"
import { getMissedLessonPreview, markLessonMissed, type MissedLessonPreview } from "@/app/actions/missed-lesson"

interface MissedLessonDialogProps {
    /** The lesson the teacher missed; null keeps the dialog closed. */
    lessonId: string | null
    onClose: () => void
    /** Called after the lesson was removed. */
    onDone?: () => void
}

/**
 * Confirm step for "I missed this": shows exactly what will happen (the message
 * text word for word, the credit, the removal) before anything is done, and then
 * what actually happened. The outcome is shown in the dialog itself, next to
 * the details it refers to.
 */
export function MissedLessonDialog({ lessonId, onClose, onDone }: MissedLessonDialogProps) {
    const [preview, setPreview] = useState<MissedLessonPreview | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)

    useEffect(() => {
        if (!lessonId) return
        let cancelled = false
        setPreview(null)
        setLoadError(null)
        setOutcome(null)
        getMissedLessonPreview(lessonId)
            .then(res => {
                if (cancelled) return
                if ("error" in res) setLoadError(res.error)
                else setPreview(res)
            })
            .catch(() => { if (!cancelled) setLoadError("Could not load this lesson") })
        return () => { cancelled = true }
    }, [lessonId])

    const handleConfirm = async () => {
        if (!lessonId || !preview) return
        setIsSubmitting(true)
        try {
            const result = await markLessonMissed(lessonId, preview.message)
            if ("error" in result) {
                setOutcome({ ok: false, text: result.error })
            } else {
                setOutcome({ ok: true, text: result.summary })
                onDone?.()
            }
        } catch {
            setOutcome({ ok: false, text: "The request failed before an answer came back. Open the lesson's \"I missed this\" again to see what still needs doing; nothing is credited or sent twice." })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={Boolean(lessonId)} onOpenChange={(open) => { if (!open && !isSubmitting) onClose() }}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>I missed this lesson</DialogTitle>
                    <DialogDescription>
                        {preview ? `${preview.studentName}, ${preview.lessonLabel}` : "Checking the lesson..."}
                    </DialogDescription>
                </DialogHeader>

                {outcome ? (
                    <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${outcome.ok ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                        {outcome.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                        <span><span className="font-medium">{outcome.ok ? "Done: " : "Not finished: "}</span>{outcome.text}</span>
                    </div>
                ) : loadError ? (
                    <p className="text-sm text-destructive">{loadError}</p>
                ) : !preview ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <p className="text-sm font-medium">The message:</p>
                            <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/50 p-3">{preview.message}</p>
                        </div>
                        <ul className="space-y-2 text-sm">
                            <li className="flex items-start gap-2">
                                <MessageCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <span>
                                    Sends 1 message to this family (portal chat, with the usual email notice)
                                    {preview.alsoTexts && ". They opted in to texts, so it also goes out as a text"}
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <DollarSign className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <span>
                                    +$15 Account Credit
                                    {preview.alreadyCredited && " (already added by an earlier try, it won't be added again)"}
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CalendarX className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <span>Removes the lesson (no cancellation email)</span>
                            </li>
                        </ul>
                    </div>
                )}

                <DialogFooter>
                    {outcome ? (
                        <Button onClick={onClose}>Close</Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                                Not now
                            </Button>
                            <Button variant="destructive" onClick={handleConfirm} disabled={!preview || isSubmitting}>
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, do all three"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
