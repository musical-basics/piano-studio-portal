"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getBalances } from "@/app/actions/balances"
import {
    DEFAULT_SORT,
    creditWords,
    lessonWords,
    nextSort,
    paymentWords,
    sortBalances,
    type BalanceRow,
    type SortDir,
    type SortKey,
} from "@/lib/balances"
import { STUDIO_TZ, studioToday, studioTzAbbr } from "@/lib/studio-timezone"
import { StudentLink } from "@/components/admin/student-panel"

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
    { key: "name", label: "Family" },
    { key: "credits", label: "Lessons left", className: "text-right" },
    { key: "last", label: "Last lesson" },
    { key: "next", label: "Next lesson" },
    { key: "payment", label: "Next payment" },
]

const CREDIT_TONE = {
    owes: "text-red-600 dark:text-red-400 font-semibold",
    zero: "text-amber-600 dark:text-amber-400 font-semibold",
    low: "text-amber-600 dark:text-amber-400",
    ok: "",
}

const PAYMENT_TONE = { ok: "", warn: "", muted: "text-muted-foreground" }

/**
 * #935: every active family on one list, sortable by any column (click a
 * header; again to flip). Read only: clicking a family opens their chat.
 */
export function BalancesTable({
    rows,
    onOpen,
    today = studioToday(),
}: {
    rows: BalanceRow[]
    onOpen?: (studentId: string) => void
    today?: string
}) {
    const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(DEFAULT_SORT)
    const sorted = useMemo(() => sortBalances(rows, sort.key, sort.dir), [rows, sort])

    if (rows.length === 0) {
        return <p className="text-sm text-muted-foreground py-6 text-center">No active families.</p>
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    {COLUMNS.map(col => {
                        const active = sort.key === col.key
                        const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown
                        return (
                            <TableHead
                                key={col.key}
                                className={col.className}
                                aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                            >
                                <button
                                    type="button"
                                    onClick={() => setSort(s => nextSort(s, col.key))}
                                    className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
                                >
                                    {col.label}
                                    <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} />
                                </button>
                            </TableHead>
                        )
                    })}
                </TableRow>
            </TableHeader>
            <TableBody>
                {sorted.map(row => {
                    const credit = creditWords(row.credits)
                    const pay = paymentWords(row.payment, today)
                    return (
                        <TableRow
                            key={row.studentId}
                            className={onOpen ? "cursor-pointer" : undefined}
                            onClick={onOpen ? () => onOpen(row.studentId) : undefined}
                            onKeyDown={onOpen ? (e) => { if (e.key === "Enter") onOpen(row.studentId) } : undefined}
                            tabIndex={onOpen ? 0 : undefined}
                            title={onOpen ? "Open chat" : undefined}
                        >
                            <TableCell className="font-medium"><StudentLink id={row.studentId} name={row.name} /></TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                                <span className={CREDIT_TONE[credit.tone]}>{credit.text}</span>
                                {credit.note && <span className="block text-xs text-muted-foreground">{credit.note}</span>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                                {row.lastLesson ? lessonWords(row.lastLesson, today) : <span className="text-muted-foreground">None yet</span>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                                {row.nextLesson ? lessonWords(row.nextLesson, today) : <span className="text-muted-foreground">Nothing booked</span>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                                <span className={PAYMENT_TONE[pay.tone]}>{pay.text}</span>
                                {pay.marker && (
                                    <Badge
                                        variant={row.payment.kind === "autopay" || row.payment.kind === "auto_refill" ? "destructive" : "outline"}
                                        className="ml-2 align-middle"
                                    >
                                        {pay.marker}
                                    </Badge>
                                )}
                                {row.payment.kind === "unknown" && (
                                    <span className="block text-xs text-muted-foreground">{row.payment.error}</span>
                                )}
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
}

/** The tab: loads when opened, refreshes on request. */
export function BalancesTab({ onMessage }: { onMessage?: (studentId: string) => void }) {
    const [data, setData] = useState<{ rows: BalanceRow[]; loadedAt: string } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const load = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getBalances()
            if ("error" in res) setError(res.error)
            else setData(res)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load balances")
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => { load() }, [])

    const asOf = data
        ? new Date(data.loadedAt).toLocaleTimeString("en-US", { timeZone: STUDIO_TZ, hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase()
        : null

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-2xl font-serif">Balances</CardTitle>
                        <CardDescription>
                            Every active family: lessons left, last and next lesson, and next payment. Click a column to sort, a name for their details, or the rest of a row to open their chat.
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={load} disabled={loading} className="shrink-0">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        <span className="ml-2 hidden sm:inline">Refresh</span>
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {error && <p className="text-sm text-red-600 mb-4">Could not load balances: {error}</p>}
                {!data && !error && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}
                {data && (
                    <>
                        <BalancesTable rows={data.rows} onOpen={onMessage} />
                        <p className="text-xs text-muted-foreground mt-3">
                            {data.rows.length} active {data.rows.length === 1 ? "family" : "families"}, as of {asOf} {studioTzAbbr()}. Times are Eastern.
                            Payment amounts are what Stripe will charge next, after any account credit.
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
