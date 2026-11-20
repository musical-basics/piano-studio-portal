"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle2, FileText, History, Loader2, PlayCircle, PlusCircle, MinusCircle, Search, X } from "lucide-react"
import { VideoPlayer } from "@/components/video-player"
import type { BalanceChange, LessonHistory, LessonHistoryRow, LessonHistoryStatus } from "@/lib/lesson-history"
import type { RecordingMarker } from "@/lib/recording-markers"
import { clockTime, highlightParts, queryTerms, type TranscriptSegment } from "@/lib/transcript-search"
import { getMyLessonTranscript, searchMyTranscripts, type MyTranscriptHit } from "@/app/actions/my-transcripts"

/**
 * "Lesson history" (#737): the family's own lessons, built on the server
 * (lib/lesson-history.ts). Since #937-#939 each held lesson shows its notes and
 * homework with a Play button for its recording, and purchases, renewals and
 * adjustments sit between the lessons, so every change to the balance is here.
 * Since #1065 each held lesson says how it was counted, and since #1342 a
 * lesson with a transcript shows it under its video, with a search box over
 * all of this family's transcripts.
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

/** Notes can be long: three lines, then "more". */
function LongText({ label, text }: { label: string; text: string }) {
    const [open, setOpen] = useState(false)
    const long = text.length > 220 || text.split("\n").length > 3
    return (
        <div className="text-sm">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <p className={`whitespace-pre-line leading-relaxed ${open || !long ? "" : "line-clamp-3"}`}>{text}</p>
            {long && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOpen(!open)}>
                    {open ? "less" : "more"}
                </button>
            )}
        </div>
    )
}

