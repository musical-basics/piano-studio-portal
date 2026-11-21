"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ExternalLink, FileText, Loader2, PlayCircle, RefreshCw, Scissors, Trash2, X } from "lucide-react"
import { attachClassroomRecording, deleteClassroomRecording, type AdminRecordingRow } from "@/app/actions/classroom-recordings"
import { getRecordingsView, type RecordingsViewRow } from "@/app/actions/admin-recordings"
import { transcriptRecordingLink } from "@/app/actions/transcripts"
import { isoToStudioWallClock, studioToday, studioTzAbbr } from "@/lib/studio-timezone"
import { StudentLink } from "@/components/admin/student-panel"
import { formatMarkerTime, VideoPlayer } from "@/components/video-player"
import { RecordingSourceLabel } from "@/components/admin/recording-source-label"
import { TranscriptPlayer, TranscriptSearch, type TranscriptPlaying } from "@/components/admin/transcript-search"

// Lionel's #1916: classroom and Zoom recordings in one view. Every lesson
// recording, newest first (lib/admin-recordings.ts), with the transcript
// search on top. Classroom rows keep their library actions: thumbnail, clip,
// marked moments, attach, Delete for no-shows. Zoom rows are read only.

interface RecordingsTabProps {
    /** Open the admin day schedule on this studio date (where the lesson is). */
    onOpenDay: (date: string) => void
}

type SourceFilter = "all" | "classroom" | "zoom"
const ALL_STUDENTS = "all"

function dayLabel(date: string): string {
    const sameYear = date.slice(0, 4) === studioToday().slice(0, 4)
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...(sameYear ? {} : { year: "numeric" }),
        timeZone: "UTC",
    })
}

/** "Sun, Nov 16, 12:00pm EST" for a studio wall-clock date and HH:MM (year added when not this year). */
function studioDateTime(date: string, time: string): string {
    const [h, m] = time.split(":")
    const hn = parseInt(h, 10)
    return `${dayLabel(date)}, ${hn % 12 || 12}:${m}${hn >= 12 ? "pm" : "am"} ${studioTzAbbr(date)}`
}

function recordedLabel(row: { recordedAt: string; timeKnown?: boolean }): string {
    const { localDate, localTime } = isoToStudioWallClock(row.recordedAt)
    return row.timeKnown === false ? `${dayLabel(localDate)} (time unknown)` : studioDateTime(localDate, localTime)
}

function lengthLabel(minutes: number | null): string {
    if (minutes === null) return "unknown"
    const total = Math.round(minutes)
    if (total < 60) return `${total} min`
    return `${Math.floor(total / 60)} h ${total % 60} min`
}

/** The student filter's key: the profile, else the Dropbox folder's name. */
function studentKey(row: RecordingsViewRow): string {
    return row.studentId || `name:${row.studentName || "Unknown"}`
}

