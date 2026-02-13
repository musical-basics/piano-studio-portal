"use client"

import React, { useEffect, useState } from "react"
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Loader2, Music, Calendar, Clock, ArrowDown, ArrowRight, FileText, Video } from "lucide-react"
import { getStudentLessonHistory } from "@/app/actions/student-history"
import type { StudentRoster } from "@/types/admin"

interface StudentProfileSheetProps {
    student: StudentRoster | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

type LessonHistory = {
    id: string
    date: string
    time: string
    duration: number
    status: string
    notes: string | null
    credit_snapshot: number | null
    credit_snapshot_before: number | null
    video_url: string | null
    sheet_music_url: string | null
}

export function StudentProfileSheet({ student, open, onOpenChange }: StudentProfileSheetProps) {
    const [lessons, setLessons] = useState<LessonHistory[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (open && student) {
            setLoading(true)
            getStudentLessonHistory(student.id).then((res) => {
                if ('lessons' in res) {
                    setLessons(res.lessons as LessonHistory[])
                }
                setLoading(false)
            })
        } else {
            setLessons([])
        }
    }, [open, student?.id])

    if (!student) return null

    const formatDate = (dateStr: string) => {
        const d = new Date(`${dateStr}T00:00:00`)
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }

    const formatTime = (timeStr: string) => {
        const [h, m] = timeStr.split(':')
        const hn = parseInt(h, 10)
        const ap = hn >= 12 ? 'PM' : 'AM'
        const h12 = hn % 12 || 12
        return `${h12}:${m} ${ap}`
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-xl">{student.name || 'Student'}</SheetTitle>
                    <SheetDescription>{student.email}</SheetDescription>
                </SheetHeader>

                {/* Student Info Summary */}
                <div className="px-4 pb-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                            <span className="text-xs text-muted-foreground font-medium">Credits</span>
                            <Badge variant={student.credits <= 1 ? "destructive" : "secondary"} className="text-sm">
                                {student.credits}
                            </Badge>
                        </div>
                        {student.lesson_day && (
                            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{student.lesson_day}s{student.lesson_time ? ` at ${student.lesson_time}` : ''}</span>
                            </div>
                        )}
                        {student.phone && (
                            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                                <span className="text-xs text-muted-foreground">{student.phone}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Lesson History */}
                <div className="px-4 pb-6">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Completed Lessons
                    </h3>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : lessons.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No completed lessons yet
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {lessons.map((lesson) => (
                                <div
                                    key={lesson.id}
                                    className="border rounded-lg p-3 space-y-2 hover:bg-muted/30 transition-colors"
                                >
                                    {/* Date + Time row */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Music className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-medium">
                                                {formatDate(lesson.date)}
                                            </span>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatTime(lesson.time)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {lesson.video_url && (
                                                <a href={lesson.video_url} target="_blank" rel="noopener noreferrer"
                                                    className="text-blue-500 hover:text-blue-600">
                                                    <Video className="h-3.5 w-3.5" />
                                                </a>
                                            )}
                                            {lesson.sheet_music_url && (
                                                <a href={lesson.sheet_music_url} target="_blank" rel="noopener noreferrer"
                                                    className="text-green-500 hover:text-green-600">
                                                    <FileText className="h-3.5 w-3.5" />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Credit row */}
                                    {(lesson.credit_snapshot !== null || lesson.credit_snapshot_before !== null) && (
                                        <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                                            <span className="text-muted-foreground font-medium">Credits:</span>
                                            <span className="font-mono font-semibold">
                                                {lesson.credit_snapshot_before ?? '?'}
                                            </span>
                                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-red-500 font-mono font-semibold">-1</span>
                                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                            <span className="font-mono font-semibold">
                                                {lesson.credit_snapshot ?? '?'}
                                            </span>
                                        </div>
                                    )}

                                    {/* Notes */}
                                    {lesson.notes && (
                                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                                            {lesson.notes}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
