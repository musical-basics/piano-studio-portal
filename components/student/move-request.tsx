"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CalendarClock, CheckCircle2, Clock, Info, Loader2 } from "lucide-react"
import { getMoveOptions, requestLessonMove, withdrawLessonMove, type MoveOptions } from "@/app/actions/move-requests"
import { claimMakeupSlot, getMakeupOptions } from "@/app/actions/makeup-slots"
import type { FamilyMoveState } from "@/lib/core/move-requests"

/**
 * The family picks one of the teacher's free times for one of its lessons.
 * Two kinds share this dialog and the same slot finder:
 *   - "request" (#878, Request a different time): that lesson's week; nothing
 *     moves until the teacher approves.
 *   - "makeup" (#927, the make-up picker, only while FAMILY_MAKEUP_PICKER_ON):
 *     the next two weeks; the lesson moves right away, the usual reschedule.
 */

const key = (s: { date: string; time: string }) => `${s.date}_${s.time}`

type Kind = "request" | "makeup"

const TEXT: Record<Kind, {
    title: string
    after: string
    send: string
    picked: string
    preview: string
    done: (label: string) => ReactNode
}> = {
    request: {
        title: "Request a different time",
        after: "Your teacher approves it first; until then your lesson stays where it is.",
        send: "Send request",
        picked: "You are asking for",
        preview: "Preview: only the family can send a request.",
        done: label => <>Request sent for <span className="font-medium">{label}</span>. If your teacher approves it, you will get the
            usual &quot;Lesson Rescheduled&quot; email and the new time shows here. Until then your lesson stays at its time.</>,
    },
    makeup: {
        title: "Pick a new time",
        after: "Your lesson moves right away: Zoom and the calendar follow, and you get the usual \"Lesson Rescheduled\" email.",
        send: "Move my lesson",
        picked: "Moving it to",
        preview: "Preview: only the family can move its lesson.",
        done: label => <>Done: your lesson is now on <span className="font-medium">{label}</span>. You will get the usual
            &quot;Lesson Rescheduled&quot; email.</>,
    },
}

interface FreeTimeDialogProps {
    /** The lesson to move; null keeps the dialog closed. */
    lessonId: string | null
    onClose: () => void
    /** An admin previewing this student: the list shows, sending is off. */
    isPreview?: boolean
    kind?: Kind
}