export function RecordingsTab({ onOpenDay }: RecordingsTabProps) {
    const [rows, setRows] = useState<RecordingsViewRow[] | null>(null)
    /** True once "Show older" loaded every recording, not just the last 90 days. */
    const [showAll, setShowAll] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
    const [studentFilter, setStudentFilter] = useState<string>(ALL_STUDENTS)
    const [attaching, setAttaching] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    // Shown above the table, next to the rows it is about.
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
    // The one recording playing in place (#791); opening another closes it.
    const [playingKey, setPlayingKey] = useState<string | null>(null)
    const playingKeyRef = useRef<string | null>(null)
    playingKeyRef.current = playingKey
    const [playError, setPlayError] = useState<string | null>(null)
    // Links fetched on Play for recordings on no lesson (they play through their Dropbox file).
    const [fetchedLinks, setFetchedLinks] = useState<Record<string, string>>({})
    // A row's transcript, open in the transcript search's player.
    const [transcript, setTranscript] = useState<TranscriptPlaying | null>(null)

    // Clip maker (#1094): start and end marked on the playing video, 15 to 45 seconds. Classroom rows only.
    const playerRef = useRef<HTMLVideoElement | null>(null)
    const [clip, setClip] = useState<{ start: number | null; end: number | null }>({ start: null, end: null })
    const [clipping, setClipping] = useState(false)
    const [clipNote, setClipNote] = useState<{ ok: boolean; text: string } | null>(null)

    const markClip = (which: "start" | "end") => {
        const t = playerRef.current?.currentTime
        if (t === undefined || !Number.isFinite(t)) return
        setClipNote(null)
        setClip(c => ({ ...c, [which]: Math.round(t * 10) / 10 }))
    }
    const clipSeconds = clip.start !== null && clip.end !== null ? Math.round((clip.end - clip.start) * 10) / 10 : null
    const clipOk = clipSeconds !== null && clipSeconds >= 15 && clipSeconds <= 45

    const saveClip = async (rec: AdminRecordingRow) => {
        if (!clipOk || clip.start === null || clip.end === null) return
        setClipping(true)
        setClipNote(null)
        try {
            const res = await fetch("/api/admin/classroom-clip", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ recordingId: rec.id, start: clip.start, end: clip.end }),
            })
            const body = await res.json().catch(() => ({ error: `the server answered ${res.status}` }))
            if (body?.success) {
                setClipNote({ ok: true, text: `Saved to ${rec.studentName || "the student"}'s Dropbox folder as "${body.name}".` })
                setClip({ start: null, end: null })
            } else {
                setClipNote({ ok: false, text: `Not saved: ${body?.error || "the request failed"}` })
            }
        } catch {
            setClipNote({ ok: false, text: "Not saved: the request failed" })
        } finally {
            setClipping(false)
        }
    }

    const togglePlay = async (row: RecordingsViewRow) => {
        setClip({ start: null, end: null })
        setClipNote(null)
        setPlayError(null)
        if (playingKey === row.key) {
            setPlayingKey(null)
            return
        }
        setPlayingKey(row.key)
        if (row.url || !row.transcriptId || fetchedLinks[row.key]) return
        try {
            const res = await transcriptRecordingLink(row.transcriptId)
            if ("error" in res) {
                if (playingKeyRef.current === row.key) setPlayError(res.error)
            } else setFetchedLinks(links => ({ ...links, [row.key]: res.url }))
        } catch {
            if (playingKeyRef.current === row.key) setPlayError("Could not get the recording from Dropbox")
        }
    }

    const load = useCallback(async (all: boolean) => {
        setIsLoading(true)
        try {
            const res = await getRecordingsView(all)
            if ("error" in res) setLoadError(res.error)
            else {
                setRows(res.rows)
                setShowAll(res.since === null)
                setLoadError(null)
            }
        } catch {
            setLoadError("Could not load the recordings")
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => { load(false) }, [load])

    const reload = () => load(showAll)

    const attach = async (rec: AdminRecordingRow, lessonId: string) => {
        setAttaching(rec.id)
        setNotice(null)
        try {
            const res = await attachClassroomRecording(rec.id, lessonId)
            if ("error" in res) {
                setNotice({ ok: false, text: `Not attached: ${res.error}` })
            } else {
                setNotice({ ok: true, text: `Attached to the lesson of ${studioDateTime(res.date, res.time)}. Not logged, no email sent.` })
                await reload()
            }
        } catch {
            setNotice({ ok: false, text: "Not attached: the request failed" })
        } finally {
            setAttaching(null)
        }
    }

    // #1096: tests and no-shows only (under 5 minutes, on no lesson); asks first.
    const remove = async (rec: AdminRecordingRow) => {
        const length = rec.minutes === null ? "" : ` (${lengthLabel(rec.minutes)})`
        const who = rec.studentName || "this student"
        if (!window.confirm(`Delete the ${recordedLabel(rec)} recording of ${who}${length}? It is on no lesson. The video file is removed from storage for good.`)) return
        setDeleting(rec.id)
        setNotice(null)
        try {
            const res = await deleteClassroomRecording(rec.id)
            if ("error" in res) {
                setNotice({ ok: false, text: `Not deleted: ${res.error}` })
            } else {
                setNotice({ ok: true, text: `Deleted the ${recordedLabel(rec)} recording.` })
                if (playingKey === `c:${rec.id}`) setPlayingKey(null)
                await reload()
            }
        } catch {
            setNotice({ ok: false, text: "Not deleted: the request failed" })
        } finally {
            setDeleting(null)
        }
    }

    // Students in the loaded list, for the filter.
    const students = useMemo(() => {
        const byKey = new Map<string, string>()
        for (const r of rows || []) if (!byKey.has(studentKey(r))) byKey.set(studentKey(r), r.studentName || "Unknown")
        return [...byKey.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name))
    }, [rows])

    const forStudent = useMemo(
        () => (rows || []).filter(r => studentFilter === ALL_STUDENTS || studentKey(r) === studentFilter),
        [rows, studentFilter],
    )
    const counts = useMemo(() => ({
        all: forStudent.length,
        classroom: forStudent.filter(r => r.source === "classroom").length,
        zoom: forStudent.filter(r => r.source === "zoom").length,
    }), [forStudent])
    const visible = useMemo(
        () => forStudent.filter(r => sourceFilter === "all" || r.source === sourceFilter),
        [forStudent, sourceFilter],
    )
    const withTranscript = visible.filter(r => r.transcriptId).length

    const classroomStatusCell = (rec: AdminRecordingRow) => {
        const s = rec.status
        switch (s.kind) {
            case "attached":
                return (
                    <Button variant="link" className="h-auto p-0 text-left" onClick={() => onOpenDay(s.date)}>
                        On {studioDateTime(s.date, s.time)}
                    </Button>
                )
            case "too_short":
                return (
                    <div className="flex flex-col items-start gap-1">
                        <Badge variant="outline" className="text-muted-foreground">Too short (no-show)</Badge>
                        {rec.canDelete && (
                            <Button size="sm" variant="outline" className="text-destructive" disabled={deleting !== null} onClick={() => remove(rec)}>
                                {deleting === rec.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1" />Delete</>}
                            </Button>
                        )}
                    </div>
                )
            case "not_attached_yet":
                return (
                    <div className="flex flex-col items-start gap-1">
                        <span className="text-amber-700 dark:text-amber-400">Fits {studioDateTime(s.date, s.time)}, not attached yet</span>
                        <Button size="sm" variant="outline" disabled={attaching !== null} onClick={() => attach(rec, s.lessonId)}>
                            {attaching === rec.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Attach to that lesson"}
                        </Button>
                    </div>
                )
            case "lesson_has_other_video":
                return (
                    <span className="text-muted-foreground">
                        Fits {studioDateTime(s.date, s.time)}, which already has another video
                    </span>
                )
            case "no_lesson":
                return (
                    <div className="flex flex-col items-start gap-1">
                        <span className="font-medium text-destructive">No lesson at that time</span>
                        {s.nearest ? (
                            <Button size="sm" variant="outline" disabled={attaching !== null} onClick={() => attach(rec, s.nearest!.lessonId)}>
                                {attaching === rec.id
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : `Attach to nearest lesson (${studioDateTime(s.nearest.date, s.nearest.time)})`}
                            </Button>
                        ) : (
                            <span className="text-xs text-muted-foreground">No lesson without a video within a week</span>
                        )}
                    </div>
                )
        }
    }

    const lessonCell = (row: RecordingsViewRow) => {
        if (row.classroom) return classroomStatusCell(row.classroom)
        const lesson = row.lesson
        if (!lesson) return <span className="text-muted-foreground">No lesson</span>
        const open = (
            <Button variant="link" className="h-auto p-0 text-left" onClick={() => onOpenDay(lesson.date)}>
                {row.onLesson ? "On" : "Lesson of"} {studioDateTime(lesson.date, lesson.time)}
            </Button>
        )
        if (row.onLesson) return open
        return (
            <div className="flex flex-col items-start">
                {open}
                <span className="text-xs text-muted-foreground">Not the video on that lesson</span>
            </div>
        )
    }

    const openTranscript = (row: RecordingsViewRow) => {
        if (!row.transcriptId) return
        setTranscript({
            result: {
                id: row.transcriptId,
                studentName: row.studentName || "Unknown student",
                recordedOn: isoToStudioWallClock(row.recordedAt).localDate,
            },
            seconds: 0,
        })
    }

    return (
        <div className="space-y-4">
            {/* #954: search what was said in every lesson (transcripts made on the Mac, #953) */}
            <TranscriptSearch />

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <CardTitle className="text-2xl font-serif">Recordings</CardTitle>
                            <CardDescription>
                                Classroom and Zoom recordings together, newest first, in studio time.
                                Attaching a classroom recording only puts the video on the lesson: it doesn&apos;t log it or email anyone.
                                Delete is offered only for tests and no-shows (under 5 minutes, on no lesson).
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={reload} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                            Refresh
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {notice && (
                        <p className={`mb-4 rounded-md border p-3 text-sm ${notice.ok ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                            {notice.text}
                        </p>
                    )}
                    {rows && rows.length > 0 && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <div role="group" aria-label="Recorded in" className="inline-flex rounded-md border p-0.5">
                                {(["all", "classroom", "zoom"] as const).map(s => (
                                    <Button
                                        key={s}
                                        size="sm"
                                        variant={sourceFilter === s ? "secondary" : "ghost"}
                                        className="h-7 px-3"
                                        aria-pressed={sourceFilter === s}
                                        onClick={() => setSourceFilter(s)}
                                    >
                                        {s === "all" ? "All" : s === "classroom" ? "Classroom" : "Zoom"}
                                        <span className="ml-1 text-xs text-muted-foreground">{counts[s]}</span>
                                    </Button>
                                ))}
                            </div>
                            <Select value={studentFilter} onValueChange={setStudentFilter}>
                                <SelectTrigger className="h-8 w-[220px]" aria-label="Student">
                                    <SelectValue placeholder="All students" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_STUDENTS}>All students</SelectItem>
                                    {students.map(s => (
                                        <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {loadError ? (
                        <p className="text-sm text-destructive">{loadError}</p>
                    ) : rows === null ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : visible.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                            {rows.length === 0 ? "No recordings in the last 90 days" : "No recordings match"}
                        </p>
                    ) : (
                        // A size container, so the player below a row is as wide as the
                        // visible table even when the table scrolls sideways on a phone.
                        <div className="@container">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10"><span className="sr-only">Play</span></TableHead>
                                    <TableHead>Recorded</TableHead>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Length</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Lesson</TableHead>
                                    <TableHead>Transcript</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visible.map(row => {
                                    const rec = row.classroom
                                    const isPlaying = playingKey === row.key
                                    const playUrl = row.url ?? fetchedLinks[row.key] ?? null
                                    return (
                                    <Fragment key={row.key}>
                                    <TableRow>
                                        <TableCell className="w-10 pr-0">
                                            {rec?.thumbnailUrl ? (
                                                // A small picture from the video (#1095); tapping it plays here.
                                                <button
                                                    type="button"
                                                    onClick={() => togglePlay(row)}
                                                    aria-label={isPlaying ? "Close the player" : "Play here"}
                                                    title={isPlaying ? "Close the player" : "Play here"}
                                                    className="relative block h-[54px] w-24 overflow-hidden rounded-md bg-black ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={rec.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                                                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                                                        {isPlaying ? <X className="h-5 w-5" /> : <PlayCircle className="h-6 w-6" />}
                                                    </span>
                                                </button>
                                            ) : (
                                                <Button
                                                    size="icon"
                                                    variant={isPlaying ? "secondary" : "ghost"}
                                                    className="h-8 w-8"
                                                    onClick={() => togglePlay(row)}
                                                    aria-label={isPlaying ? "Close the player" : "Play here"}
                                                    title={isPlaying ? "Close the player" : "Play here"}
                                                >
                                                    {isPlaying ? <X className="h-4 w-4" /> : <PlayCircle className="h-5 w-5" />}
                                                </Button>
                                            )}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {row.url ? (
                                                <a href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" title="Open in a new tab">
                                                    {recordedLabel(row)}
                                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                                </a>
                                            ) : (
                                                recordedLabel(row)
                                            )}
                                            {rec && !rec.hasStartStamp && (
                                                <div className="text-xs text-muted-foreground">when it stopped (no start time on file)</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {row.studentId
                                                ? <StudentLink id={row.studentId} name={row.studentName || "Student"} />
                                                : <span className="text-muted-foreground">{row.studentName || "Unknown"}</span>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {lengthLabel(row.minutes)}
                                            {rec && rec.markers.length > 0 && (
                                                <div className="text-xs text-muted-foreground">
                                                    {rec.markers.length} marked moment{rec.markers.length === 1 ? "" : "s"}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell><RecordingSourceLabel source={row.source} /></TableCell>
                                        <TableCell className="whitespace-normal">{lessonCell(row)}</TableCell>
                                        <TableCell>
                                            {row.transcriptId ? (
                                                <Button
                                                    variant="link"
                                                    className="h-auto gap-1 p-0"
                                                    onClick={() => openTranscript(row)}
                                                    title="Read the transcript and play from any line"
                                                >
                                                    <FileText className="h-3.5 w-3.5" />Yes
                                                </Button>
                                            ) : (
                                                <span className="text-muted-foreground">No</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                    {isPlaying && (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={7} className="whitespace-normal p-2">
                                                <div className="sticky left-0 w-[calc(100cqw-1rem)] max-w-3xl space-y-2">
                                                    {/* Mounted only once Play is pressed; nothing loads before that. */}
                                                    {playUrl ? (
                                                        <VideoPlayer
                                                            key={row.key}
                                                            url={playUrl}
                                                            markers={rec?.markers ?? []}
                                                            videoRef={playerRef}
                                                            autoPlay
                                                            onError={() => setPlayError("This video can't play here. Open it in a new tab instead.")}
                                                        />
                                                    ) : !playError && (
                                                        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                                                            <Loader2 className="h-4 w-4 animate-spin" /> Getting the recording from Dropbox...
                                                        </div>
                                                    )}
                                                    {playError && <p className="text-sm text-destructive">{playError}</p>}
                                                    {rec && (
                                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                                            <span className="inline-flex items-center gap-1 font-medium"><Scissors className="h-4 w-4" />Clip</span>
                                                            <Button size="sm" variant="outline" onClick={() => markClip("start")} disabled={clipping}>Start here</Button>
                                                            <Button size="sm" variant="outline" onClick={() => markClip("end")} disabled={clipping}>End here</Button>
                                                            <span className="text-muted-foreground">
                                                                {clip.start === null && clip.end === null
                                                                    ? "Pause where it should start, tap Start here, then the same for the end (15 to 45 seconds)."
                                                                    : `${clip.start === null ? "?" : formatMarkerTime(clip.start)} to ${clip.end === null ? "?" : formatMarkerTime(clip.end)}`
                                                                        + (clipSeconds === null ? "" : clipOk ? ` (${Math.round(clipSeconds)} s)` : ` (${Math.round(clipSeconds)} s: needs 15 to 45)`)}
                                                            </span>
                                                            <Button size="sm" disabled={!clipOk || clipping} onClick={() => saveClip(rec)}>
                                                                {clipping ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Making the clip</> : "Save clip to Dropbox"}
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {rec && clipNote && (
                                                        <p className={`text-sm ${clipNote.ok ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>{clipNote.text}</p>
                                                    )}
                                                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                                        <span>{row.studentName || "Unknown"}, {recordedLabel(row)}</span>
                                                        {playUrl && (
                                                            <a href={playUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline shrink-0">
                                                                New tab <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    </Fragment>
                                    )
                                })}
                            </TableBody>
                        </Table>
                        </div>
                    )}
                    {rows && (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                            <span>
                                {visible.length} shown, {withTranscript} with a transcript.
                                {showAll ? " Every recording is listed." : " The last 90 days."}
                            </span>
                            {!showAll && (
                                <Button variant="outline" size="sm" onClick={() => load(true)} disabled={isLoading}>
                                    {isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                                    Show older
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <TranscriptPlayer playing={transcript} terms={[]} onClose={() => setTranscript(null)} />
        </div>
    )
}
