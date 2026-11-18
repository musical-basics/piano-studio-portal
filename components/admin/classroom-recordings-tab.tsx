"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, PlayCircle, RefreshCw } from "lucide-react"
import { attachClassroomRecording, getClassroomRecordings, type AdminRecordingRow } from "@/app/actions/classroom-recordings"
import { isoToStudioWallClock, studioToday, studioTzAbbr } from "@/lib/studio-timezone"

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
    // Shown above the table (the admin page has no toaster outside Inquiries).
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

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
                return <Badge variant="outline" className="text-muted-foreground">Too short (no-show)</Badge>
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
                            Newest first. Times are studio time. Attaching only puts the video on the lesson: it doesn&apos;t log it or email anyone.
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
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead>Recorded</TableHead>
                                <TableHead>Length</TableHead>
                                <TableHead>Lesson</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map(row => (
                                <TableRow key={row.id}>
                                    <TableCell className="font-medium">
                                        {row.studentName || <span className="text-muted-foreground">{row.studentId || "Unknown"}</span>}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                            <PlayCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                            {recordedLabel(row)}
                                        </a>
                                        {!row.hasStartStamp && (
                                            <div className="text-xs text-muted-foreground">when it stopped (no start time on file)</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">{lengthLabel(row.minutes)}</TableCell>
                                    <TableCell className="whitespace-normal">{statusCell(row)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
