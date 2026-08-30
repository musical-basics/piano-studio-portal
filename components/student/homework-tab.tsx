"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ClipboardList, Download, FileText, Video } from "lucide-react"
import type { Lesson } from "@/lib/supabase/database.types"

/**
 * The Homework tab.
 *
 * Homework used to be buried inside the lesson-notes blob, so "what am I meant
 * to practise this week" meant reading back through a lesson recap. `homework`
 * is now its own field on a lesson, and this tab pulls the newest one to the top
 * as a checklist, with earlier weeks kept underneath for reference.
 *
 * Until a lesson has homework filled in, this falls back to that lesson's notes
 * so the tab isn't empty for students whose teacher hasn't started using the
 * field yet.
 */

interface HomeworkTabProps {
    /** Completed lessons, newest first. */
    lessons: Lesson[]
    studentId: string
}

interface Assignment {
    lessonId: string
    date: string
    /** True when this came from the dedicated homework field rather than the notes. */
    isExplicit: boolean
    items: string[]
    sheetMusicUrl: string | null
    hasVideo: boolean
}

/**
 * Split a homework blob into checklist items.
 *
 * One item per line is the documented convention, and common list markers
 * ("1.", "-", "•") are stripped so a pasted list doesn't render its bullets
 * twice. A single-line assignment stays a single item.
 */
function toItems(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*•‣]|\d+[.)])\s*/, "").trim())
        .filter(Boolean)
}

function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-").map(Number)
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    })
}

/**
 * Ticked items live in this browser only.
 *
 * Nothing about a tick is worth a round trip or a table: it's a scratch pad for
 * the student's own week, and the teacher tracks progress in the lesson itself.
 * Reads and writes are guarded because private-mode browsers throw on access.
 */
function storageKey(studentId: string) {
    return `homework-done:${studentId}`
}

function loadDone(studentId: string): Record<string, boolean> {
    try {
        const raw = window.localStorage.getItem(storageKey(studentId))
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

export function HomeworkTab({ lessons, studentId }: HomeworkTabProps) {
    const assignments = useMemo<Assignment[]>(() => {
        const explicit = lessons.filter((l) => (l as any).homework?.trim())

        const source = explicit.length > 0 ? explicit : lessons.filter((l) => l.notes?.trim())

        return source.map((lesson) => ({
            lessonId: lesson.id,
            date: lesson.date,
            isExplicit: explicit.length > 0,
            items: toItems(((lesson as any).homework || lesson.notes || "") as string),
            sheetMusicUrl: lesson.sheet_music_url,
            hasVideo: Boolean(lesson.video_url),
        }))
    }, [lessons])

    const [done, setDone] = useState<Record<string, boolean>>({})

    // Read after mount: localStorage isn't available during the server render.
    useEffect(() => {
        setDone(loadDone(studentId))
    }, [studentId])

    const toggle = (key: string) => {
        setDone((prev) => {
            const next = { ...prev, [key]: !prev[key] }
            try {
                window.localStorage.setItem(storageKey(studentId), JSON.stringify(next))
            } catch {
                // A browser blocking site data just means ticks don't survive a reload.
            }
            return next
        })
    }

    const [current, ...previous] = assignments

    if (!current) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-serif font-semibold">Homework</h2>
                </div>
                <Card className="border-2 border-dashed p-12 text-center bg-muted/10">
                    <ClipboardList className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                    <h3 className="font-semibold text-lg mb-1 font-serif">No homework yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        What to practise for the week will show up here after your next lesson.
                    </p>
                </Card>
            </div>
        )
    }

    const currentDone = current.items.filter((_, i) => done[`${current.lessonId}:${i}`]).length

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-2xl font-serif font-semibold">Homework</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        From your lesson on {formatDate(current.date)}
                    </p>
                </div>
                {current.items.length > 1 && (
                    <Badge variant={currentDone === current.items.length ? "default" : "secondary"}>
                        {currentDone} of {current.items.length} done
                    </Badge>
                )}
            </div>

            {/* This week */}
            <Card className="border-2 border-primary/30 bg-primary/[0.03]">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold font-serif text-lg">This week</h3>
                    </div>

                    <ul className="space-y-3">
                        {current.items.map((item, i) => {
                            const key = `${current.lessonId}:${i}`
                            const checked = Boolean(done[key])
                            return (
                                <li key={key} className="flex items-start gap-3">
                                    <Checkbox
                                        id={key}
                                        checked={checked}
                                        onCheckedChange={() => toggle(key)}
                                        className="mt-0.5"
                                    />
                                    <label
                                        htmlFor={key}
                                        className={`text-sm leading-relaxed cursor-pointer whitespace-pre-wrap ${checked ? "line-through text-muted-foreground" : ""
                                            }`}
                                    >
                                        {item}
                                    </label>
                                </li>
                            )
                        })}
                    </ul>

                    {(current.sheetMusicUrl || current.hasVideo) && (
                        <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
                            {current.sheetMusicUrl && (
                                <Button variant="outline" size="sm" asChild>
                                    <a href={current.sheetMusicUrl} download target="_blank" rel="noopener noreferrer">
                                        <Download className="h-4 w-4 mr-2" />
                                        Sheet music
                                    </a>
                                </Button>
                            )}
                            {current.hasVideo && (
                                <Badge variant="secondary" className="text-xs">
                                    <Video className="h-3 w-3 mr-1" />
                                    Lesson recording in the Lessons tab
                                </Badge>
                            )}
                        </div>
                    )}

                    {!current.isExplicit && (
                        <p className="text-xs text-muted-foreground pt-2 border-t">
                            Taken from your lesson notes. Once your teacher starts writing homework separately, it
                            will appear here on its own.
                        </p>
                    )}
                </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground px-1">
                Ticking items is just for you, and is remembered on this device.
            </p>

            {/* Earlier weeks */}
            {previous.length > 0 && (
                <div className="space-y-3 pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Earlier weeks
                    </h3>
                    {previous.slice(0, 10).map((assignment) => (
                        <Card key={assignment.lessonId} className="border-2">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="font-medium text-sm">{formatDate(assignment.date)}</p>
                                    {assignment.sheetMusicUrl && (
                                        <a
                                            href={assignment.sheetMusicUrl}
                                            download
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-muted-foreground hover:text-foreground"
                                            title="Download sheet music"
                                        >
                                            <FileText className="h-4 w-4" />
                                        </a>
                                    )}
                                </div>
                                <ul className="space-y-2">
                                    {assignment.items.map((item, i) => {
                                        const key = `${assignment.lessonId}:${i}`
                                        const checked = Boolean(done[key])
                                        return (
                                            <li key={key} className="flex items-start gap-3">
                                                <Checkbox
                                                    id={key}
                                                    checked={checked}
                                                    onCheckedChange={() => toggle(key)}
                                                    className="mt-0.5"
                                                />
                                                <label
                                                    htmlFor={key}
                                                    className={`text-sm leading-relaxed cursor-pointer whitespace-pre-wrap ${checked ? "line-through text-muted-foreground" : ""
                                                        }`}
                                                >
                                                    {item}
                                                </label>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
