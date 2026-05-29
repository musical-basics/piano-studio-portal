"use client"

import React, { useEffect, useState } from "react"
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Loader2, Music, Calendar, Clock, ArrowDown, ArrowRight, FileText, Video, AlertCircle } from "lucide-react"
import { getStudentLessonHistory } from "@/app/actions/student-history"
import { getStudentResources, updateAssignmentNote } from "@/app/actions/resources"
import { useToast } from "@/hooks/use-toast"
import type { StudentRoster } from "@/types/admin"
import { getLessonIntentFlagsAction, updateLessonIntentFlagStatusAction } from "@/app/actions/lesson-intent-flags"

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
    const { toast } = useToast()
    const [lessons, setLessons] = useState<LessonHistory[]>([])
    const [resources, setResources] = useState<any[]>([])
    const [flags, setFlags] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (open && student) {
            setLoading(true)
            Promise.all([
                getStudentLessonHistory(student.id),
                getStudentResources(student.id),
                getLessonIntentFlagsAction(student.id)
            ]).then(([lessonRes, resourceRes, flagRes]) => {
                if ('lessons' in lessonRes) {
                    setLessons(lessonRes.lessons as LessonHistory[])
                }
                if (resourceRes.resources) {
                    setResources(resourceRes.resources)
                }
                if (flagRes && 'flags' in flagRes) {
                    setFlags(flagRes.flags || [])
                }
                setLoading(false)
            })
        } else {
            setLessons([])
            setResources([])
            setFlags([])
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

    const handleUpdateFlagStatus = async (flagId: string, status: 'resolved' | 'dismissed') => {
        const result = await updateLessonIntentFlagStatusAction(flagId, status)
        if (result.success) {
            setFlags(prev =>
                prev.map(f =>
                    f.id === flagId
                        ? {
                              ...f,
                              status,
                              resolved_at: result.flag.resolved_at,
                              dismissed_at: result.flag.dismissed_at,
                              resolved_by: result.flag.resolved_by,
                              dismissed_by: result.flag.dismissed_by,
                          }
                        : f
                )
            )
            toast({
                title: `Flag ${status === 'resolved' ? 'Resolved' : 'Dismissed'}`,
                description: `The lesson intent flag has been updated to ${status}.`,
            })
        } else {
            toast({
                variant: "destructive",
                title: "Failed to update flag",
                description: result.error || "An unknown error occurred",
            })
        }
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

                {/* Lesson Intent Flags */}
                <div className="px-4 pb-6 mt-4 border-t pt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-between">
                        <span>Lesson Intent & Requests</span>
                        {flags.filter(f => f.status === 'active').length > 0 && (
                            <Badge variant="destructive" className="animate-pulse">
                                {flags.filter(f => f.status === 'active').length} Active
                            </Badge>
                        )}
                    </h3>

                    {loading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : flags.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No requests or intent flags recorded</p>
                    ) : (
                        <div className="space-y-3">
                            {flags.map((flag) => {
                                const isActive = flag.status === 'active'
                                return (
                                    <div
                                        key={flag.id}
                                        className={`border rounded-lg p-3 space-y-2 transition-colors ${
                                            isActive
                                                ? 'bg-destructive/5 border-destructive/20'
                                                : 'bg-muted/30 border-muted text-muted-foreground'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-semibold capitalize">
                                                        {flag.intent.replace('_', ' ')}
                                                    </span>
                                                    <Badge variant={isActive ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                                                        {formatDate(flag.target_date)}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] uppercase">
                                                        {flag.source}
                                                    </Badge>
                                                </div>
                                                {flag.note && (
                                                    <p className={`text-xs leading-relaxed ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                                        {flag.note}
                                                    </p>
                                                )}
                                                <div className="text-[10px] text-muted-foreground">
                                                    Created {new Date(flag.created_at).toLocaleDateString()}
                                                    {flag.status !== 'active' && (
                                                        <span>
                                                            {" • "}
                                                            {flag.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                                                            {flag.resolved_at && ` on ${new Date(flag.resolved_at).toLocaleDateString()}`}
                                                            {flag.dismissed_at && ` on ${new Date(flag.dismissed_at).toLocaleDateString()}`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {isActive && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 px-2 text-xs border-green-500/30 text-green-600 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-950/20"
                                                        onClick={() => handleUpdateFlagStatus(flag.id, 'resolved')}
                                                    >
                                                        Resolve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-xs text-muted-foreground hover:bg-muted"
                                                        onClick={() => handleUpdateFlagStatus(flag.id, 'dismissed')}
                                                    >
                                                        Dismiss
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Lesson History */}
                <div className="px-4 pb-6 border-t pt-4">
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

                {/* Assigned Practice Materials */}
                <div className="px-4 pb-6 mt-6 border-t pt-6">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Assigned Practice Materials
                    </h3>

                    {loading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : resources.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No materials assigned</p>
                    ) : (
                        <div className="space-y-4">
                            {resources.map(resource => (
                                <AssignmentNoteEditor
                                    key={resource.id}
                                    resource={resource}
                                    studentId={student.id}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

function AssignmentNoteEditor({ resource, studentId }: { resource: any, studentId: string }) {
    const { toast } = useToast()
    const [note, setNote] = useState(resource.student_note || "")
    const [savedNote, setSavedNote] = useState(resource.student_note || "")
    const [isSaving, setIsSaving] = useState(false)

    const handleSave = async () => {
        setIsSaving(true)
        const result = await updateAssignmentNote(resource.id, studentId, note)
        setIsSaving(false)

        if (result.success) {
            setSavedNote(note)
            toast({
                title: "Instructions Saved",
                description: `Notes for "${resource.title}" have been updated and the student has been notified.`,
            })
        } else {
            toast({
                variant: "destructive",
                title: "Save Failed",
                description: result.error || "Could not save the instructions.",
            })
        }
    }

    return (
        <div className="border rounded-lg p-3 space-y-2 bg-card">
            <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{resource.title}</span>
            </div>
            <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add specific instructions for this student..."
                className="text-sm min-h-[80px] resize-none"
            />
            <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={isSaving || note === savedNote}>
                    {isSaving ? "Saving..." : "Save Note"}
                </Button>
            </div>
        </div>
    )
}
