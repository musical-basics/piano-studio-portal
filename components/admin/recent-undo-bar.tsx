"use client"

import { useCallback, useEffect, useState } from "react"
import { Undo2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { getRecentUndos, undoCancel, type RecentUndo } from "@/app/actions/recent-undos"
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
 * "Undo" for 10 minutes after Lionel cancels a lesson (#1086), above every
 * admin tab, so a mis-tap anywhere (Today, Scheduled, the calendar) can be
 * reversed. Hidden when there is nothing to undo. The server checks the 10
 * minutes and the slot again before it changes anything.
 */
export function RecentUndoBar({ version, onChanged }: RecentUndoBarProps) {
    const { toast } = useToast()
    const [items, setItems] = useState<RecentUndo[]>([])
    const [now, setNow] = useState(() => Date.now())
    const [confirmCancel, setConfirmCancel] = useState<RecentUndo | null>(null)
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
                                    <span className="font-medium">Cancelled:</span> {item.studentName}, {when(item)}
                                    <span className="ml-2 text-muted-foreground">{undoLeftLabel(undoMsLeft(item.at, now))}</span>
                                </span>
                                <Button size="sm" variant="outline" onClick={() => { setFailure(null); setConfirmCancel(item) }}>
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
        </>
    )
}