/** A transcript line with the search words in bold. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
    return (
        <>
            {highlightParts(text, terms).map((p, i) =>
                p.hit ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 rounded px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>,
            )}
        </>
    )
}

/** The lesson's transcript (#1342), each line a button that plays from that moment when there is a video. */
function TranscriptPanel({
    lessonId,
    terms,
    onSeek,
}: {
    lessonId: string
    terms: string[]
    onSeek: ((seconds: number) => void) | null
}) {
    const [segments, setSegments] = useState<TranscriptSegment[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    useEffect(() => {
        let alive = true
        setSegments(null)
        setError(null)
        getMyLessonTranscript(lessonId)
            .then((res) => {
                if (!alive) return
                if ("error" in res) setError(res.error)
                else setSegments(res.segments)
            })
            .catch(() => alive && setError("The transcript did not load, try again"))
        return () => { alive = false }
    }, [lessonId])

    return (
        <div className="space-y-2" data-testid="lesson-transcript">
            <p className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Transcript
                <span className="text-xs font-normal text-muted-foreground">(made automatically, so some words may be off)</span>
            </p>
            {error ? (
                <p className="text-sm text-muted-foreground">{error}</p>
            ) : !segments ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>
            ) : segments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No words were picked up in this recording.</p>
            ) : (
                <ul className="max-h-72 overflow-y-auto rounded-md border divide-y text-sm">
                    {segments.map((s, i) => (
                        <li key={i}>
                            <button
                                type="button"
                                disabled={!onSeek}
                                onClick={() => onSeek?.(s.s)}
                                className="w-full text-left px-3 py-1.5 flex gap-3 hover:bg-muted/50 disabled:hover:bg-transparent disabled:cursor-default"
                            >
                                <span className="text-xs text-muted-foreground tabular-nums w-12 shrink-0 pt-0.5">{clockTime(s.s)}</span>
                                <span className="min-w-0"><Highlighted text={s.t} terms={terms} /></span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

/** Search box over the family's own transcripts (#1342). */
function TranscriptSearch({
    rowsById,
    onOpen,
}: {
    rowsById: Map<string, LessonHistoryRow>
    onOpen: (row: LessonHistoryRow, seconds: number | null, terms: string[]) => void
}) {
    const [query, setQuery] = useState("")
    const [busy, setBusy] = useState(false)
    const [answer, setAnswer] = useState<{ q: string; results: MyTranscriptHit[] } | null>(null)
    const [error, setError] = useState<string | null>(null)

    const run = async (e?: FormEvent) => {
        e?.preventDefault()
        const q = query.trim()
        if (q.length < 2) { setError("Type a word or a phrase to look for"); return }
        setBusy(true)
        setError(null)
        try {
            const res = await searchMyTranscripts(q)
            if ("error" in res) { setError(res.error); setAnswer(null) }
            else setAnswer({ q, results: res.results.filter((r) => rowsById.has(r.lessonId)) })
        } catch {
            setError("The search did not work, try again")
        } finally {
            setBusy(false)
        }
    }

    const terms = answer ? queryTerms(answer.q) : []
    return (
        <Card className="border-2 p-4 gap-3" data-testid="transcript-search">
            <form onSubmit={run} className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder='Search your lessons, e.g. "pedal" or "left hand"'
                        className="pl-8"
                        aria-label="Search what was said in your lessons"
                    />
                </div>
                <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}</Button>
                {answer && (
                    <Button type="button" variant="ghost" size="icon" aria-label="Clear the search" onClick={() => { setAnswer(null); setQuery("") }}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </form>
            {error && <p className="text-sm text-muted-foreground">{error}</p>}
            {answer && (
                answer.results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing found for "{answer.q}" in your lesson transcripts.</p>
                ) : (
                    <div className="space-y-3" data-testid="transcript-results">
                        <p className="text-xs text-muted-foreground">
                            {answer.results.length === 1 ? "1 lesson mentions" : `${answer.results.length} lessons mention`} "{answer.q}". Tap a line to play from there.
                        </p>
                        {answer.results.map((r) => {
                            const row = rowsById.get(r.lessonId)!
                            return (
                                <div key={r.lessonId} className="space-y-1">
                                    <p className="text-sm font-medium">{formatDay(row.date)}</p>
                                    <ul className="text-sm space-y-0.5">
                                        {r.hits.map((h, i) => (
                                            <li key={i}>
                                                <button
                                                    type="button"
                                                    className="w-full text-left flex gap-3 rounded px-2 py-1 hover:bg-muted/50"
                                                    onClick={() => onOpen(row, h.s, terms)}
                                                >
                                                    <span className="text-xs text-muted-foreground tabular-nums w-12 shrink-0 pt-0.5">{clockTime(h.s)}</span>
                                                    <span className="min-w-0"><Highlighted text={h.t} terms={terms} /></span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    {r.hitCount > r.hits.length && (
                                        <button type="button" className="text-xs text-primary hover:underline px-2" onClick={() => onOpen(row, null, terms)}>
                                            {r.hitCount - r.hits.length} more in this lesson
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )
            )}
        </Card>
    )
}

type Entry = { kind: "lesson"; row: LessonHistoryRow } | { kind: "change"; change: BalanceChange }

/** Lessons and balance changes, newest first (a change sorts by its day, before that day's lessons). */
function mergeEntries(history: LessonHistory): Entry[] {
    const lessons: Entry[] = history.rows.map((row) => ({ kind: "lesson", row }))
    const changes: Entry[] = (history.changes || []).map((change) => ({ kind: "change", change }))
    const dayOf = (e: Entry) => (e.kind === "lesson" ? e.row.date : e.change.date)
    return [...lessons, ...changes].sort((a, b) => {
        const d = dayOf(b).localeCompare(dayOf(a))
        if (d !== 0) return d
        return a.kind === b.kind ? 0 : a.kind === "change" ? -1 : 1
    })
}

export function LessonHistoryTab({
    history,
    markersByLesson = {},
}: {
    history: LessonHistory
    markersByLesson?: Record<string, RecordingMarker[]>
}) {
    const { rows } = history
    const left = (n: number | null) => (n === null ? "–" : String(n))
    const [playing, setPlaying] = useState<LessonHistoryRow | null>(null)
    const [seekTo, setSeekTo] = useState<{ seconds: number; key: number } | undefined>(undefined)
    const [terms, setTerms] = useState<string[]>([])
    const entries = mergeEntries(history)
    const rowsById = useMemo(() => new Map(rows.filter((r) => r.hasTranscript).map((r) => [r.id, r])), [rows])

    const open = (row: LessonHistoryRow, seconds: number | null = null, searchTerms: string[] = []) => {
        setPlaying(row)
        setTerms(searchTerms)
        // A few seconds of lead-in, so the sentence is heard from its start.
        setSeekTo(seconds === null ? undefined : { seconds: Math.max(0, seconds - 2), key: Date.now() })
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-serif font-semibold">Lesson History</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Every lesson on your account with its notes and recording, and every change to your balance.
                </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Lessons booked" value={history.booked} />
                <Stat label="Counted" value={history.counted} />
                <Stat label="Upcoming" value={history.upcoming} />
                <Stat label="Lessons left now" value={left(history.leftNow)} />
            </div>

            {rowsById.size > 0 && <TranscriptSearch rowsById={rowsById} onOpen={open} />}

            {rows.length === 0 && entries.length === 0 ? (
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
                        <ul className="divide-y" data-testid="history-list">
                            {entries.map((e) =>
                                e.kind === "change" ? (
                                    <li key={`c-${e.change.id}`} className="px-4 py-2.5 bg-muted/30" data-testid="history-change">
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <span className="flex items-center gap-2 min-w-0">
                                                {e.change.delta > 0
                                                    ? <PlusCircle className="h-4 w-4 text-green-700 shrink-0" />
                                                    : <MinusCircle className="h-4 w-4 text-red-600 shrink-0" />}
                                                <span className="min-w-0">
                                                    <span className="font-medium">{formatDay(e.change.date)}:</span>{" "}
                                                    {Math.abs(e.change.delta)} lesson{Math.abs(e.change.delta) === 1 ? "" : "s"}{" "}
                                                    {e.change.delta > 0 ? "added" : "taken off"}{e.change.label ? `, ${e.change.label}` : ""}
                                                </span>
                                            </span>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">{e.change.leftAfter} left after</span>
                                        </div>
                                    </li>
                                ) : (
                                    <li key={e.row.id} className="px-4 py-3 space-y-2" data-testid="history-lesson">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-medium text-sm">{formatDay(e.row.date)}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {e.row.clock}{e.row.familyClock ? ` (${e.row.familyClock})` : ""} · {e.row.duration} min
                                                    {e.row.leftAfter !== null ? ` · ${e.row.leftAfter} left after` : ""}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {e.row.videoUrl ? (
                                                    <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => open(e.row)}>
                                                        <PlayCircle className="h-3.5 w-3.5" /> Play
                                                    </Button>
                                                ) : e.row.hasTranscript ? (
                                                    <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => open(e.row)}>
                                                        <FileText className="h-3.5 w-3.5" /> Transcript
                                                    </Button>
                                                ) : null}
                                                <StatusPill status={e.row.status} />
                                            </div>
                                        </div>
                                        {e.row.countedBy && (
                                            <p className="text-xs text-muted-foreground flex items-start gap-1.5" data-testid="counted-by">
                                                <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" /> {e.row.countedBy}
                                            </p>
                                        )}
                                        {e.row.notes && <LongText label="Notes" text={e.row.notes} />}
                                        {e.row.homework && <LongText label="Homework" text={e.row.homework} />}
                                    </li>
                                ),
                            )}
                        </ul>
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

            <Dialog open={!!playing} onOpenChange={(isOpen) => { if (!isOpen) { setPlaying(null); setSeekTo(undefined) } }}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-serif">{playing ? `Lesson, ${formatDay(playing.date)}` : "Lesson"}</DialogTitle>
                    </DialogHeader>
                    {playing?.videoUrl && (
                        <VideoPlayer url={playing.videoUrl} title={formatDay(playing.date)} markers={markersByLesson[playing.id]} seekTo={seekTo} />
                    )}
                    {playing?.hasTranscript && (
                        <TranscriptPanel
                            lessonId={playing.id}
                            terms={terms}
                            onSeek={playing.videoUrl ? (s) => setSeekTo({ seconds: Math.max(0, s - 2), key: Date.now() }) : null}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
