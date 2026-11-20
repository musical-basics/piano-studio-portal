"use client"

import { useCallback, useEffect, useState } from "react"
import { Undo2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
    getRecentUndos,
    getUndoNoShowPreview,
    undoCancel,
    undoNoShow,
    type RecentUndo,
    type UndoNoShowPreview,
} from "@/app/actions/recent-undos"
import { lessonWhen } from "@/lib/day-changes"
import { studioTzAbbr } from "@/lib/studio-timezone"
import { undoLeftLabel, undoMsLeft } from "@/lib/undo-window"

interface RecentUndoBarProps {
    /** Bumped by the dashboard after a cancel (and other changes), to look again. */
    version: number
    /** After an undo, so the day's schedule and the calendar refresh. */
    onChanged?: () => void
}

function when(item: Pick<RecentUndo, "date" | "time">): string {
    return `${lessonWhen(item.date, item.time)} ${studioTzAbbr(item.date)}`
}

/**
 * "Undo" for 10 minutes after Lionel cancels a lesson (#1086) or marks it a
 * no-show (#1097), above every admin tab, so a mis-tap anywhere (Today,
 * Scheduled, the calendar, the morning email's No-Show) can be reversed.
 * Hidden when there is nothing to undo. The server checks the 10 minutes (and
 * for a cancel, the slot) again before it changes anything.
 */
