"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Music, Video, Upload, XCircle, Bell, MessageCircle, MonitorPlay, CheckCircle2, HelpCircle } from "lucide-react"
import type { TodayLesson, LessonWithStudent } from "@/types/admin"

const CLASSROOM_URL = process.env.NEXT_PUBLIC_CLASSROOM_URL || "https://classroom.musicalbasics.com"

interface DashboardTabProps {
    lessons: TodayLesson[]
    adminZoomLink?: string | null
    onLog: (lesson: TodayLesson) => void
    onReschedule: (lesson: LessonWithStudent) => void
    onNoShow: (lesson: TodayLesson) => void
    onCancel: (lessonId: string, studentName: string) => void
    onRemind: (lesson: TodayLesson) => void
    onMessage: (studentId: string) => void
    isLoading?: boolean
}

export function DashboardTab({
    lessons,
    adminZoomLink,
    onLog,
    onReschedule,
    onNoShow,
    onCancel,
    onRemind,
    onMessage,
    isLoading = false
}: DashboardTabProps) {

    const getClassroomLink = (studentId: string, name?: string | null, email?: string | null) => {
        const params = new URLSearchParams({
            email: email || "",
            name: name || "",
        })
        return `${CLASSROOM_URL}/start/${studentId}?${params.toString()}`
    }

    // Helper functions
    const formatTime = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number)
        const ampm = hours >= 12 ? 'PM' : 'AM'
        const displayHours = hours % 12 || 12
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
    }

    const today = new Date()
    const formattedDate = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-2xl font-serif">Today's Schedule</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                            <Calendar className="h-4 w-4" />
                            {formattedDate}
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-base px-4 py-2">
                        {lessons.length} Lessons
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {lessons.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No lessons scheduled for today</p>
                    ) : (
                        lessons.map((lesson) => (
                            <Card key={lesson.id} className="border-2">
                                <CardContent className="flex items-center justify-between p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-center justify-center h-14 w-14 bg-primary text-primary-foreground rounded-lg">
                                            <span className="text-xs font-medium">
                                                {formatTime(lesson.time).split(' ')[0]}
                                            </span>
                                            <span className="text-xs">{formatTime(lesson.time).split(' ')[1]}</span>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">{lesson.student.name || 'Student'}</h3>
                                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                                <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    <span>{lesson.duration || 60} min</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Music className="h-3 w-3" />
                                                    <span>{lesson.student.credits} credits left</span>
                                                </div>
                                                {/* Confirmation Status */}
                                                {lesson.is_confirmed ? (
                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 gap-1 px-2 py-0.5 h-6">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Confirmed
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 gap-1 px-2 py-0.5 h-6">
                                                        <HelpCircle className="h-3 w-3" />
                                                        Unconfirmed
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap justify-end max-w-[50%]">
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
                                            size="sm"
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white border-0"
                                            onClick={() => window.open(getClassroomLink(lesson.student.id, lesson.student.name, lesson.student.email), '_blank')}
                                            title="Open Teacher Interface"
                                        >
                                            <MonitorPlay className="h-4 w-4 mr-1" />
                                            Room
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onMessage(lesson.student.id)}
                                            disabled={isLoading}
                                        >
                                            <MessageCircle className="h-4 w-4 mr-1" />
                                            Message
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onRemind(lesson)}
                                            disabled={isLoading}
                                        >
                                            <Bell className="h-4 w-4 mr-1" />
                                            Remind
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => onLog(lesson)}
                                            disabled={isLoading}
                                        >
                                            <Upload className="h-4 w-4 mr-1" />
                                            Log
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onReschedule(({ ...lesson, student_id: lesson.student.id } as any))}
                                            disabled={isLoading}
                                        >
                                            <Calendar className="h-4 w-4 mr-1" />
                                            Resched
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => onNoShow(lesson)}
                                            disabled={isLoading}
                                        >
                                            <XCircle className="h-4 w-4 mr-1" />
                                            No-Show
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => onCancel(lesson.id, lesson.student.name || 'Student')}
                                            disabled={isLoading}
                                        >
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
