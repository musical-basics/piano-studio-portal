"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getUndoLogPreview, undoLessonLog, type UndoLogMode, type UndoLogPreview } from "@/app/actions/undo-log"

interface UndoLogDialogProps {
    /** The logged lesson to undo; null keeps the dialog closed. */
    lessonId: string | null
    onClose: () => void
    /** Called after the log was undone. */
    onDone?: () => void
}

const SOURCE_LABEL: Record<string, string> = {
    zoom_webhook: "logged automatically by Zoom",
    system: "logged automatically",
    agent_log: "logged by the assistant",
    admin_ui: "logged from admin",
}

/**
 * "Undo log" (#794): type a reason, pick what happens to the lesson, and see
 * exactly what changes (credit back, ledger label, and only if ticked, the
 * message to 1 family) before anything is done.
 */
export function UndoLogDialog({ lessonId, onClose, onDone }: UndoLogDialogProps) {
    const { toast } = useToast()
    const [preview, setPreview] = useState<UndoLogPreview | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reason, setReason] = useState("")
    const [mode, setMode] = useState<UndoLogMode>("free")
    const [sendMessage, setSendMessage] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)

    useEffect(() => {
        if (!lessonId) return
        let cancelled = false
        setPreview(null)
        setLoadError(null)
        setOutcome(null)
        setReason("")
        setSendMessage(false)
        getUndoLogPreview(lessonId)
            .then(res => {
                if (cancelled) return
                if ("error" in res) setLoadError(res.error)
                else {
                    setPreview(res)
                    // A free lesson has no charge to undo, only the log itself.
                    setMode(res.isFree ? "unlog" : "free")
                }
            })
            .catch(() => { if (!cancelled) setLoadError("Could not load this lesson") })
        return () => { cancelled = true }
    }, [lessonId])

    const trimmed = reason.trim()
    const canMessage = Boolean(preview && preview.creditBack > 0)

    const handleConfirm = async () => {
        if (!lessonId || !preview || !trimmed) return
        setIsSubmitting(true)
        try {
            const res = await undoLessonLog(lessonId, {
                reason: trimmed,
                mode,
                sendFamilyMessage: canMessage && sendMessage,
                expectedMessage: canMessage && sendMessage ? preview.familyMessage : undefined,
            })
            if ("error" in res) {
                setOutcome({ ok: false, text: res.error })
            } else {
                toast({ title: "Log undone", description: res.summary })
                onDone?.()
                onClose()
            }
        } catch {
            setOutcome({ ok: false, text: "The request failed before an answer came back. Open the lesson again to see whether it was undone before trying again." })
        } finally {
            setIsSubmitting(false)
        }
    }

    const after = preview ? preview.currentCredits + preview.creditBack : 0

    return (
        <Dialog open={Boolean(lessonId)} onOpenChange={(open) => { if (!open && !isSubmitting) onClose() }}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>Undo log</DialogTitle>
                    <DialogDescription>
                        {preview
                            ? `${preview.studentName}, ${preview.lessonLabel}${preview.completedSource && SOURCE_LABEL[preview.completedSource] ? ` (${SOURCE_LABEL[preview.completedSource]})` : ""}`
                            : "Checking the lesson..."}
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
                    <div className="space-y-4 min-w-0">
                        <div className="space-y-2">
                            <Label htmlFor="undo-log-reason">Reason (kept in the credit history)</Label>
                            <Input
                                id="undo-log-reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g. free trial, Zoom charged it"
                                maxLength={200}
                                disabled={isSubmitting}
                            />
                        </div>

                        <RadioGroup value={mode} onValueChange={(v) => setMode(v as UndoLogMode)} className="gap-3" disabled={isSubmitting}>
                            <div className="flex items-start gap-2">
                                <RadioGroupItem value="free" id="undo-mode-free" disabled={preview.isFree} className="mt-0.5" />
                                <Label htmlFor="undo-mode-free" className={`font-normal leading-snug ${preview.isFree ? "text-muted-foreground" : ""}`}>
                                    <span>
                                        <span className="font-medium">It happened, just don&apos;t charge it.</span>{" "}
                                        {preview.isFree
                                            ? "Already free, so this doesn't apply."
                                            : "Stays logged as a free lesson. Nothing shows as unlogged."}
                                    </span>
                                </Label>
                            </div>
                            <div className="flex items-start gap-2">
                                <RadioGroupItem value="unlog" id="undo-mode-unlog" className="mt-0.5" />
                                <Label htmlFor="undo-mode-unlog" className="font-normal leading-snug">
                                    <span>
                                        <span className="font-medium">Undo the log completely.</span>{" "}
                                        Back to unlogged, as before it was logged. It shows in the unlogged lessons until you log or remove it.
                                    </span>
                                </Label>
                            </div>
                        </RadioGroup>

                        <ul className="space-y-1 text-sm list-disc pl-5">
                            <li>
                                {preview.creditBack > 0
                                    ? `Gives back ${preview.creditBack} credit (${preview.currentCredits} to ${after} lessons left), labelled "log undone: ${trimmed || "<reason>"}".`
                                    : "No credit comes back: this lesson was logged free."}
                            </li>
                            <li>Notes, homework and recording stay. The next lesson already booked is not touched.</li>
                        </ul>

                        {canMessage && (
                            <div className="space-y-2 rounded-md border p-3">
                                <div className="flex items-start gap-2">
                                    <Checkbox
                                        id="undo-log-message"
                                        checked={sendMessage}
                                        onCheckedChange={(v) => setSendMessage(v === true)}
                                        disabled={isSubmitting}
                                        className="mt-0.5"
                                    />
                                    <Label htmlFor="undo-log-message" className="font-normal leading-snug">
                                        <span>
                                            Also tell the family (1 family: {preview.studentName}&apos;s portal chat, with the usual email notice
                                            {preview.alsoTexts ? ", and a text" : ""})
                                        </span>
                                    </Label>
                                </div>
                                {sendMessage && (
                                    <p className="text-sm whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3" data-testid="undo-log-message-text">
                                        {preview.familyMessage}
                                    </p>
                                )}
                                {!sendMessage && <p className="text-xs text-muted-foreground pl-6">Off: nothing is sent to the family.</p>}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {outcome || loadError ? (
                        <Button onClick={onClose}>Close</Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                                Not now
                            </Button>
                            <Button variant="destructive" onClick={handleConfirm} disabled={!preview || !trimmed || isSubmitting}>
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : sendMessage && canMessage ? "Undo log and send" : "Undo log"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