export function RecentUndoBar({ version, onChanged }: RecentUndoBarProps) {
    const { toast } = useToast()
    const [items, setItems] = useState<RecentUndo[]>([])
    const [now, setNow] = useState(() => Date.now())
    const [confirmCancel, setConfirmCancel] = useState<RecentUndo | null>(null)
    const [noShowId, setNoShowId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [failure, setFailure] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const res = await getRecentUndos()
            if ("items" in res) setItems(res.items)
        } catch {
            // The bar is a convenience; the lesson pages still work without it.
        }
        setNow(Date.now())
    }, [])

    useEffect(() => { load() }, [load, version])

    // Count down, and drop what ran out.
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 15_000)
        return () => clearInterval(t)
    }, [])

    const live = items.filter(i => undoMsLeft(i.at, now) > 0)

    const closeCancel = () => {
        if (busy) return
        setConfirmCancel(null)
        setFailure(null)
    }

    const runUndoCancel = async () => {
        if (!confirmCancel) return
        setBusy(true)
        setFailure(null)
        try {
            const res = await undoCancel(confirmCancel.id)
            if ("error" in res) {
                setFailure(res.error)
            } else {
                toast({ title: "Cancel undone", description: res.summary })
                setConfirmCancel(null)
                onChanged?.()
            }
        } catch {
            setFailure("No answer came back. Refresh the page to see whether the lesson is back before trying again.")
        } finally {
            setBusy(false)
            load()
        }
    }

    return (
        <>
            {live.length > 0 && (
                <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40" data-testid="recent-undo-bar">
                    <ul className="space-y-2">
                        {live.map(item => (
                            <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                                <span className="min-w-0 flex-1">
                                    <span className="font-medium">{item.kind === "cancel" ? "Cancelled:" : "No-show:"}</span> {item.studentName}, {when(item)}
                                    <span className="ml-2 text-muted-foreground">{undoLeftLabel(undoMsLeft(item.at, now))}</span>
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setFailure(null)
                                        if (item.kind === "cancel") setConfirmCancel(item)
                                        else setNoShowId(item.id)
                                    }}
                                >
                                    <Undo2 className="mr-1 h-4 w-4" />
                                    Undo
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <Dialog open={Boolean(confirmCancel)} onOpenChange={(open) => { if (!open) closeCancel() }}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle>Undo this cancel?</DialogTitle>
                        <DialogDescription>
                            {confirmCancel ? `${confirmCancel.studentName}, ${when(confirmCancel)}, ${confirmCancel.duration} min` : ""}
                        </DialogDescription>
                    </DialogHeader>
                    {failure ? (
                        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{failure}</p>
                    ) : (
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                            <li>Books the same time again, with a new Zoom link and a new calendar event</li>
                            <li>Sends 1 family the usual &quot;Lesson Scheduled&quot; email, so they know it is back</li>
                            <li>Puts back the notes, homework and sheet music it had</li>
                            <li>No credit or fee changes: cancelling took none</li>
                        </ul>
                    )}
                    <DialogFooter>
                        {failure ? (
                            <Button onClick={closeCancel}>Close</Button>
                        ) : (
                            <>
                                <Button variant="outline" onClick={closeCancel} disabled={busy}>Not now</Button>
                                <Button onClick={runUndoCancel} disabled={busy}>
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Undo cancel"}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <UndoNoShowDialog
                lessonId={noShowId}
                onClose={() => setNoShowId(null)}
                onDone={() => { onChanged?.(); load() }}
            />
        </>
    )
}

/**
 * Undo a no-show (#1097): a reason (kept in the credit history), what changes,
 * and only if ticked, the message to 1 family, before anything is done.
 */
function UndoNoShowDialog({ lessonId, onClose, onDone }: { lessonId: string | null; onClose: () => void; onDone: () => void }) {
    const { toast } = useToast()
    const [preview, setPreview] = useState<UndoNoShowPreview | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reason, setReason] = useState("")
    const [sendMessage, setSendMessage] = useState(false)
    const [busy, setBusy] = useState(false)
    const [failure, setFailure] = useState<string | null>(null)

    useEffect(() => {
        if (!lessonId) return
        let stale = false
        setPreview(null)
        setLoadError(null)
        setFailure(null)
        setReason("")
        setSendMessage(false)
        getUndoNoShowPreview(lessonId)
            .then(res => {
                if (stale) return
                if ("error" in res) setLoadError(res.error)
                else setPreview(res)
            })
            .catch(() => { if (!stale) setLoadError("Could not load this lesson") })
        return () => { stale = true }
    }, [lessonId])

    const trimmed = reason.trim()
    const close = () => { if (!busy) onClose() }

    const confirm = async () => {
        if (!lessonId || !preview || !trimmed) return
        setBusy(true)
        try {
            const res = await undoNoShow(lessonId, {
                reason: trimmed,
                sendFamilyMessage: sendMessage,
                expectedMessage: sendMessage ? preview.familyMessage : undefined,
            })
            if ("error" in res) {
                setFailure(res.error)
            } else {
                toast({ title: "No-show undone", description: res.summary })
                onDone()
                onClose()
            }
        } catch {
            setFailure("No answer came back. Refresh the page to see whether it was undone before trying again.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={Boolean(lessonId)} onOpenChange={(open) => { if (!open) close() }}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>Undo this no-show?</DialogTitle>
                    <DialogDescription>{preview ? `${preview.studentName}, ${preview.lessonLabel}` : "Checking the lesson..."}</DialogDescription>
                </DialogHeader>

                {failure || loadError ? (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{failure || loadError}</p>
                ) : !preview ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="min-w-0 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="undo-no-show-reason">Reason (kept in the credit history)</Label>
                            <Input
                                id="undo-no-show-reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g. they came, wrong button"
                                maxLength={200}
                                disabled={busy}
                            />
                        </div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                            <li>Gives back 1 credit ({preview.currentCredits} to {preview.currentCredits + 1} lessons left), labelled &quot;no-show undone: {trimmed || "<reason>"}&quot;.</li>
                            <li>The lesson goes back to unlogged, with its notes as before, so you can log it properly.</li>
                        </ul>
                        <div className="space-y-2 rounded-md border p-3">
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="undo-no-show-message"
                                    checked={sendMessage}
                                    onCheckedChange={(v) => setSendMessage(v === true)}
                                    disabled={busy}
                                    className="mt-0.5"
                                />
                                <Label htmlFor="undo-no-show-message" className="font-normal leading-snug">
                                    <span>
                                        Also tell the family (1 family: {preview.studentName}&apos;s portal chat, with the usual email notice
                                        {preview.alsoTexts ? ", and a text" : ""})
                                    </span>
                                </Label>
                            </div>
                            {sendMessage ? (
                                <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">{preview.familyMessage}</p>
                            ) : (
                                <p className="pl-6 text-xs text-muted-foreground">Off: nothing is sent to the family.</p>
                            )}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {failure || loadError ? (
                        <Button onClick={close}>Close</Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={close} disabled={busy}>Not now</Button>
                            <Button onClick={confirm} disabled={!preview || !trimmed || busy}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : sendMessage ? "Undo no-show and send" : "Undo no-show"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
