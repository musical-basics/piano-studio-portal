"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Music, Video, FileText, Pencil, Undo2 } from "lucide-react"
import type { LessonWithStudent } from "@/types/admin"
import { ZoomAttendanceLine, useLessonAttendance } from "@/components/admin/zoom-attendance-line"

interface CompletedTabProps {
    lessons: LessonWithStudent[]
    onEdit: (lesson: LessonWithStudent) => void
    /** Give back the credit this log took, with a reason (asks first, #794). */
    onUndoLog?: (lesson: LessonWithStudent) => void
}

export function CompletedTab({ lessons, onEdit, onUndoLog }: CompletedTabProps) {
    // #964: who joined each Zoom lesson, from the saved attendance
    const attendance = useLessonAttendance(lessons.map(l => l.id))

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T00:00:00')
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        })
    }

    const formatTime = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number)
        const ampm = hours >= 12 ? 'PM' : 'AM'
        const displayHours = hours % 12 || 12
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-2xl font-serif">Completed Lessons</CardTitle>
                        <CardDescription>Past lesson history</CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-base px-4 py-2">
                        {lessons.length} Lessons
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {lessons.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No completed lessons</p>
                    ) : (
                        lessons.map((lesson) => (
                            <Card key={lesson.id} className="border">
                                <CardContent className="p-4 sm:p-6">
                                    {/* On a phone the buttons go under the lesson, so the page keeps the phone's width. */}
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="flex flex-col items-center justify-center h-14 w-14 shrink-0 bg-muted rounded-lg">
                                                <Music className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-lg">{lesson.student.name || 'Student'}</h3>
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        <span>{formatDate(lesson.date)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        <span>{formatTime(lesson.time)}</span>
                                                    </div>
                                                </div>
                                                <ZoomAttendanceLine lesson={lesson} views={attendance} />
                                                {lesson.notes && (
                                                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                                        {lesson.notes}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-start sm:items-end gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => onEdit(lesson)}
                                                >
                                                    <Pencil className="h-3 w-3 mr-1" />
                                                    Edit
                                                </Button>
                                                {onUndoLog && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => onUndoLog(lesson)}
                                                        title="Give back the credit this log took (asks first)"
                                                    >
                                                        <Undo2 className="h-3 w-3 mr-1" />
                                                        Undo log
                                                    </Button>
                                                )}
                                                <Badge variant="default" className="bg-green-600">Completed</Badge>
                                                {typeof (lesson as any).free_reason === 'string' && (
                                                    <Badge variant="outline" title={(lesson as any).free_reason || undefined}>Free</Badge>
                                                )}
                                            </div>
                                            {(lesson.video_url || lesson.sheet_music_url) && (
                                                <div className="flex gap-2">
                                                    {lesson.video_url && (
                                                        <a
                                                            href={lesson.video_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium transition-colors"
                                                        >
                                                            <Video className="h-3 w-3" />
                                                            Video
                                                        </a>
                                                    )}
                                                    {lesson.sheet_music_url && (
                                                        <a
                                                            href={lesson.sheet_music_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 text-xs font-medium transition-colors"
                                                        >
                                                            <FileText className="h-3 w-3" />
                                                            Sheet Music
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
