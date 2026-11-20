"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getDayChanges } from "@/app/actions/day-changes"
import { lessonWhen, summarizeDayChanges, type DayChange, type DayChangeWho } from "@/lib/day-changes"
import { shiftDateStr, studioToday, studioTzAbbr } from "@/lib/studio-timezone"

const KIND_LABEL: Record<DayChange["kind"], string> = {
    booked: "Booked",
    moved: "Moved",
    cancelled: "Cancelled",
    removed: "Removed",
    logged: "Logged",
    no_show: "No-show",
    missed: "Missed",
    unlogged: "Log undone",
    held: "On hold",
    released: "Released",
    credit: "Credits",
}

const KIND_TONE: Partial<Record<DayChange["kind"], string>> = {
    booked: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    moved: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
    removed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
    missed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
    no_show: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    logged: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    unlogged: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    credit: "bg-muted text-foreground",
}

const WHO_TONE: Record<DayChangeWho, string> = {
    you: "border-foreground/30",
    "the family": "border-sky-400 text-sky-700 dark:text-sky-300",
    "the portal on its own": "border-dashed text-muted-foreground",
}

/**
 * #1005: everything that changed lessons or credits on one day, whoever did
 * it, newest first. Today by default; Yesterday or any date on request.
 * `renderName` lets the caller turn a student's name into a link.
 */
export function ChangesTab({ renderName }: { renderName?: (studentId: string | null, name: string) => ReactNode }) {
    const today = studioToday()
    const [date, setDate] = useState(today)
    const [data, setData] = useState<{ date: string; changes: DayChange[] } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const load = async (day: string) => {
        setLoading(true)
        setError(null)
        try {
            const res = await getDayChanges(day)
            if ("error" in res) setError(res.error)
            else setData(res)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load the changes")
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => { load(date) }, [date])

    const yesterday = shiftDateStr(today, -1)
    const title = date === today ? "Today's changes" : date === yesterday ? "Yesterday's changes" : `Changes on ${lessonWhen(date)}`
    const changes = data?.date === date ? data.changes : []
    const anyDerived = changes.some(c => c.derived)

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="text-2xl font-serif">{title}</CardTitle>
                        <CardDescription>
                            Every lesson booked, moved, cancelled or logged and every credit change, whether you did it, the family did, or the portal did it on its own. Newest first, Eastern time.
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button size="sm" variant={date === today ? "default" : "outline"} onClick={() => setDate(today)}>Today</Button>
                        <Button size="sm" variant={date === yesterday ? "default" : "outline"} onClick={() => setDate(yesterday)}>Yesterday</Button>
                        <Input
                            type="date"
                            value={date}
                            max={today}
                            onChange={(e) => e.target.value && setDate(e.target.value)}
                            className="h-8 w-[150px]"
                            aria-label="Pick a day"
                        />
                        <Button variant="outline" size="sm" onClick={() => load(date)} disabled={loading} aria-label="Refresh">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {error && <p className="text-sm text-red-600 mb-4">Could not load the changes: {error}</p>}
                {!data && !error && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}
                {data && data.date === date && (
                    <>
                        {changes.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">Nothing changed {date === today ? "today" : "that day"} yet.</p>
                        ) : (
                            <>
                                <p className="text-sm text-muted-foreground mb-3">{summarizeDayChanges(changes)}</p>
                                <ul className="divide-y">
                                    {changes.map(c => (
                                        <li key={c.id} className="py-2.5 flex gap-3 items-start">
                                            <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums pt-1">{c.clock}</span>
                                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium mt-0.5 ${KIND_TONE[c.kind] ?? "bg-muted"}`}>
                                                {KIND_LABEL[c.kind]}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm">
                                                    <span className="font-medium">{renderName ? renderName(c.studentId, c.studentName) : c.studentName}</span>
                                                    <span className="text-muted-foreground">: </span>
                                                    {c.what}
                                                </div>
                                                {c.extra && <div className="text-xs text-muted-foreground mt-0.5">{c.extra}</div>}
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-1">
                                                {c.who ? (
                                                    <Badge variant="outline" className={`text-[11px] font-normal ${WHO_TONE[c.who]}`}>{c.who}</Badge>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground">who: not recorded</span>
                                                )}
                                                {c.derived && <span className="text-[10px] text-muted-foreground">from older records</span>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                        <p className="text-xs text-muted-foreground mt-4">
                            Times are {studioTzAbbr()} (studio time).
                            {anyDerived && " Lines marked \"from older records\" were rebuilt from the cancellation log, booking times and credit history, because the portal only started recording every change (and who made it) on Nov 20, 2026."}
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
