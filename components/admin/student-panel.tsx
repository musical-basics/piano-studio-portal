"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { CalendarPlus, History, Loader2, MessageCircle, NotebookPen, Paperclip, RefreshCw, Video } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getStudentPanel } from "@/app/actions/student-panel"
import type { PanelLesson, PanelLessonState, StudentPanelData } from "@/lib/core/student-panel"
import type { StudentRoster } from "@/types/admin"
import { StudentProfileSheet } from "./student-profile-sheet"

/**
 * #1087: tap a student's name anywhere in admin to see their lessons, lessons
 * left, last messages and recent changes in a side panel, without leaving the
 * tab. <StudentPanelProvider> sits near the top of the admin dashboard; any
 * name inside it wrapped in <StudentLink> opens the panel. Outside a provider
 * a StudentLink is plain text.
 */

type PanelApi = { openStudent: (studentId: string, name?: string | null) => void }

const PanelContext = createContext<PanelApi | null>(null)

export function useStudentPanel(): PanelApi | null {
    return useContext(PanelContext)
}

export function StudentLink({
    id,
    name,
    className,
    children,
}: {
    id: string | null | undefined
    name?: string | null
    className?: string
    children?: ReactNode
}) {
    const panel = useStudentPanel()
    const label = children ?? (name || "Student")
    if (!panel || !id) return <>{label}</>
    return (
        <button
            type="button"
            className={cn("text-left cursor-pointer hover:underline underline-offset-2 decoration-dotted focus-visible:underline focus-visible:outline-none", className)}
            title="Open student details"
            onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                panel.openStudent(id, name)
            }}
            onKeyDown={(e) => e.stopPropagation()}
        >
            {label}
        </button>
    )
}

export function StudentPanelProvider({
    children,
    students = [],
    onMessage,
    onSchedule,
    onLogPast,
}: {
    children: ReactNode
    /** The roster, for the actions that need a student's full row. */
    students?: StudentRoster[]
    onMessage?: (studentId: string) => void
    onSchedule?: (student: StudentRoster) => void
    onLogPast?: (student: StudentRoster) => void
}) {
    const [current, setCurrent] = useState<{ id: string; name: string | null } | null>(null)
    const [profileFor, setProfileFor] = useState<StudentRoster | null>(null)
    const api = useMemo<PanelApi>(() => ({ openStudent: (id, name) => setCurrent({ id, name: name ?? null }) }), [])
    const rosterRow = current ? students.find(s => s.id === current.id) ?? null : null

    // Close the panel first, so a dialog or the chat it opens is not under it.
    const then = (run: () => void) => {
        setCurrent(null)
        setTimeout(run, 150)
    }

    return (
        <PanelContext.Provider value={api}>
            {children}
            <StudentPanelSheet
                studentId={current?.id ?? null}
                nameHint={current?.name ?? null}
                onClose={() => setCurrent(null)}
                onMessage={onMessage && current ? () => { const id = current.id; then(() => onMessage(id)) } : undefined}
                onSchedule={onSchedule && rosterRow ? () => then(() => onSchedule(rosterRow)) : undefined}
                onLogPast={onLogPast && rosterRow ? () => then(() => onLogPast(rosterRow)) : undefined}
                onHistory={rosterRow ? () => then(() => setProfileFor(rosterRow)) : undefined}
            />
            <StudentProfileSheet
                student={profileFor}
                open={!!profileFor}
                onOpenChange={(open) => !open && setProfileFor(null)}
            />
        </PanelContext.Provider>
    )
}

