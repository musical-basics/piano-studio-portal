"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ClipboardList, Download, FileText, Video } from "lucide-react"
import type { Lesson } from "@/lib/supabase/database.types"
import { homeworkItems, tickedIndexes, type HomeworkTick } from "@/lib/homework"
import { tickHomework } from "@/app/actions/homework"

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
 *
 * Since #945 the latest logged lesson's homework is a checklist the family
 * ticks off during the week, saved for the teacher to see before the next
 * lesson (homework_ticks, through a server action that checks it is their own
 * lesson). Older weeks, and notes standing in for homework, are read only. An
 * admin previewing the student sees the ticks but can't change them.
 */

interface HomeworkTabProps {
    /** Completed lessons, newest first. */
    lessons: Lesson[]
    studentId: string
    /** Items this family has ticked (#945). */
    ticks?: HomeworkTick[]
    /** An admin previewing this student: ticks show, ticking is off. */
    isPreview?: boolean
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

function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-").map(Number)
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    })
}

export function HomeworkTab({ lessons, studentId, ticks = [], isPreview = false }: HomeworkTabProps) {
    const assignments = useMemo<Assignment[]>(() => {
        const explicit = lessons.filter((l) => (l as any).homework?.trim())

        const source = explicit.length > 0 ? explicit : lessons.filter((l) => l.notes?.trim())

        return source.map((lesson) => ({
            lessonId: lesson.id,
            date: lesson.date,
            isExplicit: explicit.length > 0,
            items: homeworkItems(((lesson as any).homework || lesson.notes || "") as string),
            sheetMusicUrl: lesson.sheet_music_url,
            hasVideo: Boolean(lesson.video_url),
        }))
    }, [lessons])

    // The latest logged lesson (date, then time): only its homework can be ticked.
    const latestLessonId = useMemo(() => {
        const sorted = [...lessons].sort((a, b) => b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time)))
        return sorted[0]?.id ?? null
    }, [lessons])

    // Saved ticks, as "lessonId:index".
    const savedDone = useMemo(() => {
        const out: Record<string, boolean> = {}
        for (const a of assignments) {
            if (!a.isExplicit) continue
            for (const i of tickedIndexes(a.lessonId, a.items, ticks)) out[`${a.lessonId}:${i}`] = true
        }
        return out
    }, [assignments, ticks])
    const [done, setDone] = useState<Record<string, boolean>>(savedDone)
    useEffect(() => { setDone(savedDone) }, [savedDone])
    const [saving, setSaving] = useState<string | null>(null)
    const [tickError, setTickError] = useState<string | null>(null)

    const toggle = async (lessonId: string, index: number, text: string) => {
        if (isPreview || saving) return
        const key = `${lessonId}:${index}`
        const checked = !done[key]
        setDone((prev) => ({ ...prev, [key]: checked }))
        setSaving(key)
        setTickError(null)
        try {
            const res = await tickHomework(lessonId, index, text, checked)
            if ("error" in res) {
                setDone((prev) => ({ ...prev, [key]: !checked }))
                setTickError(res.error)
            }
        } catch {
            setDone((prev) => ({ ...prev, [key]: !checked }))
            setTickError("Your tick could not be saved just now. Please try again.")
        } finally {
            setSaving(null)
        }
    }

    const [current, ...previous] = assignments
    // Ticking is for the latest logged lesson's own homework only.
    const canTick = Boolean(current?.isExplicit && current.lessonId === latestLessonId)

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
                {canTick && current.items.length > 1 && (
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

                    <ul className="space-y-3" data-testid="homework-current">
                        {current.items.map((item, i) => {
                            const key = `${current.lessonId}:${i}`
                            const checked = Boolean(done[key])
                            return (
                                <li key={key} className="flex items-start gap-3">
                                    <Checkbox
                                        id={key}
                                        checked={checked}
                                        onCheckedChange={() => toggle(current.lessonId, i, item)}
                                        disabled={!canTick || isPreview || saving !== null}
                                        className="mt-0.5"
                                        data-homework-item={i}
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

            {tickError && <p className="text-sm text-destructive px-1">{tickError}</p>}
            <p className="text-xs text-muted-foreground px-1">
                {canTick
                    ? isPreview
                        ? "Preview: only the family can tick these."
                        : "Tick items off as you practise. Your teacher sees what you have ticked before your next lesson."
                    : "Ticking is for the homework from your latest lesson."}
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
                                                    disabled
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
