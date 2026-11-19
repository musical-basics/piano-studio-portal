"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, MessageCircle, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getRunningLatePreview, sendRunningLate, type RunningLatePreview } from "@/app/actions/running-late"
import { DEFAULT_RUNNING_LATE_MINUTES, RUNNING_LATE_MINUTES, runningLateMessage, type RunningLateMinutes } from "@/lib/running-late"

interface RunningLateDialogProps {
    /** Today's lesson Lionel is late for; null keeps the dialog closed. */
    lessonId: string | null
    onClose: () => void
}

/**
 * "Running late" (#788): pick the minutes, see the exact line and who gets it
 * (1 family), then send. Nothing goes out before "Send to 1 family".
 */
export function RunningLateDialog({ lessonId, onClose }: RunningLateDialogProps) {
    const { toast } = useToast()
    const [preview, setPreview] = useState<RunningLatePreview | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [minutes, setMinutes] = useState<RunningLateMinutes>(DEFAULT_RUNNING_LATE_MINUTES)
    const [isSending, setIsSending] = useState(false)
    const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)

    useEffect(() => {
        if (!lessonId) return
        let cancelled = false
        setPreview(null)
        setLoadError(null)
        setOutcome(null)
        setMinutes(DEFAULT_RUNNING_LATE_MINUTES)
        getRunningLatePreview(lessonId)
            .then(res => {
                if (cancelled) return
                if ("error" in res) setLoadError(res.error)
                else setPreview(res)
            })
            .catch(() => { if (!cancelled) setLoadError("Could not load this lesson") })
        return () => { cancelled = true }
    }, [lessonId])

    const message = runningLateMessage(minutes)

    const handleSend = async () => {
        if (!lessonId || !preview) return
        setIsSending(true)
        try {
            const res = await sendRunningLate(lessonId, minutes, message)
            if ("error" in res) {
                setOutcome({ ok: false, text: res.error })
            } else {
                toast({ title: "Running late sent", description: res.summary })
                onClose()
            }
        } catch {
            setOutcome({ ok: false, text: "The request failed before an answer came back. Check the family's chat before trying again." })
        } finally {
            setIsSending(false)
        }
    }

    return (
        <Dialog open={Boolean(lessonId)} onOpenChange={(open) => { if (!open && !isSending) onClose() }}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle>Running late</DialogTitle>
                    <DialogDescription>
                        {preview ? `${preview.studentName}, today at ${preview.lessonTime}` : "Checking the lesson..."}
                    </DialogDescription>
                </DialogHeader>

                {outcome ? (
                    <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${outcome.ok ? "border-green-200 bg-green-50 text-green-800" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                        {outcome.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                        <span>{outcome.text}</span>
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
                            <p className="text-sm font-medium">How late?</p>
                            <div className="flex gap-2" role="radiogroup" aria-label="Minutes late">
                                {RUNNING_LATE_MINUTES.map(m => (
                                    <Button
                                        key={m}
                                        type="button"
                                        role="radio"
                                        aria-checked={minutes === m}
                                        variant={minutes === m ? "default" : "outline"}
                                        className="flex-1"
                                        onClick={() => setMinutes(m)}
                                        disabled={isSending}
                                    >
                                        {m} min
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium">The message, word for word:</p>
                            <p className="text-sm whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3" data-testid="running-late-text">{message}</p>
                        </div>
                        <p className="flex items-start gap-2 text-sm">
                            <MessageCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                            <span>
                                1 family: {preview.studentName}'s portal chat, with the usual email notice
                                {preview.alsoTexts && ". They opted in to texts, so it also goes out as a text"}
                            </span>
                        </p>
                    </div>
                )}

                <DialogFooter>
                    {outcome || loadError ? (
                        <Button onClick={onClose}>Close</Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={isSending}>
                                Not now
                            </Button>
                            <Button onClick={handleSend} disabled={!preview || isSending}>
                                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send to 1 family"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
