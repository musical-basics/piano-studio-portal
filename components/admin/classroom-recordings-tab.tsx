"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExternalLink, Loader2, PlayCircle, RefreshCw, Scissors, Trash2, X } from "lucide-react"
import { attachClassroomRecording, deleteClassroomRecording, getClassroomRecordings, type AdminRecordingRow } from "@/app/actions/classroom-recordings"
import { isoToStudioWallClock, studioToday, studioTzAbbr } from "@/lib/studio-timezone"
import { StudentLink } from "@/components/admin/student-panel"
import { formatMarkerTime, VideoPlayer } from "@/components/video-player"

interface ClassroomRecordingsTabProps {
    /** Open the admin day schedule on this studio date (where the lesson is). */
    onOpenDay: (date: string) => void
}

/** "Sun, Nov 16, 12:00pm EST" for a studio wall-clock date and HH:MM (year added when not this year). */
function studioDateTime(date: string, time: string): string {
    const sameYear = date.slice(0, 4) === studioToday().slice(0, 4)
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...(sameYear ? {} : { year: "numeric" }),
        timeZone: "UTC",
    })
    const [h, m] = time.split(":")
    const hn = parseInt(h, 10)
    return `${day}, ${hn % 12 || 12}:${m}${hn >= 12 ? "pm" : "am"} ${studioTzAbbr(date)}`
}

function recordedLabel(row: AdminRecordingRow): string {
    const { localDate, localTime } = isoToStudioWallClock(row.recordedAt)
    return studioDateTime(localDate, localTime)
}

function lengthLabel(minutes: number | null): string {
    if (minutes === null) return "unknown"
    const total = Math.round(minutes)
    if (total < 60) return `${total} min`
    return `${Math.floor(total / 60)} h ${total % 60} min`
}

