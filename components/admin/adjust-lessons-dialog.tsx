"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Minus, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { adjustLessonCredits, getCreditHistory, type CreditHistoryRow } from "@/app/actions/credit-adjust"

/** What a ledger row's label means, in plain words. */
function describe(row: CreditHistoryRow): string {
    if (row.note && row.source) return `${row.source}: ${row.note}`
    if (row.note) return row.note
    if (row.source) return row.source
    return row.delta < 0 ? "lesson logged (no label)" : "no label"
}

/**
 * #934: add or take lessons with a reason. The change and the reason go into the
 * credit history together. Below the form, that student's latest changes.
 */
export function AdjustLessonsDialog({
    open,
    onOpenChange,
    studentId,
    studentName,
    credits,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    studentId: string
    studentName: string
    credits: number
}) {
    const { toast } = useToast()
    const router = useRouter()
    const [direction, setDirection] = useState<1 | -1>(1)
    const [amount, setAmount] = useState("1")
    const [reason, setReason] = useState("")
    const [saving, setSaving] = useState(false)
    const [current, setCurrent] = useState(credits)
    const [history, setHistory] = useState<CreditHistoryRow[] | null>(null)

    const loadHistory = async () => {
        const res = await getCreditHistory(studentId)
        setHistory("error" in res ? [] : res.rows)
    }

    useEffect(() => {
        if (!open) return
        setDirection(1)
        setAmount("1")
        setReason("")
        setCurrent(credits)
        setHistory(null)
        loadHistory()
    }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

    const n = Math.max(0, Math.trunc(Number(amount) || 0))
    const delta = direction * n
    const valid = n > 0 && reason.trim().length > 0

    const save = async () => {
        setSaving(true)
        const res = await adjustLessonCredits(studentId, delta, reason)
        setSaving(false)
        if ("error" in res) {
            toast({ variant: "destructive", title: "Not changed", description: res.error })
            return
        }
        toast({ title: "Lessons adjusted", description: `${studentName}: ${res.previous} to ${res.now}. The reason is in the credit history.` })
        setCurrent(res.now)
        setReason("")
        setAmount("1")
        await loadHistory()
        router.refresh()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Adjust lessons: {studentName}</DialogTitle>
                    <DialogDescription>
                        Lessons left now: <strong>{current}</strong>. No email goes to the family.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Button type="button" variant={direction === 1 ? "default" : "outline"} size="sm" className="gap-1" onClick={() => setDirection(1)}>
                            <Plus className="h-4 w-4" /> Add
                        </Button>
                        <Button type="button" variant={direction === -1 ? "destructive" : "outline"} size="sm" className="gap-1" onClick={() => setDirection(-1)}>
                            <Minus className="h-4 w-4" /> Take
                        </Button>
                        <Input
                            type="number"
                            min={1}
                            max={100}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-20"
                            aria-label="How many lessons"
                        />
                        <span className="text-sm text-muted-foreground">
                            lesson{n === 1 ? "" : "s"}{n > 0 ? `: ${current} to ${current + delta}` : ""}
                        </span>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="adjust-reason">Reason (goes in the credit history)</Label>
                        <Input
                            id="adjust-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={300}
                            placeholder='e.g. "make-up for the Nov 12 lesson I missed"'
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={save} disabled={!valid || saving}>
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {direction === 1 ? `Add ${n || ""}` : `Take ${n || ""}`}
                    </Button>
                </DialogFooter>

                <div className="border-t pt-3 space-y-2">
                    <p className="text-sm font-medium">Recent changes</p>
                    {history === null ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : history.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
                    ) : (
                        <ul className="space-y-1.5 text-xs">
                            {history.map((r, i) => (
                                <li key={i} className="flex gap-2">
                                    <span className="text-muted-foreground w-24 shrink-0">
                                        {new Date(r.changed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "America/New_York" })}
                                    </span>
                                    <span className={`font-mono w-8 shrink-0 ${r.delta < 0 ? "text-red-600" : "text-green-700"}`}>
                                        {r.delta > 0 ? `+${r.delta}` : r.delta}
                                    </span>
                                    <span className="font-mono w-8 shrink-0 text-muted-foreground">{r.new_credits}</span>
                                    <span className="min-w-0 break-words">{describe(r)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
