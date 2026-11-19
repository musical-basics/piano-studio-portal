"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, PlayCircle, Search } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { VideoPlayer } from "@/components/video-player"
import { openLessonTranscript, searchLessonTranscripts, type OpenedTranscript } from "@/app/actions/transcripts"
import {
    clockTime,
    highlightParts,
    queryTerms,
    type TranscriptSearchAnswer,
    type TranscriptSearchResult,
    type TranscriptSegment,
} from "@/lib/transcript-search"
import { studioToday } from "@/lib/studio-timezone"

// Lionel's #954: find every lesson where a word came up ("octave", "Grieg",
// "pedal"), from the transcripts the Mac writes overnight (#953). Each line
// that matched opens the recording at that moment. Admin only.

/** Seconds of lead-in before a line, so the sentence is heard from its start. */
const LEAD_IN_S = 2
const FIRST_HITS = 3

function dayLabel(date: string | null): string {
    if (!date) return "Date unknown"
    const sameYear = date.slice(0, 4) === studioToday().slice(0, 4)
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC",
    })
}

function timeLabel(hhmm: string | null): string {
    if (!hhmm) return ""
    const [h, m] = hhmm.split(":")
    const hn = parseInt(h, 10)
    return `${hn % 12 || 12}${m === "00" ? "" : `:${m}`}${hn >= 12 ? "pm" : "am"}`
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
    return (
        <>
            {highlightParts(text, terms).map((p, i) =>
                p.hit ? <mark key={i} className="rounded-sm bg-amber-200 px-0.5 text-foreground dark:bg-amber-500/40">{p.text}</mark> : <span key={i}>{p.text}</span>,
            )}
        </>
    )
}

type Playing = { result: TranscriptSearchResult; seconds: number }

