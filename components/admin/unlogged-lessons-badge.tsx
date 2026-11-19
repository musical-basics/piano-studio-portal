"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle, CalendarX, CheckCircle2, DollarSign, Loader2, Mail, MessageCircle, XCircle } from "lucide-react"
import { holdUnloggedLesson, logUnloggedLesson, releaseHeldLesson, removeUnloggedLesson, type AdminUnloggedLesson } from "@/app/actions/unlogged-lessons"
import { Input } from "@/components/ui/input"
import { getMissedLessonPreview, markLessonMissed, type MissedLessonPreview } from "@/app/actions/missed-lesson"
import { getLastHomework } from "@/app/actions/last-homework"
import type { LastHomework } from "@/lib/last-homework"
import { appendNotePhrase } from "@/lib/lesson-note-phrases"
import { NotePhraseChips, shortLessonDate } from "@/components/admin/note-phrase-chips"

/**
 * The red "N unlogged" badge next to the studio name on the admin home (#760).
 * It opens the list of past lessons nobody logged, each with the same three
 * buttons as the unlogged-lessons emails. Every button asks first, showing what
 * the email's confirm page shows, then reports what happened in the dialog,
 * next to the lesson it is about. The list comes from the page
 * and is refreshed after each press; with none left the badge goes.
 */

type Kind = "log" | "remove" | "missed"

type Step =
    | { view: "list" }
    | { view: "confirm"; kind: Kind; lesson: AdminUnloggedLesson }
    | { view: "outcome"; ok: boolean; text: string }

const NOTES_MAX = 5000
const HOMEWORK_MAX = 2000

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

function LessonLine({ lesson }: { lesson: AdminUnloggedLesson }) {
    return (
        <div className="min-w-0">
            <p className="font-medium leading-snug">
                {lesson.studentName}
                {lesson.accountStatus && <span className="font-normal text-muted-foreground"> (account: {lesson.accountStatus})</span>}
            </p>
            <p className="text-sm text-muted-foreground">
                {lesson.label}
                {lesson.status === "logging" && ", logging started but never finished"}
            </p>
        </div>
    )
}

/**
 * #989: put a lesson on hold (out of the count, the emails and every button)
 * with a reason, or release it. Shown on each row of the list.
 */
function HoldControls({ lesson, onDone }: { lesson: AdminUnloggedLesson; onDone: (text: string, ok: boolean) => void }) {
    const [editing, setEditing] = useState(false)
    const [reason, setReason] = useState("")
    const [busy, setBusy] = useState(false)
    if (lesson.onHold) {
        return (
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                setBusy(true)
                const r = await releaseHeldLesson(lesson.id)
                setBusy(false)
                onDone(r.text, r.ok)
            }}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Release
            </Button>
        )
    }
    if (!editing) {
        return <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(true)}>Hold</Button>
    }
    return (
        <form className="flex w-full gap-2" onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            const r = await holdUnloggedLesson(lesson.id, reason)
            setBusy(false)
            if (r.ok) setEditing(false)
            onDone(r.text, r.ok)
        }}>
            <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Why it waits, e.g. waiting on the parent's OK" className="h-8 text-sm" />
            <Button size="sm" type="submit" disabled={busy || !reason.trim()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Hold"}</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </form>
    )
}

