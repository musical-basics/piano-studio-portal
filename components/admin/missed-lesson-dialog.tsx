"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { CalendarPlus, CalendarX, CheckCircle2, DollarSign, Loader2, MessageCircle, XCircle } from "lucide-react"
import {
    getMissedLessonMakeupSlots,
    getMissedLessonPreview,
    markLessonMissed,
    type FreeSlot,
    type MissedLessonPreview,
} from "@/app/actions/missed-lesson"
import { missedLessonApology } from "@/lib/missed-lesson-message"

interface MissedLessonDialogProps {
    /** The lesson the teacher missed; null keeps the dialog closed. */
    lessonId: string | null
    onClose: () => void
    /** Called after the lesson was removed. */
    onDone?: () => void
}

const slotKey = (s: { date: string; time: string }) => `${s.date}_${s.time}`

/**
 * Confirm step for "I missed this": shows exactly what will happen (the message
 * text word for word, the credit, the make-up, the removal) before anything is
 * done, and then what actually happened. The $15 and the make-up lesson (#789)
 * are independent checkboxes; at least one. The outcome is shown in the dialog
 * itself, next to the details it refers to.
 */
export function MissedLessonDialog({ lessonId, onClose, onDone }: MissedLessonDialogProps) {
    const [preview, setPreview] = useState<MissedLessonPreview | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)
    const [wantCredit, setWantCredit] = useState(true)
    const [wantMakeup, setWantMakeup] = useState(false)
    const [slots, setSlots] = useState<FreeSlot[] | null>(null)
    const [slotsError, setSlotsError] = useState<string | null>(null)
    const [slot, setSlot] = useState("")

    useEffect(() => {
        if (!lessonId) return
        let cancelled = false
        setPreview(null)
        setLoadError(null)
        setOutcome(null)
        setWantCredit(true)
        setWantMakeup(false)
        setSlots(null)
        setSlotsError(null)
        setSlot("")
        getMissedLessonPreview(lessonId)
            .then(res => {
                if (cancelled) return
                if ("error" in res) {
                    setLoadError(res.error)
                } else {
                    setPreview(res)
                    // An earlier press already booked the make-up: keep it, don't offer another.
                    if (res.bookedMakeup) {
                        setWantMakeup(true)
                        setSlot(slotKey(res.bookedMakeup))
                    }
                }
            })
            .catch(() => { if (!cancelled) setLoadError("Could not load this lesson") })
        return () => { cancelled = true }
    }, [lessonId])

    // Free slots load the first time the make-up box is ticked.
    useEffect(() => {
        if (!lessonId || !wantMakeup || slots || slotsError || preview?.bookedMakeup) return
        let cancelled = false
        getMissedLessonMakeupSlots(lessonId)
            .then(res => {
                if (cancelled) return
                if ("error" in res) setSlotsError(res.error)
                else setSlots(res.slots)
            })
            .catch(() => { if (!cancelled) setSlotsError("Could not load the free times") })
        return () => { cancelled = true }
    }, [lessonId, wantMakeup, slots, slotsError, preview])

    const makeupChoice = useMemo(() => {
        if (!wantMakeup || !slot) return null
        const [date, time] = slot.split("_")
        return { date, time }
    }, [wantMakeup, slot])

    const makeupLabel = preview?.bookedMakeup && wantMakeup
        ? preview.bookedMakeup.label
        : slots?.find(s => slotKey(s) === slot)?.label ?? null

    // Exactly what goes to the family for what is ticked (same builder the server uses).
    const message = preview && (wantCredit || makeupChoice)
        ? missedLessonApology(preview.salutation, preview.lessonDate, preview.today, {
              credit: wantCredit,
              makeup: makeupChoice ? { ...makeupChoice, familyTz: preview.familyTimezone } : null,
          })
        : null

    const choiceProblem = !wantCredit && !wantMakeup
        ? "Tick the $15, a make-up lesson, or both."
        : wantMakeup && !makeupChoice
            ? "Pick a time for the make-up."
            : null

    const handleConfirm = async () => {
        if (!lessonId || !preview || !message || choiceProblem) return
        setIsSubmitting(true)
        try {
            const result = await markLessonMissed(lessonId, message, { credit: wantCredit, makeup: makeupChoice })
            if ("error" in result) {
                setOutcome({ ok: false, text: result.error })
            } else {
                setOutcome({ ok: true, text: result.summary })
                onDone?.()
            }
        } catch {
            setOutcome({ ok: false, text: "The request failed before an answer came back. Open the lesson's \"I missed this\" again to see what still needs doing; nothing is credited, booked or sent twice." })
        } finally {
            setIsSubmitting(false)
        }
    }

    const slotsByDay = useMemo(() => {
        const groups: { day: string; slots: FreeSlot[] }[] = []
        for (const s of slots || []) {
            const day = s.label.split(" at ")[0]
            const g = groups.find(x => x.day === day)
            if (g) g.slots.push(s)
            else groups.push({ day, slots: [s] })
        }
        return groups
    }, [slots])

    const actions = [wantCredit && "credit", wantMakeup && "make-up"].filter(Boolean).length + 2

    return (
        <Dialog open={Boolean(lessonId)} onOpenChange={(open) => { if (!open && !isSubmitting) onClose() }}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>I missed this lesson</DialogTitle>
                    <DialogDescription>
                        {preview ? `${preview.studentName}, ${preview.lessonLabel}` : "Checking the lesson..."}
                    </DialogDescription>
                </DialogHeader>

                {outcome ? (
                    <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${outcome.ok ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                        {outcome.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                        <span><span className="font-medium">{outcome.ok ? "Done: " : "Not finished: "}</span>{outcome.text}</span>
                    </div>
                ) : loadError ? (
                    <p className="text-sm text-destructive">{loadError}</p>
                ) : !preview ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-4 min-w-0">
                        <div className="space-y-3 rounded-md border p-3">
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="missed-credit"
                                    checked={wantCredit}
                                    onCheckedChange={(v) => setWantCredit(v === true)}
                                    disabled={isSubmitting}
                                    className="mt-0.5"
                                />
                                <Label htmlFor="missed-credit" className="font-normal leading-snug">
                                    <span>
                                        +$15 Account Credit
                                        {preview.alreadyCredited && " (already added by an earlier try, it won't be added again)"}
                                    </span>
                                </Label>
                            </div>
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="missed-makeup"
                                    checked={wantMakeup}
                                    onCheckedChange={(v) => setWantMakeup(v === true)}
                                    disabled={isSubmitting || Boolean(preview.bookedMakeup)}
                                    className="mt-0.5"
                                />
                                <Label htmlFor="missed-makeup" className="font-normal leading-snug">
                                    <span>
                                        Book a make-up lesson ({preview.duration} min) in a free slot in the next 7 days
                                        {preview.bookedMakeup && `: already booked by an earlier try for ${preview.bookedMakeup.label}, it won't be booked again`}
                                    </span>
                                </Label>
                            </div>
                            {wantMakeup && !preview.bookedMakeup && (
                                <div className="pl-6 space-y-1">
                                    {slotsError ? (
                                        <p className="text-sm text-destructive">{slotsError}</p>
                                    ) : !slots ? (
                                        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Finding free times...</p>
                                    ) : slots.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No free times in the next 7 days within your available hours (Profile Settings).</p>
                                    ) : (
                                        <>
                                            <select
                                                aria-label="Make-up time"
                                                className="w-full max-w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                value={slot}
                                                onChange={(e) => setSlot(e.target.value)}
                                                disabled={isSubmitting}
                                            >
                                                <option value="">Pick a free time...</option>
                                                {slotsByDay.map(g => (
                                                    <optgroup key={g.day} label={g.day}>
                                                        {g.slots.map(s => (
                                                            <option key={slotKey(s)} value={slotKey(s)}>{s.label}</option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                            <p className="text-xs text-muted-foreground">
                                                From your available hours (Profile Settings), minus lessons and events already booked.
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {message ? (
                            <div className="space-y-2">
                                <p className="text-sm font-medium">The message, word for word:</p>
                                <p className="text-sm whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3" data-testid="missed-message">{message}</p>
                            </div>
                        ) : null}
                        {choiceProblem && <p className="text-sm text-amber-700">{choiceProblem}</p>}

                        <ul className="space-y-2 text-sm">
                            <li className="flex items-start gap-2">
                                <MessageCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <span>
                                    Sends 1 message to 1 family (portal chat, with the usual email notice)
                                    {preview.alsoTexts && ". They opted in to texts, so it also goes out as a text"}
                                </span>
                            </li>
                            {wantCredit && (
                                <li className="flex items-start gap-2">
                                    <DollarSign className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                    <span>+$15 Account Credit{preview.alreadyCredited && " (already added)"}</span>
                                </li>
                            )}
                            {wantMakeup && (
                                <li className="flex items-start gap-2">
                                    <CalendarPlus className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                    <span>
                                        {preview.bookedMakeup
                                            ? `Make-up already booked for ${preview.bookedMakeup.label}`
                                            : `Books 1 make-up lesson${makeupLabel ? ` for ${makeupLabel}` : ""} the usual way (Zoom, calendar, and the usual "Lesson Scheduled" email to the family). It takes a credit when you log it, like any lesson.`}
                                    </span>
                                </li>
                            )}
                            <li className="flex items-start gap-2">
                                <CalendarX className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <span>Removes the missed lesson (no cancellation email)</span>
                            </li>
                        </ul>
                    </div>
                )}

                <DialogFooter>
                    {outcome ? (
                        <Button onClick={onClose}>Close</Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                                Not now
                            </Button>
                            <Button variant="destructive" onClick={handleConfirm} disabled={!preview || isSubmitting || Boolean(choiceProblem)}>
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Yes, do all ${["two", "three", "four"][actions - 2]}`}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