export function ClassroomRecordingsTab({ onOpenDay }: ClassroomRecordingsTabProps) {
    const [rows, setRows] = useState<AdminRecordingRow[] | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [attaching, setAttaching] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    // Shown above the table, next to the rows it is about.
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
    // The one recording playing in place (#791); opening another closes it.
    const [playingId, setPlayingId] = useState<string | null>(null)
    const [playError, setPlayError] = useState<string | null>(null)

    // Clip maker (#1094): start and end marked on the playing video, 15 to 45 seconds.
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

    const saveClip = async (row: AdminRecordingRow) => {
        if (!clipOk || clip.start === null || clip.end === null) return
        setClipping(true)
        setClipNote(null)
        try {
            const res = await fetch("/api/admin/classroom-clip", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ recordingId: row.id, start: clip.start, end: clip.end }),
            })
            const body = await res.json().catch(() => ({ error: `the server answered ${res.status}` }))
            if (body?.success) {
                setClipNote({ ok: true, text: `Saved to ${row.studentName || "the student"}'s Dropbox folder as "${body.name}".` })
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

    const togglePlay = (id: string) => {
        setClip({ start: null, end: null })
        setClipNote(null)
        setPlayError(null)
        setPlayingId(current => (current === id ? null : id))
    }

    const load = useCallback(async () => {
        setIsLoading(true)
        try {
            const res = await getClassroomRecordings()
            if ("error" in res) setLoadError(res.error)
            else {
                setRows(res.rows)
                setLoadError(null)
            }
        } catch {
            setLoadError("Could not load the recordings")
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const attach = async (row: AdminRecordingRow, lessonId: string) => {
        setAttaching(row.id)
        setNotice(null)
        try {
            const res = await attachClassroomRecording(row.id, lessonId)
            if ("error" in res) {
                setNotice({ ok: false, text: `Not attached: ${res.error}` })
            } else {
                setNotice({ ok: true, text: `Attached to the lesson of ${studioDateTime(res.date, res.time)}. Not logged, no email sent.` })
                await load()
            }
        } catch {
            setNotice({ ok: false, text: "Not attached: the request failed" })
        } finally {
            setAttaching(null)
        }
    }

    // #1096: tests and no-shows only (under 5 minutes, on no lesson); asks first.
    const remove = async (row: AdminRecordingRow) => {
        const length = row.minutes === null ? "" : ` (${lengthLabel(row.minutes)})`
        const who = row.studentName || "this student"
        if (!window.confirm(`Delete the ${recordedLabel(row)} recording of ${who}${length}? It is on no lesson. The video file is removed from storage for good.`)) return
        setDeleting(row.id)
        setNotice(null)
        try {
            const res = await deleteClassroomRecording(row.id)
            if ("error" in res) {
                setNotice({ ok: false, text: `Not deleted: ${res.error}` })
            } else {
                setNotice({ ok: true, text: `Deleted the ${recordedLabel(row)} recording.` })
                if (playingId === row.id) setPlayingId(null)
                await load()
            }
        } catch {
            setNotice({ ok: false, text: "Not deleted: the request failed" })
        } finally {
            setDeleting(null)
        }
    }

    const statusCell = (row: AdminRecordingRow) => {
        const s = row.status
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
                        {row.canDelete && (
                            <Button size="sm" variant="outline" className="text-destructive" disabled={deleting !== null} onClick={() => remove(row)}>
                                {deleting === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1" />Delete</>}
                            </Button>
                        )}
                    </div>
                )
            case "not_attached_yet":
                return (
                    <div className="flex flex-col items-start gap-1">
                        <span className="text-amber-700 dark:text-amber-400">Fits {studioDateTime(s.date, s.time)}, not attached yet</span>
                        <Button size="sm" variant="outline" disabled={attaching !== null} onClick={() => attach(row, s.lessonId)}>
                            {attaching === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Attach to that lesson"}
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
                            <Button size="sm" variant="outline" disabled={attaching !== null} onClick={() => attach(row, s.nearest!.lessonId)}>
                                {attaching === row.id
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

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="text-2xl font-serif">Classroom recordings</CardTitle>
                        <CardDescription>
                            Newest first. Times are studio time. Attaching only puts the video on the lesson: it doesn&apos;t log it or email anyone. Delete is offered only for tests and no-shows (under 5 minutes, on no lesson).
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
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
                {loadError ? (
                    <p className="text-sm text-destructive">{loadError}</p>
                ) : rows === null ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : rows.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No classroom recordings yet</p>
                ) : (
                    // A size container, so the player below a row is as wide as the
                    // visible table even when the table scrolls sideways on a phone.
                    <div className="@container">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10"><span className="sr-only">Play</span></TableHead>
                                <TableHead>Student</TableHead>
                                <TableHead>Recorded</TableHead>
                                <TableHead>Length</TableHead>
                                <TableHead>Lesson</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map(row => (
                                <Fragment key={row.id}>
                                <TableRow>
                                    <TableCell className="w-10 pr-0">
                                        {row.thumbnailUrl ? (
                                            // A small picture from the video (#1095); tapping it plays here.
                                            <button
                                                type="button"
                                                onClick={() => togglePlay(row.id)}
                                                aria-label={playingId === row.id ? "Close the player" : "Play here"}
                                                title={playingId === row.id ? "Close the player" : "Play here"}
                                                className="relative block h-[54px] w-24 overflow-hidden rounded-md bg-black ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={row.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                                                <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                                                    {playingId === row.id ? <X className="h-5 w-5" /> : <PlayCircle className="h-6 w-6" />}
                                                </span>
                                            </button>
                                        ) : (
                                            <Button
                                                size="icon"
                                                variant={playingId === row.id ? "secondary" : "ghost"}
                                                className="h-8 w-8"
                                                onClick={() => togglePlay(row.id)}
                                                aria-label={playingId === row.id ? "Close the player" : "Play here"}
                                                title={playingId === row.id ? "Close the player" : "Play here"}
                                            >
                                                {playingId === row.id ? <X className="h-4 w-4" /> : <PlayCircle className="h-5 w-5" />}
                                            </Button>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {row.studentName ? <StudentLink id={row.studentId} name={row.studentName} /> : <span className="text-muted-foreground">{row.studentId || "Unknown"}</span>}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" title="Open in a new tab">
                                            {recordedLabel(row)}
                                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                        </a>
                                        {!row.hasStartStamp && (
                                            <div className="text-xs text-muted-foreground">when it stopped (no start time on file)</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        {lengthLabel(row.minutes)}
                                        {row.markers.length > 0 && (
                                            <div className="text-xs text-muted-foreground">
                                                {row.markers.length} marked moment{row.markers.length === 1 ? "" : "s"}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="whitespace-normal">{statusCell(row)}</TableCell>
                                </TableRow>
                                {playingId === row.id && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={5} className="whitespace-normal p-2">
                                            <div className="sticky left-0 w-[calc(100cqw-1rem)] max-w-3xl space-y-2">
                                                {/* Mounted only once Play is pressed; nothing loads before that. */}
                                                <VideoPlayer
                                                    key={row.id}
                                                    url={row.url}
                                                    markers={row.markers}
                                                    videoRef={playerRef}
                                                    autoPlay
                                                    onError={() => setPlayError("This video can't play here. Open it in a new tab instead.")}
                                                />
                                                {playError && <p className="text-sm text-destructive">{playError}</p>}
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
                                                    <Button size="sm" disabled={!clipOk || clipping} onClick={() => saveClip(row)}>
                                                        {clipping ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Making the clip</> : "Save clip to Dropbox"}
                                                    </Button>
                                                </div>
                                                {clipNote && (
                                                    <p className={`text-sm ${clipNote.ok ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>{clipNote.text}</p>
                                                )}
                                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                                    <span>{row.studentName || "Unknown"}, {recordedLabel(row)}</span>
                                                    <a href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline shrink-0">
                                                        New tab <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                                </Fragment>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
