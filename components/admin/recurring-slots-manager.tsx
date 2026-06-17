"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
    getRecurringSlots,
    addRecurringSlot,
    deleteRecurringSlot,
} from "@/app/actions/recurring-slots"

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Slot = { id: string; day_of_week: string; time: string; duration: number }

// Manages ADDITIONAL recurring lesson days (beyond the primary day/time set
// above in the profile). Acts immediately via server actions; not part of the
// parent form submit.
export function RecurringSlotsManager({ studentId }: { studentId: string }) {
    const [slots, setSlots] = useState<Slot[]>([])
    const [loading, setLoading] = useState(true)
    const [day, setDay] = useState("Thursday")
    const [time, setTime] = useState("15:45")
    const [duration, setDuration] = useState("30")
    const [busy, setBusy] = useState(false)
    const { toast } = useToast()

    async function refresh() {
        setLoading(true)
        const res = await getRecurringSlots(studentId)
        if ((res as any).error) toast({ title: "Couldn't load extra days", description: (res as any).error, variant: "destructive" })
        setSlots((res.slots || []) as Slot[])
        setLoading(false)
    }

    useEffect(() => { refresh() /* eslint-disable-next-line */ }, [studentId])

    async function handleAdd() {
        setBusy(true)
        const res = await addRecurringSlot(studentId, day, time, parseInt(duration))
        setBusy(false)
        if ((res as any).error) {
            toast({ title: "Couldn't add day", description: (res as any).error, variant: "destructive" })
            return
        }
        toast({ title: "Recurring day added", description: `${day} at ${time}` })
        refresh()
    }

    async function handleDelete(id: string) {
        const res = await deleteRecurringSlot(id)
        if ((res as any).error) {
            toast({ title: "Couldn't remove day", description: (res as any).error, variant: "destructive" })
            return
        }
        refresh()
    }

    return (
        <div className="space-y-3 rounded-md border p-3">
            <Label className="text-sm font-medium">Additional Recurring Days</Label>
            <p className="text-xs text-muted-foreground">
                Extra weekly lessons beyond the primary day/time above (e.g. a second lesson each week).
            </p>

            {loading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
            ) : slots.length === 0 ? (
                <div className="text-sm text-muted-foreground">No additional days.</div>
            ) : (
                <ul className="space-y-1">
                    {slots.map((s) => (
                        <li key={s.id} className="flex items-center justify-between text-sm rounded bg-muted/40 px-2 py-1">
                            <span>{s.day_of_week} at {s.time} ({s.duration} min)</span>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex items-end gap-2">
                <div className="space-y-1">
                    <Label className="text-xs">Day</Label>
                    <select
                        value={day}
                        onChange={(e) => setDay(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                        {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Time</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Min</Label>
                    <select
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                        <option value="30">30</option>
                        <option value="45">45</option>
                        <option value="60">60</option>
                    </select>
                </div>
                <Button type="button" onClick={handleAdd} disabled={busy} size="sm">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
                </Button>
            </div>
        </div>
    )
}