export function MoveRequestDialog({ lessonId, onClose, isPreview = false, kind = "request" }: FreeTimeDialogProps) {
    const router = useRouter()
    const text = TEXT[kind]
    const [options, setOptions] = useState<MoveOptions | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [picked, setPicked] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [sendError, setSendError] = useState<string | null>(null)
    const [sentLabel, setSentLabel] = useState<string | null>(null)

    useEffect(() => {
        if (!lessonId) return
        let cancelled = false
        setOptions(null)
        setLoadError(null)
        setPicked("")
        setSendError(null)
        setSentLabel(null)
        const load = kind === "makeup" ? getMakeupOptions : getMoveOptions
        load(lessonId)
            .then(res => {
                if (cancelled) return
                if ("error" in res) setLoadError(res.error)
                else setOptions(res)
            })
            .catch(() => { if (!cancelled) setLoadError("The free times could not be loaded just now. Please try again in a minute.") })
        return () => { cancelled = true }
    }, [lessonId, kind])

    // "Thu, Nov 20 at 4:30pm EST (1:30pm your time)" -> grouped by day, with
    // "4:30pm EST" on the button and "1:30pm your time" under it.
    const byDay = useMemo(() => {
        const groups: { day: string; slots: { k: string; time: string; local: string | null }[] }[] = []
        for (const s of options?.slots || []) {
            const [day, ...rest] = s.label.split(" at ")
            const m = rest.join(" at ").match(/^(.*?)(?: \((.*)\))?$/)
            const g = groups.find(x => x.day === day)
            const slot = { k: key(s), time: m?.[1] ?? rest.join(" at "), local: m?.[2] ?? null }
            if (g) g.slots.push(slot)
            else groups.push({ day, slots: [slot] })
        }
        return groups
    }, [options])

    const pickedLabel = options?.slots.find(s => key(s) === picked)?.label ?? null

    const handleSend = async () => {
        if (!lessonId || !picked || isPreview) return
        const [date, time] = picked.split("_")
        setIsSending(true)
        setSendError(null)
        try {
            const res = kind === "makeup"
                ? await claimMakeupSlot(picked, lessonId)
                : await requestLessonMove(lessonId, date, time)
            if ("error" in res) {
                setSendError(res.error)
            } else {
                setSentLabel("toLabel" in res ? res.toLabel : pickedLabel ?? picked)
                router.refresh()
            }
        } catch {
            setSendError("That did not go through just now. Please try again in a minute.")
        } finally {
            setIsSending(false)
        }
    }

    return (
        <Dialog open={Boolean(lessonId)} onOpenChange={(open) => { if (!open && !isSending) onClose() }}>
            <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-serif flex items-center gap-2">
                        <CalendarClock className="h-5 w-5" />
                        {text.title}
                    </DialogTitle>
                    <DialogDescription>
                        {options
                            ? <>Your lesson: <span className="font-medium text-foreground">{options.lessonLabel}</span>. Pick a free time in {options.week}. {text.after}</>
                            : "Finding your teacher's free times..."}
                    </DialogDescription>
                </DialogHeader>

                {sentLabel ? (
                    <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300" data-testid="move-done">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{text.done(sentLabel)}</span>
                    </div>
                ) : loadError ? (
                    <p className="text-sm text-destructive">{loadError}</p>
                ) : !options ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : options.pending ? (
                    <p className="text-sm">
                        You already asked to move this lesson to <span className="font-medium">{options.pending.toLabel}</span>.
                        It is waiting for your teacher. To pick another time, withdraw that request first.
                    </p>
                ) : options.slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        There are no free times in {options.week} right now. You can message your teacher instead.
                    </p>
                ) : (
                    <div className="space-y-4" data-testid="move-slots">
                        {byDay.map(g => (
                            <div key={g.day} className="space-y-2">
                                <p className="text-sm font-medium">{g.day}</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {g.slots.map(s => (
                                        <Button
                                            key={s.k}
                                            type="button"
                                            size="sm"
                                            variant={picked === s.k ? "default" : "outline"}
                                            className="h-auto flex-col gap-0 py-1.5"
                                            onClick={() => setPicked(s.k)}
                                            disabled={isSending}
                                            data-move-slot={s.k}
                                        >
                                            <span>{s.time}</span>
                                            {s.local && (
                                                <span className={`text-xs font-normal ${picked === s.k ? "opacity-80" : "text-muted-foreground"}`}>{s.local}</span>
                                            )}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {pickedLabel && (
                            <p className="text-sm">
                                {text.picked} <span className="font-medium">{pickedLabel}</span> ({options.duration} minutes).
                            </p>
                        )}
                        {isPreview && (
                            <p className="flex items-start gap-2 text-sm text-amber-700">
                                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                                {text.preview}
                            </p>
                        )}
                        {sendError && <p className="text-sm text-destructive">{sendError}</p>}
                    </div>
                )}

                <DialogFooter>
                    {sentLabel || loadError || options?.pending || options?.slots.length === 0 ? (
                        <Button onClick={onClose}>Close</Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={isSending}>
                                Not now
                            </Button>
                            <Button onClick={handleSend} disabled={!options || !picked || isSending || isPreview}>
                                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : text.send}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

interface MoveRequestStatusProps {
    state: FamilyMoveState | undefined
    isPreview?: boolean
}

/** One line under a lesson: a request waiting, or why the lesson stays at its time. */
export function MoveRequestStatus({ state, isPreview = false }: MoveRequestStatusProps) {
    const router = useRouter()
    const [isWithdrawing, setIsWithdrawing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!state) return null

    if (state.status === "pending") {
        const handleWithdraw = async () => {
            setIsWithdrawing(true)
            setError(null)
            try {
                const res = await withdrawLessonMove(state.requestId)
                if ("error" in res) setError(res.error)
                else router.refresh()
            } catch {
                setError("The request could not be withdrawn just now. Please try again.")
            } finally {
                setIsWithdrawing(false)
            }
        }
        return (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="move-status-pending">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-start gap-2">
                        <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            You asked to move this lesson to <span className="font-medium">{state.toLabel}</span>. Waiting for your
                            teacher; nothing changes until then.
                        </span>
                    </span>
                    <Button size="sm" variant="outline" onClick={handleWithdraw} disabled={isWithdrawing || isPreview}>
                        {isWithdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Withdraw request"}
                    </Button>
                </div>
                {error && <p className="mt-2 text-destructive">{error}</p>}
            </div>
        )
    }

    const why = state.status === "declined"
        ? <>Your request for {state.toLabel} was not approved.</>
        : <>{state.toLabel} is no longer available.</>
    return (
        <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid={`move-status-${state.status}`}>
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>This lesson stays at its time. {why}</span>
        </p>
    )
}
