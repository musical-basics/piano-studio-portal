import { Card, CardContent } from "@/components/ui/card"
import { History } from "lucide-react"
import type { LessonHistory, LessonHistoryStatus } from "@/lib/lesson-history"

/**
 * "Lesson history" (#737): read-only list of the family's own lessons, built on
 * the server (lib/lesson-history.ts). Table on wider screens, stacked rows on a
 * phone.
 */

const STATUS: Record<LessonHistoryStatus, { label: string; className: string }> = {
    counted: {
        label: "Counted",
        className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    },
    free: {
        label: "Free",
        className: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
    },
    not_counted: {
        label: "Not counted",
        className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    },
    upcoming: {
        label: "Upcoming",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    },
}

function StatusPill({ status }: { status: LessonHistoryStatus }) {
    const s = STATUS[status]
    return (
        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
            {s.label}
        </span>
    )
}

function formatDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    })
}

function Stat({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold mt-0.5">{value}</p>
        </div>
    )
}

export function LessonHistoryTab({ history }: { history: LessonHistory }) {
    const { rows } = history
    const left = (n: number | null) => (n === null ? "–" : String(n))

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-serif font-semibold">Lesson History</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Every lesson on your account. Times are Eastern.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Lessons booked" value={history.booked} />
                <Stat label="Counted" value={history.counted} />
                <Stat label="Upcoming" value={history.upcoming} />
                <Stat label="Lessons left now" value={left(history.leftNow)} />
            </div>

            {rows.length === 0 ? (
                <Card className="border-2 border-dashed p-12 text-center bg-muted/10">
                    <History className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                    <h3 className="font-semibold text-lg mb-1 font-serif">No lessons yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        Your lessons will be listed here once they are booked.
                    </p>
                </Card>
            ) : (
                <Card className="border-2 py-0 gap-0 overflow-hidden">
                    <CardContent className="p-0">
                        {/* Phone: one stacked row per lesson. */}
                        <ul className="divide-y sm:hidden">
                            {rows.map(r => (
                                <li key={r.id} className="px-4 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-medium text-sm">{formatDay(r.date)}</span>
                                        <StatusPill status={r.status} />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {r.clock}{r.familyClock ? ` (${r.familyClock})` : ""} · {r.duration} min{r.leftAfter !== null ? ` · ${r.leftAfter} left after` : ""}
                                    </p>
                                </li>
                            ))}
                        </ul>

                        {/* Wider screens: a table. */}
                        <table className="hidden sm:table w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                    <th className="px-4 py-2.5 font-medium">Date</th>
                                    <th className="px-4 py-2.5 font-medium">Time</th>
                                    <th className="px-4 py-2.5 font-medium">Length</th>
                                    <th className="px-4 py-2.5 font-medium">Status</th>
                                    <th className="px-4 py-2.5 font-medium text-right">Left after</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {rows.map(r => (
                                    <tr key={r.id}>
                                        <td className="px-4 py-2.5 whitespace-nowrap">{formatDay(r.date)}</td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                            {r.clock}
                                            {r.familyClock && <span className="block text-xs text-muted-foreground">{r.familyClock}</span>}
                                        </td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">{r.duration} min</td>
                                        <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">{left(r.leftAfter)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
                <p><b>Counted</b>: the lesson used one lesson from your balance. <b>Left after</b> is what your balance was after it.</p>
                {history.free > 0 && (
                    <p><b>Free</b>: the lesson was held at no charge to your balance.</p>
                )}
                <p><b>Not counted</b>: nothing was taken from your balance for this lesson.</p>
                <p>A number below zero means lessons taken ahead of your next payment.</p>
            </div>
        </div>
    )
}
