"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, CalendarClock, Check, CheckCircle2, Loader2, X, XCircle } from "lucide-react"
import { approveMoveRequest, declineMoveRequest } from "@/app/actions/move-requests"
import type { PendingMoveRequest } from "@/lib/core/move-requests"
import { StudentLink } from "@/components/admin/student-panel"

interface MoveRequestsCardProps {
    requests: PendingMoveRequest[]
    /** After a lesson moved, so the day's schedule and the calendar refresh. */
    onChanged?: () => void
}

type RowOutcome = { ok: boolean; text: string; closed?: boolean }

function askedAgo(iso: string): string {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
    if (min < 60) return `${min} min ago`
    const h = Math.round(min / 60)
    if (h < 48) return `${h}h ago`
    return `${Math.round(h / 24)} days ago`
}

/**
 * Families asking to move a lesson (#878), on the admin Today tab. One tap:
 * Approve runs the usual reschedule (Zoom, calendar, the usual "Lesson
 * Rescheduled" email to that family); Decline changes and sends nothing.
 */
export function MoveRequestsCard({ requests, onChanged }: MoveRequestsCardProps) {
    const router = useRouter()
    const [busy, setBusy] = useState<string | null>(null)
    const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({})
    // Answered rows stay on screen with their outcome after the refresh drops them.
    const [answered, setAnswered] = useState<PendingMoveRequest[]>([])

    if (requests.length === 0 && answered.length === 0) return null

    const act = async (request: PendingMoveRequest, what: "approve" | "decline") => {
        setBusy(`${request.id}:${what}`)
        setAnswered(a => (a.some(x => x.id === request.id) ? a : [...a, request]))
        try {
            const res = what === "approve" ? await approveMoveRequest(request.id) : await declineMoveRequest(request.id)
            if ("error" in res) {
                setOutcomes(o => ({ ...o, [request.id]: { ok: false, text: res.error, closed: res.closed } }))
            } else {
                setOutcomes(o => ({ ...o, [request.id]: { ok: true, text: res.summary } }))
                if (what === "approve") onChanged?.()
            }
            router.refresh()
        } catch {
            setOutcomes(o => ({ ...o, [request.id]: { ok: false, text: "No answer came back. Refresh the page to see whether it went through." } }))
        } finally {
            setBusy(null)
        }
    }

    const shown = [...requests, ...answered.filter(a => !requests.some(r => r.id === a.id))]
    const n = requests.filter(r => !outcomes[r.id]?.ok && !outcomes[r.id]?.closed).length

    return (
        <Card className="border-2 border-amber-400/60" data-testid="move-requests-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-xl font-serif flex items-center gap-2">
                    <CalendarClock className="h-5 w-5" />
                    {n === 0 ? "Move requests answered" : `${n === 1 ? "1 family asks" : `${n} families ask`} to move a lesson`}
                </CardTitle>
                <CardDescription>
                    <b>Approve</b> moves the lesson the usual way (Zoom and the calendar follow) and sends that 1 family the usual
                    &quot;Lesson Rescheduled&quot; email. <b>Decline</b> changes nothing and sends nothing; the family sees in the portal
                    that the lesson stays at its time.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {shown.map(r => {
                    const outcome = outcomes[r.id]
                    return (
                        <div key={r.id} className="rounded-md border p-3 space-y-2" data-testid="move-request-row">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="font-semibold"><StudentLink id={r.studentId} name={r.studentName} /></p>
                                    <p className="text-sm flex flex-wrap items-center gap-x-2">
                                        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{r.fromLabel}</span>
                                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-medium">{r.toLabel}</span>
                                        <span className="text-muted-foreground">({r.duration} min, asked {askedAgo(r.createdAt)})</span>
                                    </p>
                                </div>
                                {!outcome?.ok && !outcome?.closed && (
                                    <div className="flex gap-2 shrink-0">
                                        <Button
                                            size="sm"
                                            className="bg-green-700 hover:bg-green-800 text-white"
                                            onClick={() => act(r, "approve")}
                                            disabled={busy !== null}
                                        >
                                            {busy === `${r.id}:approve` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Approve</>}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => act(r, "decline")}
                                            disabled={busy !== null}
                                        >
                                            {busy === `${r.id}:decline` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4 mr-1" />Decline</>}
                                        </Button>
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
        </Card>
    )
}
