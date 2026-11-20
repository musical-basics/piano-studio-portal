"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { CalendarPlus, CheckCircle2, HandHeart, Loader2, XCircle } from "lucide-react"
import { bookOwedMakeup, decideOwedMakeup, getOwedMakeupSlots, type OwedSlots } from "@/app/actions/owed-makeups"
import type { OwedMakeup } from "@/lib/core/owed-makeups"
import { daysAgo } from "@/lib/owed-makeups"
import { StudentLink } from "@/components/admin/student-panel"

/** `final`: the row is off the list (booked, settled, not owed). */
type RowOutcome = { ok: boolean; text: string; final?: boolean }

interface OwedMakeupsCardProps {
    makeups: OwedMakeup[]
    /** After a make-up is booked, so the day's schedule and the calendar refresh. */
    onChanged?: () => void
}

/**
 * Families owed a make-up lesson (#1092), on the admin Today tab, oldest first.
 * From "I missed this" (owed) and lessons Lionel cancelled ("Was this on
 * you?": Owed / Not owed). A row stays until a make-up is booked here, he
 * says a lesson booked since was the make-up, or he settles or dismisses it.
 */
export function OwedMakeupsCard({ makeups, onChanged }: OwedMakeupsCardProps) {
    const router = useRouter()
    const [busy, setBusy] = useState<string | null>(null)
    const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({})
    // Answered rows stay on screen with their outcome after the refresh drops them.
    const [answered, setAnswered] = useState<OwedMakeup[]>([])
    const [booking, setBooking] = useState<OwedMakeup | null>(null)
    // A cancel just marked "Owed" shows the owed buttons before the refresh lands.
    const [markedOwed, setMarkedOwed] = useState<Set<string>>(new Set())

    if (makeups.length === 0 && answered.length === 0) return null

    const keep = (row: OwedMakeup) => setAnswered(a => (a.some(x => x.id === row.id) ? a : [...a, row]))

    const decide = async (row: OwedMakeup, decision: "owed" | "not_owed" | "settled", lessonId?: string) => {
        setBusy(`${row.id}:${decision}${lessonId ? ":lesson" : ""}`)
        if (decision !== "owed") keep(row)
        try {
            const res = await decideOwedMakeup(row.id, decision, lessonId ?? null)
            setOutcomes(o => ({ ...o, [row.id]: "error" in res ? { ok: false, text: res.error } : { ok: true, text: res.summary, final: decision !== "owed" } }))
            if (!("error" in res) && decision === "owed") setMarkedOwed(m => new Set(m).add(row.id))
            router.refresh()
        } catch {
            setOutcomes(o => ({ ...o, [row.id]: { ok: false, text: "No answer came back. Refresh the page to see whether it went through." } }))
        } finally {
            setBusy(null)
        }
    }

    const shown = [...makeups, ...answered.filter(a => !makeups.some(m => m.id === a.id))]
    const statusOf = (m: OwedMakeup) => (markedOwed.has(m.id) ? "owed" : m.status)
    const open = makeups.filter(m => !outcomes[m.id]?.final)
    const owed = open.filter(m => statusOf(m) === "owed").length
    const ask = open.filter(m => statusOf(m) === "ask").length
    const title = owed + ask === 0
        ? "Make-ups: all answered"
        : [owed && `${owed === 1 ? "1 family" : `${owed} families`} owed a make-up`, ask && `${ask} cancel${ask === 1 ? "" : "s"} to check`].filter(Boolean).join(", ")

    return (
        <Card className="border-2 border-sky-400/60" data-testid="owed-makeups-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-xl font-serif flex items-center gap-2">
                    <HandHeart className="h-5 w-5" />
                    {title}
                </CardTitle>
                <CardDescription>
                    From &quot;I missed this&quot; and lessons you cancelled, oldest first. A row stays until a make-up is booked.{" "}
                    <b>Book a make-up</b> books one of your free times the usual way (Zoom, the calendar, and the usual &quot;Lesson
                    Scheduled&quot; email to that 1 family). Everything else here sends nothing.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {shown.map(row => {
                    const outcome = outcomes[row.id]
                    const done = Boolean(outcome?.final)
                    const status = statusOf(row)
                    return (
                        <div key={row.id} className="rounded-md border p-3 space-y-2" data-testid="owed-makeup-row">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <p className="font-semibold"><StudentLink id={row.studentId} name={row.studentName} /></p>
                                    <p className="text-sm">{row.what}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {daysAgo(row.createdAt)}, {row.duration} min
                                        {status === "ask" && <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">Was this on you?</span>}
                                    </p>
                                    {!done && status === "owed" && row.bookedSince && (
                                        <p className="mt-1 text-sm flex flex-wrap items-center gap-2" data-testid="owed-booked-since">
                                            <span className="text-muted-foreground">Booked since: {row.bookedSince.label}.</span>
                                            <Button
                                                size="sm"
                                                variant="link"
                                                className="h-auto p-0 text-sky-700 underline dark:text-sky-400"
                                                onClick={() => decide(row, "settled", row.bookedSince!.lessonId)}
                                                disabled={busy !== null}
                                            >
                                                {busy === `${row.id}:settled:lesson` ? <Loader2 className="h-4 w-4 animate-spin" /> : "That was the make-up"}
                                            </Button>
                                        </p>
                                    )}
                                </div>
                                {!done && (
                                    <div className="flex flex-wrap gap-2 shrink-0">
                                        {status === "ask" ? (
                                            <>
                                                <Button size="sm" onClick={() => decide(row, "owed")} disabled={busy !== null}>
                                                    {busy === `${row.id}:owed` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Owed"}
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => decide(row, "not_owed")} disabled={busy !== null}>
                                                    {busy === `${row.id}:not_owed` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Not owed"}
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button
                                                    size="sm"
                                                    className="bg-sky-700 hover:bg-sky-800 text-white"
                                                    onClick={() => setBooking(row)}
                                                    disabled={busy !== null}
                                                >
                                                    <CalendarPlus className="h-4 w-4 mr-1" />Book a make-up
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => decide(row, "settled")} disabled={busy !== null}>
                                                    {busy === `${row.id}:settled` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Settled"}
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => decide(row, "not_owed")} disabled={busy !== null}>
                                                    {busy === `${row.id}:not_owed` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Not owed"}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                            {outcome && (
                                <div className={`flex items-start gap-2 rounded-md border p-2 text-sm ${outcome.ok ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                                    {outcome.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                                    <span>{outcome.text}</span>
                                </div>
                            )}
                        </div>
                    )
                })}
            </CardContent>
            <BookMakeupDialog
                row={booking}
                onClose={() => setBooking(null)}
                onBooked={(row, text) => {
                    keep(row)
                    setOutcomes(o => ({ ...o, [row.id]: { ok: true, text, final: true } }))
                    setBooking(null)
                    onChanged?.()
                    router.refresh()
                }}
            />
        </Card>
    )
}

const LENGTHS = [30, 45, 60, 90]

/** Pick one of Lionel's free times in the next two weeks and book it. */
function BookMakeupDialog({ row, onClose, onBooked }: { row: OwedMakeup | null; onClose: () => void; onBooked: (row: OwedMakeup, text: string) => void }) {
    const [duration, setDuration] = useState(60)
    const [data, setData] = useState<OwedSlots | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [picked, setPicked] = useState("")
    const [isBooking, setIsBooking] = useState(false)
    const [bookError, setBookError] = useState<string | null>(null)

    useEffect(() => {
        if (row) setDuration(LENGTHS.includes(row.duration) ? row.duration : 60)
    }, [row])

    useEffect(() => {
        if (!row) return
        let cancelled = false
        setData(null)
        setLoadError(null)
        setPicked("")
        setBookError(null)
        getOwedMakeupSlots(row.id, duration)
            .then(res => {
                if (cancelled) return
                if ("error" in res) setLoadError(res.error)
                else setData(res)
            })
            .catch(() => { if (!cancelled) setLoadError("The free times could not be loaded just now. Try again in a minute.") })
        return () => { cancelled = true }
    }, [row, duration])

    const byDay = useMemo(() => {
        const groups: { day: string; slots: { key: string; time: string }[] }[] = []
        for (const s of data?.slots || []) {
            const [day, time] = s.label.split(" at ")
            const g = groups.find(x => x.day === day)
            const slot = { key: `${s.date}_${s.time}`, time }
            if (g) g.slots.push(slot)
            else groups.push({ day, slots: [slot] })
        }
        return groups
    }, [data])

    const pickedLabel = data?.slots.find(s => `${s.date}_${s.time}` === picked)?.label ?? null

    const book = async () => {
        if (!row || !picked) return
        const [date, time] = picked.split("_")
        setIsBooking(true)
        setBookError(null)
        try {
            const res = await bookOwedMakeup(row.id, date, time, duration)
            if ("error" in res) setBookError(res.error)
            else onBooked(row, res.summary)
        } catch {
            setBookError("No answer came back. Refresh the page to see whether it was booked before trying again.")
        } finally {
            setIsBooking(false)
        }
    }

    return (
        <Dialog open={Boolean(row)} onOpenChange={(open) => { if (!open && !isBooking) onClose() }}>
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-serif flex items-center gap-2">
                        <CalendarPlus className="h-5 w-5" />
                        Book a make-up{row ? ` for ${row.studentName}` : ""}
                    </DialogTitle>
                    <DialogDescription>
                        {row?.what}. Your free times in the next two weeks (your hours, minus lessons, events and your Google Calendar).
                        Books it the usual way: Zoom, the calendar, and the usual &quot;Lesson Scheduled&quot; email to 1 family.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2 text-sm">
                    <span>Length:</span>
                    {LENGTHS.map(l => (
                        <Button key={l} size="sm" variant={duration === l ? "default" : "outline"} onClick={() => setDuration(l)} disabled={isBooking}>
                            {l} min
                        </Button>
                    ))}
                </div>

                {loadError ? (
                    <p className="text-sm text-destructive">{loadError}</p>
                ) : !data ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : data.slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No free {duration}-minute times in the next two weeks. Use Schedule Lesson instead, then &quot;Settled&quot;.</p>
                ) : (
                    <div className="space-y-4" data-testid="owed-slots">
                        {byDay.map(g => (
                            <div key={g.day} className="space-y-2">
                                <p className="text-sm font-medium">{g.day}</p>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {g.slots.map(s => (
                                        <Button
                                            key={s.key}
                                            type="button"
                                            size="sm"
                                            variant={picked === s.key ? "default" : "outline"}
                                            onClick={() => setPicked(s.key)}
                                            disabled={isBooking}
                                            data-owed-slot={s.key}
                                        >
                                            {s.time}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {pickedLabel && <p className="text-sm">Booking <span className="font-medium">{pickedLabel}</span> ({duration} min).</p>}
                {bookError && <p className="text-sm text-destructive">{bookError}</p>}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isBooking}>Not now</Button>
                    <Button onClick={book} disabled={!picked || isBooking}>
                        {isBooking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Book it"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