export function UnloggedLessonsBadge({ lessons: allLessons }: { lessons: AdminUnloggedLesson[] }) {
    // #989: held lessons are listed apart and left out of the red count.
    const lessons = allLessons.filter(l => !l.onHold)
    const held = allLessons.filter(l => l.onHold)
    const [holdNote, setHoldNote] = useState<{ text: string; ok: boolean } | null>(null)
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>({ view: "list" })
    const [submitting, setSubmitting] = useState(false)
    const [notes, setNotes] = useState("")
    const [homework, setHomework] = useState("")
    const [lastHomework, setLastHomework] = useState<LastHomework | null>(null)
    const lastHomeworkSeq = useRef(0)
    const [preview, setPreview] = useState<MissedLessonPreview | null>(null)
    const [previewError, setPreviewError] = useState<string | null>(null)

    const count = lessons.length
    const missedLessonId = step.view === "confirm" && step.kind === "missed" ? step.lesson.id : null

    // "I missed it" shows the exact apology first, as the email's page does.
    useEffect(() => {
        if (!missedLessonId) return
        let cancelled = false
        setPreview(null)
        setPreviewError(null)
        getMissedLessonPreview(missedLessonId)
            .then(res => {
                if (cancelled) return
                if ("error" in res) setPreviewError(res.error)
                else setPreview(res)
            })
            .catch(() => { if (!cancelled) setPreviewError("Could not load this lesson") })
        return () => { cancelled = true }
    }, [missedLessonId])

    const openList = () => {
        setStep({ view: "list" })
        setOpen(true)
    }

    const ask = (kind: Kind, lesson: AdminUnloggedLesson) => {
        setNotes(lesson.notes || "")
        setHomework("")
        // #943: Log it starts with last lesson's homework in the box.
        const seq = ++lastHomeworkSeq.current
        setLastHomework(null)
        if (kind === "log") {
            getLastHomework(lesson.studentId, lesson.date, lesson.time)
                .then(last => {
                    if (!last || seq !== lastHomeworkSeq.current) return
                    setLastHomework(last)
                    setHomework(h => (h.trim() ? h : last.homework))
                })
                .catch(() => { /* the box just starts empty */ })
        }
        setStep({ view: "confirm", kind, lesson })
    }

    const confirm = async () => {
        if (step.view !== "confirm") return
        const { kind, lesson } = step
        const expected = { lessonId: lesson.id, date: lesson.date, time: lesson.time }
        setSubmitting(true)
        try {
            if (kind === "log") {
                const res = await logUnloggedLesson(expected, notes, homework)
                setStep({ view: "outcome", ok: res.ok, text: res.text })
            } else if (kind === "remove") {
                const res = await removeUnloggedLesson(expected)
                setStep({ view: "outcome", ok: res.ok, text: res.text })
            } else {
                if (!preview) return
                const res = await markLessonMissed(lesson.id, preview.message)
                setStep("error" in res ? { view: "outcome", ok: false, text: res.error } : { view: "outcome", ok: true, text: res.summary })
            }
        } catch {
            setStep({
                view: "outcome",
                ok: false,
                text: "The request failed before an answer came back. Open the list again to see whether the lesson is still there before trying again.",
            })
        } finally {
            setSubmitting(false)
            // A done action already refreshes the page; a refused one (moved,
            // handled elsewhere) needs this so the list shows the lesson as it is now.
            router.refresh()
        }
    }

    const title = step.view === "list"
        ? "Unlogged lessons"
        : step.view === "outcome"
            ? (step.ok ? "Done" : "Not finished")
            : step.kind === "log" ? "Log this lesson?" : step.kind === "remove" ? "Remove this lesson?" : "You missed this lesson?"

    return (
        <>
            {count === 0 && held.length > 0 && (
                <button
                    type="button"
                    onClick={openList}
                    className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80"
                    title="Lessons on hold (left out of the count and the emails)"
                >
                    {held.length} on hold
                </button>
            )}
            {count > 0 && (
                <button
                    type="button"
                    onClick={openList}
                    className="inline-flex items-center rounded-full bg-destructive px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 dark:bg-destructive/80"
                    title="Past lessons nobody logged yet (no credit taken)"
                >
                    {count} unlogged
                </button>
            )}

            <Dialog open={open} onOpenChange={(next) => { if (!submitting) setOpen(next) }}>
                {/* No auto-focus: it would land on the first lesson's Log it. */}
                <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[560px]" onOpenAutoFocus={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>
                            {step.view === "list"
                                ? (count > 0
                                    ? `${plural(count, "lesson")} over and not logged, so no credit was taken yet.`
                                    : "Nothing left to log.")
                                : step.view === "confirm"
                                    ? `${step.lesson.studentName}, ${step.lesson.label}`
                                    : null}
                        </DialogDescription>
                    </DialogHeader>

                    {step.view === "list" && holdNote && (
                        <p className={`text-sm rounded-md px-3 py-2 ${holdNote.ok ? "bg-muted" : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}>{holdNote.text}</p>
                    )}
                    {step.view === "list" && (
                        count === 0 ? (
                            <p className="text-sm text-muted-foreground">{held.length ? "Nothing left to log apart from the lessons on hold below." : "Every past lesson is logged."}</p>
                        ) : (
                            <ul className="space-y-3">
                                {lessons.map(lesson => (
                                    <li key={lesson.id} className="rounded-lg border p-3 space-y-3">
                                        <LessonLine lesson={lesson} />
                                        <div className="flex flex-wrap gap-2">
                                            <Button size="sm" className="bg-green-700 text-white hover:bg-green-800" onClick={() => ask("log", lesson)}>
                                                Log it
                                            </Button>
                                            <Button size="sm" variant="outline" className="border-red-700 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-400 dark:text-red-400 dark:hover:bg-red-950/40" onClick={() => ask("remove", lesson)}>
                                                Didn&apos;t happen
                                            </Button>
                                            <Button size="sm" variant="outline" className="border-amber-700 text-amber-800 hover:bg-amber-50 hover:text-amber-900 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-950/40" onClick={() => ask("missed", lesson)}>
                                                I missed it
                                            </Button>
                                            <HoldControls lesson={lesson} onDone={(text, ok) => { setHoldNote({ text, ok }); if (ok) router.refresh() }} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}
                    {step.view === "list" && held.length > 0 && (
                        <div className="space-y-2 border-t pt-3">
                            <p className="text-sm font-medium">On hold ({held.length}), out of the count and the emails</p>
                            <ul className="space-y-2">
                                {held.map(lesson => (
                                    <li key={lesson.id} className="flex items-start justify-between gap-3 rounded-lg border border-dashed p-3">
                                        <div className="min-w-0">
                                            <LessonLine lesson={lesson} />
                                            <p className="text-xs text-muted-foreground mt-1">On hold: {lesson.onHold}</p>
                                        </div>
                                        <HoldControls lesson={lesson} onDone={(text, ok) => { setHoldNote({ text, ok }); if (ok) router.refresh() }} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {step.view === "confirm" && step.kind === "log" && (
                        <div className="space-y-4 text-sm">
                            {step.lesson.quietLog ? (
                                <p className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                    <span>Takes 1 credit. The lesson is over 7 days old, so it is logged quietly: no email to the family and no next lesson booked.</span>
                                </p>
                            ) : (
                                <p className="flex items-start gap-2">
                                    <Mail className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                    <span>Takes 1 credit and sends 1 family the usual emails (the lesson email, plus the next week&apos;s booking if one is made), the same as logging it in admin.</span>
                                </p>
                            )}
                            <div className="space-y-1.5">
                                <Label htmlFor="unlogged-notes">
                                    Lesson notes{" "}
                                    <span className="font-normal text-muted-foreground">
                                        ({step.lesson.quietLog ? "optional, saved on the lesson" : "optional, goes in the family's lesson email"})
                                    </span>
                                </Label>
                                <Textarea id="unlogged-notes" rows={5} maxLength={NOTES_MAX} value={notes} onChange={e => setNotes(e.target.value)} />
                                <NotePhraseChips disabled={submitting} onPick={phrase => setNotes(n => appendNotePhrase(n, phrase).slice(0, NOTES_MAX))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="unlogged-homework">
                                    Homework <span className="font-normal text-muted-foreground">(optional)</span>
                                </Label>
                                <Textarea id="unlogged-homework" rows={3} maxLength={HOMEWORK_MAX} value={homework} onChange={e => setHomework(e.target.value)} />
                                {lastHomework && homework === lastHomework.homework && (
                                    <p className="text-xs text-muted-foreground">
                                        Last lesson&apos;s homework ({shortLessonDate(lastHomework.date)}): edit what changed or clear it.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {step.view === "confirm" && step.kind === "remove" && (
                        <div className="space-y-3 text-sm">
                            <p className="flex items-start gap-2">
                                <CalendarX className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <span>It is deleted with no credit taken. Nobody is told.</span>
                            </p>
                            {step.lesson.hasVideo && (
                                <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>A recording is attached to this lesson, so it may have happened. Removing it also drops that link from the lesson.</span>
                                </p>
                            )}
                        </div>
                    )}

                    {step.view === "confirm" && step.kind === "missed" && (
                        previewError ? (
                            <p className="text-sm text-destructive">{previewError}</p>
                        ) : !preview ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4 text-sm">
                                <div className="space-y-2">
                                    <p className="font-medium">The message, exactly:</p>
                                    <p className="whitespace-pre-wrap rounded-md border bg-muted/50 p-3">{preview.message}</p>
                                </div>
                                <ul className="space-y-2">
                                    <li className="flex items-start gap-2">
                                        <MessageCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                        <span>
                                            Sends 1 message to 1 family (portal chat, with the usual email notice{preview.alsoTexts ? ", and a text" : ""})
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <DollarSign className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                        <span>
                                            {preview.alreadyCredited
                                                ? "$15 Account Credit was already added by an earlier press (not added again)"
                                                : "+$15 Account Credit"}
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CalendarX className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                        <span>Removes the lesson (no cancellation email)</span>
                                    </li>
                                </ul>
                            </div>
                        )
                    )}

                    {step.view === "outcome" && (
                        <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${step.ok ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                            {step.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                            <span>{step.text}</span>
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        {step.view === "list" && (
                            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
                        )}
                        {step.view === "confirm" && (
                            <>
                                <Button variant="outline" onClick={() => setStep({ view: "list" })} disabled={submitting}>
                                    Back
                                </Button>
                                <Button
                                    onClick={confirm}
                                    disabled={submitting || (step.kind === "missed" && !preview)}
                                    className={
                                        step.kind === "log" ? "bg-green-700 text-white hover:bg-green-800"
                                            : step.kind === "remove" ? "bg-red-700 text-white hover:bg-red-800"
                                                : "bg-amber-700 text-white hover:bg-amber-800"
                                    }
                                >
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : step.kind === "log" ? "Log it"
                                            : step.kind === "remove" ? "Remove it"
                                                : "Send apology and remove lesson"}
                                </Button>
                            </>
                        )}
                        {step.view === "outcome" && (
                            <>
                                {count > 0 && (
                                    <Button variant="outline" onClick={() => setStep({ view: "list" })}>
                                        Back to the list
                                    </Button>
                                )}
                                <Button onClick={() => setOpen(false)}>Close</Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
