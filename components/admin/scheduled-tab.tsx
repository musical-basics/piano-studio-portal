"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Music, Video, Plus, XCircle, MoreVertical } from "lucide-react"
import type { LessonWithStudent } from "@/types/admin"

interface ScheduledTabProps {
    lessons: LessonWithStudent[]
    adminZoomLink?: string
    onReschedule: (lesson: LessonWithStudent) => void
    onCancel: (lessonId: string, studentName: string) => void
    onScheduleNew: () => void
}

export function ScheduledTab({ lessons, adminZoomLink, onReschedule, onCancel, onScheduleNew }: ScheduledTabProps) {
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
                        <CardTitle className="text-2xl font-serif">Upcoming Lessons</CardTitle>
                        <CardDescription>All scheduled lessons</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-base px-4 py-2">
                            {lessons.length} Lessons
                        </Badge>
                        <Button onClick={onScheduleNew}>
                            <Plus className="h-4 w-4 mr-2" />
                            Schedule Lesson
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {lessons.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No scheduled lessons</p>
                    ) : (
                        lessons.map((lesson) => (
                            <Card key={lesson.id} className="border-2">
                                <CardContent className="flex items-center justify-between p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-center justify-center h-14 w-14 bg-primary text-primary-foreground rounded-lg">
                                            <span className="text-xs font-medium">{formatDate(lesson.date).split(',')[0]}</span>
                                            <span className="text-xs">{formatDate(lesson.date).split(' ')[1]}</span>
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
                                                <div className="flex items-center gap-1">
                                                    <Music className="h-3 w-3" />
                                                    <span>{lesson.duration || 60} min</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <Badge variant="outline">Scheduled</Badge>
                                    <div className="flex gap-2 ml-4">
                                        {(lesson.zoom_link || lesson.student.zoom_link || adminZoomLink) && (
                                            <Button
                                                size="sm"
                                                className="bg-blue-600 hover:bg-blue-700"
                                                asChild
                                            >
                                                <a
                                                    href={lesson.zoom_link || lesson.student.zoom_link || adminZoomLink || '#'}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    <Video className="h-4 w-4 mr-1" />
                                                    Zoom
                                                </a>
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onReschedule(lesson)}
                                        >
                                            <Calendar className="h-4 w-4 mr-1" />
                                            Reschedule
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => onCancel(lesson.id, lesson.student.name || 'Student')}
                                        >
                                            <XCircle className="h-4 w-4 mr-1" />
                                            Cancel
                                        </Button>
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
