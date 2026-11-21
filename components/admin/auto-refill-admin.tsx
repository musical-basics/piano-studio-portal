"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminTurnOffAutoRefill, getAutoRefillAdmin, type AutoRefillAdminView } from "@/app/actions/auto-refill"
import { priceWords } from "@/lib/auto-refill"
import { STUDIO_TZ } from "@/lib/studio-timezone"

function day(iso: string | null): string {
    if (!iso) return ""
    return new Date(iso).toLocaleDateString("en-US", { timeZone: STUDIO_TZ, month: "short", day: "numeric" })
}

const STATUS_WORDS: Record<string, string> = {
    due: "ran out, charging soon",
    charging: "charging",
    failed: "declined",
    paid: "paid",
    skipped: "skipped",
    cancelled: "cancelled",
}

/**
 * Auto-refill in the admin student panel (#1477): on or off, the card, the
 * last few refills, and a Turn off button. Renders nothing for a family that
 * never turned it on.
 */
export function AutoRefillAdminSection({ studentId }: { studentId: string }) {
    const [view, setView] = useState<AutoRefillAdminView | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [confirm, setConfirm] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    const load = useCallback(async () => {
        const res = await getAutoRefillAdmin(studentId)
        if (res && "error" in res) setError(res.error)
        else {
            setError(null)
            setView(res)
        }
    }, [studentId])

    useEffect(() => {
        setView(null)
        setMessage(null)
        setConfirm(false)
        load()
    }, [load])

    if (error) return <p className="text-xs text-red-600">Auto-refill: {error}</p>
    if (!view) return null
    const p = view.plan

    async function turnOff() {
        setBusy(true)
        const res = await adminTurnOffAutoRefill(studentId)
        setBusy(false)
        setConfirm(false)
        setMessage(res.message)
        await load()
    }

    return (
        <section className="border-t pt-3" data-testid="admin-auto-refill">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Auto-refill</h3>
            <p className="text-sm">
                <span className="font-medium">{p.status === "on" ? "On" : "Off"}</span>
                {p.status === "on"
                    ? ` since ${day(p.startedAt)}: ${p.credits} lessons for ${priceWords(p.priceCents)} when they run out, card ending ${p.cardLast4 ?? "?"}.`
                    : ` since ${day(p.stoppedAt)}${p.stoppedBy ? ` (turned off by ${p.stoppedBy === "admin" ? "you" : "the family"})` : ""}.`}
            </p>
            {view.refills.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {view.refills.map(r => (
                        <li key={r.id}>
                            {day(r.createdAt)}: {r.kind === "start" ? "first lessons" : "refill"} {STATUS_WORDS[r.status] ?? r.status}
                            {r.status === "paid" ? ` (${priceWords(r.amountCents)})` : ""}
                            {r.status === "failed" ? `, try ${r.attempts}${r.nextRetryAt ? `, next ${day(r.nextRetryAt)}` : ", no more tries"}${r.lastError ? `: ${r.lastError}` : ""}` : ""}
                            {(r.status === "skipped" || r.status === "cancelled") && r.note ? ` (${r.note})` : ""}
                        </li>
                    ))}
                </ul>
            )}
            {message && <p className="mt-1 text-xs">{message}</p>}
            {p.status === "on" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    {!confirm ? (
                        <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>Turn off auto-refill</Button>
                    ) : (
                        <>
                            <span className="text-xs">Turn it off? An unpaid refill is cancelled; a monthly plan they switched from carries on if it hasn&apos;t ended.</span>
                            <Button size="sm" variant="destructive" onClick={turnOff} disabled={busy}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Turn off"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>Keep on</Button>
                        </>
                    )}
                </div>
            )}
        </section>
    )
}