const STATE_WORDS: Record<PanelLessonState, { text: string; tone: string }> = {
    upcoming: { text: "Booked", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
    today: { text: "Today", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
    logged: { text: "Logged", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
    free: { text: "Logged free", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300" },
    no_show: { text: "No-show", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    not_logged: { text: "Not logged", tone: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" },
    on_hold: { text: "On hold", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
}

function LessonRow({ lesson, showNotes }: { lesson: PanelLesson; showNotes: boolean }) {
    const state = STATE_WORDS[lesson.state]
    return (
        <li className="py-2">
            <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{lesson.when}</span>
                <span className="text-xs text-muted-foreground">{lesson.duration} min</span>
                <span className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium ${state.tone}`}>{state.text}</span>
            </div>
            {(lesson.credits || lesson.videoUrl || lesson.onHoldReason) && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {lesson.credits && <span>lessons left {lesson.credits}</span>}
                    {lesson.onHoldReason && <span>on hold: {lesson.onHoldReason}</span>}
                    {lesson.videoUrl && (
                        <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            <Video className="h-3 w-3" /> recording
                        </a>
                    )}
                </div>
            )}
            {showNotes && lesson.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lesson.notes}</p>}
        </li>
    )
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
    return (
        <section className="border-t pt-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>{title}</span>
                {right}
            </h3>
            {children}
        </section>
    )
}

function StudentPanelSheet({
    studentId,
    nameHint,
    onClose,
    onMessage,
    onSchedule,
    onLogPast,
    onHistory,
}: {
    studentId: string | null
    nameHint: string | null
    onClose: () => void
    onMessage?: () => void
    onSchedule?: () => void
    onLogPast?: () => void
    onHistory?: () => void
}) {
    const [data, setData] = useState<StudentPanelData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const asked = useRef(0)

    const load = useCallback(async (id: string) => {
        const ticket = ++asked.current
        setLoading(true)
        setError(null)
        try {
            const res = await getStudentPanel(id)
            if (ticket !== asked.current) return
            if ("error" in res) {
                setError(res.error)
                setData(null)
            } else {
                setData(res)
            }
        } catch (e) {
            if (ticket === asked.current) setError(e instanceof Error ? e.message : "Could not load this student")
        } finally {
            if (ticket === asked.current) setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (studentId) {
            setData(prev => (prev?.student.id === studentId ? prev : null))
            load(studentId)
        }
    }, [studentId, load])

    const shown = data && data.student.id === studentId ? data : null
    const s = shown?.student
    const title = s?.name || nameHint || "Student"

    return (
        <Sheet open={!!studentId} onOpenChange={(open) => { if (!open) onClose() }}>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader className="pb-2">
                    <SheetTitle className="text-xl pr-6">{title}</SheetTitle>
                    <SheetDescription>
                        {s ? (
                            <>
                                {s.lessonDay ? `${s.lessonDay}s${s.lessonTime ? ` at ${s.lessonTime}` : ""}` : "No standing lesson"}
                                {", "}
                                {s.venue === "classroom" ? "classroom" : "Zoom"}
                                {s.status && s.status !== "active" ? `, ${s.status}` : ""}
                            </>
                        ) : (
                            "Lessons, balance and messages"
                        )}
                    </SheetDescription>
                </SheetHeader>

                <div className="px-4 pb-6 space-y-4">
                    {s && (
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                                <span className="text-xs text-muted-foreground font-medium">Lessons left</span>
                                <Badge variant={s.credits <= 0 ? "destructive" : s.credits <= 1 ? "secondary" : "outline"} className="text-sm">
                                    {s.credits}
                                </Badge>
                            </div>
                            {s.balanceDue > 0 && (
                                <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                                    <span className="text-xs text-muted-foreground font-medium">Balance due</span>
                                    <span className="text-sm font-semibold">${s.balanceDue.toFixed(2)}</span>
                                </div>
                            )}
                            <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={() => studentId && load(studentId)} disabled={loading} aria-label="Refresh">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </Button>
                        </div>
                    )}

                    {(onMessage || onSchedule || onLogPast || onHistory) && (
                        <div className="flex flex-wrap gap-2">
                            {onMessage && (
                                <Button size="sm" onClick={onMessage}>
                                    <MessageCircle className="h-4 w-4 mr-1.5" />
                                    Open chat{shown && shown.unread > 0 ? ` (${shown.unread} new)` : ""}
                                </Button>
                            )}
                            {onSchedule && (
                                <Button size="sm" variant="outline" onClick={onSchedule}>
                                    <CalendarPlus className="h-4 w-4 mr-1.5" /> Book a lesson
                                </Button>
                            )}
                            {onLogPast && (
                                <Button size="sm" variant="outline" onClick={onLogPast}>
                                    <NotebookPen className="h-4 w-4 mr-1.5" /> Log a past lesson
                                </Button>
                            )}
                            {onHistory && (
                                <Button size="sm" variant="outline" onClick={onHistory}>
                                    <History className="h-4 w-4 mr-1.5" /> Full history
                                </Button>
                            )}
                        </div>
                    )}

                    {error && <p className="text-sm text-red-600">Could not load this student: {error}</p>}
                    {!shown && !error && (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {shown && (
                        <>
                            <Section title="Upcoming lessons">
                                {shown.upcoming.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2">Nothing booked.</p>
                                ) : (
                                    <ul className="divide-y">
                                        {shown.upcoming.map(l => <LessonRow key={l.id} lesson={l} showNotes={false} />)}
                                    </ul>
                                )}
                            </Section>

                            <Section title="Recent lessons">
                                {shown.recent.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2">No lessons yet.</p>
                                ) : (
                                    <ul className="divide-y">
                                        {shown.recent.map(l => <LessonRow key={l.id} lesson={l} showNotes />)}
                                    </ul>
                                )}
                            </Section>

                            <Section
                                title="Last messages"
                                right={shown.unread > 0 ? <Badge variant="destructive" className="text-[10px]">{shown.unread} unread</Badge> : undefined}
                            >
                                {shown.messages.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2">No messages yet.</p>
                                ) : (
                                    <ul className="space-y-2 pt-1">
                                        {shown.messages.map(m => (
                                            <li key={m.id} className={`flex ${m.fromStudent ? "justify-start" : "justify-end"}`}>
                                                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.fromStudent ? "bg-muted" : "bg-primary/10"} ${m.unread ? "ring-1 ring-red-400" : ""}`}>
                                                    <p className="whitespace-pre-wrap break-words line-clamp-4">{m.text || (m.attachments ? "" : "(empty)")}</p>
                                                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                                        {m.fromStudent ? "Them" : "You"}, {m.when}
                                                        {m.attachments > 0 && <><Paperclip className="h-3 w-3 ml-1" />{m.attachments}</>}
                                                    </p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Section>

                            {shown.changes.length > 0 && (
                                <Section title="Recent changes">
                                    <ul className="divide-y">
                                        {shown.changes.map(c => (
                                            <li key={c.id} className="py-1.5 text-sm">
                                                <span>{c.what}</span>
                                                {c.who && <span className="text-xs text-muted-foreground"> ({c.who})</span>}
                                                {c.extra && <span className="block text-xs text-muted-foreground">{c.extra}</span>}
                                            </li>
                                        ))}
                                    </ul>
                                </Section>
                            )}
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