export function TranscriptSearch() {
    const [query, setQuery] = useState("")
    const [searched, setSearched] = useState("")
    const [answer, setAnswer] = useState<TranscriptSearchAnswer | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [playing, setPlaying] = useState<Playing | null>(null)

    const terms = useMemo(() => queryTerms(searched), [searched])

    const run = async (e?: React.FormEvent) => {
        e?.preventDefault()
        const q = query.trim()
        if (!q) return
        setBusy(true)
        setError(null)
        const res = await searchLessonTranscripts(q)
        setBusy(false)
        if ("error" in res) {
            setError(res.error)
            return
        }
        setAnswer(res)
        setSearched(q)
        setExpanded(new Set())
    }

    const toggle = (id: string) =>
        setExpanded(cur => {
            const next = new Set(cur)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Search what was said in lessons
                </CardTitle>
                <CardDescription>
                    Your Mac writes a transcript of each lesson recording overnight. Find every lesson where a word or
                    a phrase came up, and play it from that moment. Put a phrase in quotes, like &quot;left hand&quot;.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <form onSubmit={run} className="flex gap-2">
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="octave, Grieg, pedal..."
                        maxLength={200}
                        aria-label="Word or phrase to find"
                    />
                    <Button type="submit" disabled={busy || !query.trim()} className="gap-2 shrink-0">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Search
                    </Button>
                </form>

                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                {answer && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {answer.total === 0
                                ? `No lesson found with "${searched}" in ${answer.transcribed} transcribed recording${answer.transcribed === 1 ? "" : "s"}. Very common words (the, and, is) are not searched.`
                                : `${answer.total} lesson${answer.total === 1 ? "" : "s"} with "${searched}"${answer.total > answer.results.length ? `, the newest ${answer.results.length} shown` : ""}, out of ${answer.transcribed} transcribed so far.`}
                        </p>
                        <ul className="divide-y rounded-md border">
                            {answer.results.map(r => {
                                const open = expanded.has(r.id)
                                const hits = open ? r.hits : r.hits.slice(0, FIRST_HITS)
                                return (
                                    <li key={r.id} className="space-y-2 p-3">
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                            <p className="font-medium">
                                                {r.studentName}
                                                <span className="font-normal text-muted-foreground">
                                                    {" "}· {dayLabel(r.recordedOn)}{r.lessonTime ? `, ${timeLabel(r.lessonTime)}` : ""}
                                                    {r.durationSeconds ? ` · ${Math.round(r.durationSeconds / 60)} min` : ""}
                                                </span>
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {r.hitCount} {r.hitCount === 1 ? "mention" : "mentions"}
                                            </p>
                                        </div>
                                        {hits.length === 0 && (
                                            <p className="text-sm text-muted-foreground">The words come up in this lesson, but not together in one line.</p>
                                        )}
                                        <ul className="space-y-1">
                                            {hits.map((h, i) => (
                                                <li key={i}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPlaying({ result: r, seconds: h.s })}
                                                        className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted"
                                                        title="Play from here"
                                                    >
                                                        <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-primary pt-0.5">
                                                            <PlayCircle className="h-3.5 w-3.5" />
                                                            {clockTime(h.s)}
                                                        </span>
                                                        <span className="min-w-0 break-words"><Highlighted text={h.t} terms={terms} /></span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                        {r.hits.length > FIRST_HITS && (
                                            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => toggle(r.id)}>
                                                {open ? "Show fewer" : `Show all ${r.hits.length}${r.hitCount > r.hits.length ? ` of ${r.hitCount}` : ""}`}
                                            </Button>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}
            </CardContent>

            <TranscriptPlayer playing={playing} terms={terms} onClose={() => setPlaying(null)} />
        </Card>
    )
}

/** The recording at the chosen moment, with its whole transcript to jump around in. */
function TranscriptPlayer({ playing, terms, onClose }: { playing: Playing | null; terms: string[]; onClose: () => void }) {
    const [opened, setOpened] = useState<OpenedTranscript | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [seek, setSeek] = useState<{ seconds: number; key: number } | null>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const id = playing?.result.id

    useEffect(() => {
        if (!playing) return
        let cancelled = false
        setOpened(null)
        setError(null)
        setSeek({ seconds: Math.max(0, playing.seconds - LEAD_IN_S), key: Date.now() })
        openLessonTranscript(playing.result.id).then(res => {
            if (cancelled) return
            if ("error" in res) setError(res.error)
            else setOpened(res)
        })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, playing?.seconds])

    // Bring the chosen line into view in the full transcript.
    useEffect(() => {
        if (!opened || !playing) return
        const el = listRef.current?.querySelector<HTMLElement>(`[data-s="${playing.seconds}"]`)
        el?.scrollIntoView({ block: "center" })
    }, [opened, playing])

    const jump = (seg: TranscriptSegment) => setSeek({ seconds: Math.max(0, seg.s - LEAD_IN_S), key: Date.now() })

    return (
        <Dialog open={!!playing} onOpenChange={o => { if (!o) onClose() }}>
            <DialogContent className="max-w-3xl">
                {playing && (
                    <>
                        <DialogHeader>
                            <DialogTitle>{playing.result.studentName}, {dayLabel(playing.result.recordedOn)}</DialogTitle>
                            <DialogDescription>From {clockTime(playing.seconds)}. Tap any line below to jump there.</DialogDescription>
                        </DialogHeader>
                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                        {!opened && !error && (
                            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Opening the recording...
                            </div>
                        )}
                        {opened && (
                            <div className="space-y-3">
                                {opened.url ? (
                                    <>
                                        <VideoPlayer url={opened.url} seekTo={seek ?? undefined} />
                                        <a
                                            href={`${opened.url}#t=${Math.max(0, Math.floor(playing.seconds - LEAD_IN_S))}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-muted-foreground underline"
                                        >
                                            Open the recording in a new tab
                                        </a>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{opened.playError || "No recording to play."}</p>
                                )}
                                <div ref={listRef} className="max-h-64 overflow-y-auto rounded-md border p-1">
                                    {opened.segments.map((seg, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            data-s={seg.s}
                                            onClick={() => jump(seg)}
                                            className={`flex w-full items-start gap-2 rounded px-1.5 py-0.5 text-left text-sm hover:bg-muted ${seg.s === playing.seconds ? "bg-muted" : ""}`}
                                        >
                                            <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground pt-0.5">{clockTime(seg.s)}</span>
                                            <span className="min-w-0 break-words"><Highlighted text={seg.t} terms={terms} /></span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
