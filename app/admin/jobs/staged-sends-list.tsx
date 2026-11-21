"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveStagedResult, sendStagedRestNow } from "@/app/actions/staged-sends"
import type { BatchCounts } from "@/lib/staged-send"
import type { StagedSendRow } from "@/lib/core/tests-report"
import { ResultNote } from "./tests-card"
import { STUDIO_TZ, studioTzAbbr } from "@/lib/studio-timezone"

// Staged family bulk emails on the Tests card (protocol 1.20,
// lib/staged-send.ts): each send's batches and Resend's delivery reports,
// "Send the rest now", and the written result. Counts only, no addresses.

function when(iso: string | null): string {
    if (!iso) return ""
    return `${new Date(iso).toLocaleString("en-US", { timeZone: STUDIO_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ${studioTzAbbr(new Date(iso))}`
}

function batchLine(label: string, c: BatchCounts): string {
    if (!c.size) return ""
    const parts: string[] = []
    if (c.sent) parts.push(`${c.sent} sent`)
    if (c.delivered) parts.push(`${c.delivered} delivered`)
    if (c.bounced) parts.push(`${c.bounced} bounced`)
    if (c.complained) parts.push(`${c.complained} complained`)
    if (c.failed) parts.push(`${c.failed} failed`)
    if (c.waiting) parts.push(`${c.waiting} no delivery report yet`)
    if (c.pending) parts.push(`${c.pending} not sent yet`)
    return `${label} ${c.size}: ${parts.join(", ")}.`
}

function StagedRow({ row }: { row: StagedSendRow }) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [asking, setAsking] = useState(false)
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
    const left = row.first.pending + row.first.failed + row.rest.pending + row.rest.failed

    async function sendRest() {
        setBusy(true)
        setAsking(false)
        setMessage(null)
        try {
            const res = await sendStagedRestNow(row.id)
            setMessage(res.ok ? { ok: true, text: res.text } : { ok: false, text: res.error })
        } catch {
            setMessage({ ok: false, text: "No answer came back. Reload the page in a minute to see how it went." })
        } finally {
            setBusy(false)
            router.refresh()
        }
    }

    const status =
        row.status === "waiting" ? `Waiting: the other ${row.rest.pending} go around ${when(row.restDueAt)}, only if the first ${row.first.size} are delivered.`
            : row.status === "done" ? `Done${row.restSentAt ? `: the rest went ${when(row.restSentAt)}${row.restSentBy === "hand" ? " (sent by hand)" : ""}` : ""}.`
                : row.status === "stopped" ? `Stopped: ${row.stopReason || "no reason recorded"}`
                    : "Sending now..."

    return (
        <li className="space-y-1.5 py-3 first:pt-0 last:pb-0 text-sm" data-testid="staged-send">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-medium break-words">{row.kind}: {row.label}</p>
                <p className="text-xs text-muted-foreground">{when(row.createdAt)}</p>
            </div>
            <p className={row.status === "stopped" ? "text-red-700 dark:text-red-400 break-words" : "text-muted-foreground"}>{status}</p>
            <p className="text-muted-foreground">
                Preview to you: {row.previewSentAt ? `sent ${when(row.previewSentAt)}` : "not sent"}.{" "}
                {batchLine("First", row.first)} {batchLine("Rest", row.rest)}
            </p>
            {row.canSendRest && left > 0 && !asking && (
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={() => setAsking(true)}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {busy ? "Sending..." : "Send the rest now"}
                </Button>
            )}
            {asking && (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    <p>
                        Send it to the other {left === 1 ? "family" : `${left} families`} now
                        {row.status === "stopped" ? ", even though it stopped" : ", without waiting for the delivery check"}? Each gets one email, one at a time.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="h-8" onClick={sendRest}>Send them</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setAsking(false)}>Cancel</Button>
                    </div>
                </div>
            )}
            {message && <p className={message.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{message.text}</p>}
            <ResultNote label={row.label} saved={row.result} savedAt={row.resultAt} onSave={text => saveStagedResult(row.id, text)} />
        </li>
    )
}

export function StagedSendsList({ rows, error }: { rows: StagedSendRow[]; error: string | null }) {
    return (
        <div className="space-y-3 border-t pt-4" data-testid="staged-sends">
            <p className="font-medium">Family bulk emails</p>
            <p className="text-sm text-muted-foreground">
                Statements, announcements and recital emails to more than one family go out small: a preview copy to you, the
                first 3 families, then the rest 24 hours later (sooner before a recital) only if Resend reports those 3 delivered
                with no bounce or complaint. Otherwise it stops and emails you why. One family at a time, never BCC.
            </p>
            {error && <p className="text-sm text-red-700 dark:text-red-400">Couldn&apos;t read the sends: {error}</p>}
            {rows.length === 0 && !error ? (
                <p className="text-sm text-muted-foreground">None yet. The first will be the December 1 statements.</p>
            ) : (
                <ul className="divide-y">
                    {rows.map(r => <StagedRow key={r.id} row={r} />)}
                </ul>
            )}
        </div>
    )
}
