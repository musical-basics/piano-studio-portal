"use client"
import { AddStudentModal } from "@/components/add-student-modal"
import { EditStudentModal } from "@/components/edit-student-modal"
import { MasterCalendar } from "./master-calendar"
import { ProfileSettingsDialog } from "@/components/profile-settings-dialog"
import { useState, useRef, Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Music, Clock, AlertCircle, Upload, XCircle, Calendar, MessageCircle, LayoutDashboard, Plus, Loader2, Video, FileText, Pencil } from "lucide-react"
import { AdminChat } from "@/components/admin-chat"
import { logout } from "@/app/login/actions"
import { logLesson, markNoShow, scheduleLesson, updateLesson } from "@/app/actions/lessons"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import type { Profile, Lesson } from "@/lib/supabase/database.types"

// Types for the component props
export type TodayLesson = LessonWithZoom & {
    student: Profile
}

// Extends Lesson type to safely handle zoom_link until types are regenerated
type LessonWithZoom = Lesson & { zoom_link?: string | null }


export type LessonWithStudent = LessonWithZoom & {
    student: Profile
}

export type StudentRoster = Profile & {
    last_lesson_date?: string
    lesson_day?: string | null
}

export interface AdminDashboardProps {
    admin: Profile
    todaysLessons: TodayLesson[]
    scheduledLessons: LessonWithStudent[]
    completedLessons: LessonWithStudent[]
    students: StudentRoster[]
    totalUnread: number
}

export function AdminDashboard({ admin, todaysLessons, scheduledLessons, completedLessons, students, totalUnread }: AdminDashboardProps) {
    const { toast } = useToast()
    const [showLogLessonModal, setShowLogLessonModal] = useState(false)
    const [showScheduleModal, setShowScheduleModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [selectedLesson, setSelectedLesson] = useState<TodayLesson | null>(null)
    const [editingLesson, setEditingLesson] = useState<LessonWithStudent | null>(null)
    const [selectedStudent, setSelectedStudent] = useState<StudentRoster | null>(null)
    const [selectedStudentForLog, setSelectedStudentForLog] = useState<StudentRoster | null>(null)
    const [lessonNotes, setLessonNotes] = useState("")
    const [videoUrl, setVideoUrl] = useState("")
    const [sheetMusicUrl, setSheetMusicUrl] = useState("")
    const [scheduleDate, setScheduleDate] = useState("")
    const [scheduleTime, setScheduleTime] = useState("15:00")
    const [scheduleDuration, setScheduleDuration] = useState<number>(60)
    const [isRescheduling, setIsRescheduling] = useState(false)
    const [rescheduleLessonId, setRescheduleLessonId] = useState<string | null>(null)
    const [logDate, setLogDate] = useState("")
    const [logTime, setLogTime] = useState("12:00")
    const [logDuration, setLogDuration] = useState<number>(60)
    const [isLoading, setIsLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const editFileInputRef = useRef<HTMLInputElement>(null)

    const handleLogLesson = (lesson: TodayLesson) => {
        setSelectedLesson(lesson)
        setSelectedStudentForLog(null)
        setShowLogLessonModal(true)
    }

    const handleLogPastLesson = (student: StudentRoster) => {
        setSelectedStudentForLog(student)
        setSelectedLesson(null)
        // Set default date to today
        const today = new Date().toISOString().split('T')[0]
        setLogDate(today)
        setLogTime("12:00")
        setLogDuration(60)
        setShowLogLessonModal(true)
    }

    const handleSaveLesson = async () => {
        if (!selectedLesson && !selectedStudentForLog) return

        setIsLoading(true)

        let result;

        if (selectedLesson) {
            result = await logLesson(
                selectedLesson.id,
                lessonNotes,
                videoUrl || undefined,
                sheetMusicUrl || undefined
            )
        } else if (selectedStudentForLog) {
            // Import dynamically to handle the new action
            const { logPastLesson } = await import("@/app/actions/lessons")
            result = await logPastLesson(
                selectedStudentForLog.id,
                logDate,
                logTime,
                logDuration,
                lessonNotes,
                videoUrl || undefined,
                sheetMusicUrl || undefined
            )
        }

        setIsLoading(false)

        if (result?.error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error
            })
        } else {
            toast({
                title: "Lesson Logged",
                description: `Successfully logged lesson.Credit deducted.`
            })
            setShowLogLessonModal(false)
            setLessonNotes("")
            setVideoUrl("")
            setSheetMusicUrl("")
            setSelectedLesson(null)
            setSelectedStudentForLog(null)
        }
    }

    const handleMarkNoShow = async (lesson: TodayLesson) => {
        if (confirm(`Mark ${lesson.student.name} as No - Show ? This will deduct 1 credit without refund or makeup option.`)) {
            setIsLoading(true)
            const result = await markNoShow(lesson.id)
            setIsLoading(false)

            if (result.error) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: result.error
                })
            } else {
                toast({
                    title: "No-Show Recorded",
                    description: `${lesson.student.name} marked as No - Show.Credit forfeited.`
                })
            }
        }
    }

    const handleOpenSchedule = (student: StudentRoster) => {
        setSelectedStudent(student)
        // Default to tomorrow
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setScheduleDate(tomorrow.toISOString().split('T')[0])
        setScheduleTime("15:00")
        setScheduleDuration(60)
        setIsRescheduling(false)
        setRescheduleLessonId(null)
        setShowScheduleModal(true)
    }

    const openNewSchedule = () => {
        setSelectedStudent(null)
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setScheduleDate(tomorrow.toISOString().split('T')[0])
        setScheduleTime("15:00")
        setScheduleDuration(60)
        setIsRescheduling(false)
        setRescheduleLessonId(null)
        setShowScheduleModal(true)
    }

    const handleReschedule = (lesson: LessonWithStudent) => {
        // Pre-fill modal with lesson details
        setIsRescheduling(true)
        setRescheduleLessonId(lesson.id)

        // Find the student object from the roster to ensure we have the full StudentRoster object if possible,
        // otherwise construct a minimal one or use the lesson.student
        const studentFromRoster = students.find(s => s.id === lesson.student_id)
        // We need a StudentRoster object (Profile + last_lesson_date), but lesson.student is just Profile.
        // Casting is safe enough here since we mainly need id and name for display/logic
        setSelectedStudent(studentFromRoster || (lesson.student as StudentRoster))

        setScheduleDate(lesson.date)
        setScheduleTime(lesson.time)
        setScheduleDuration(lesson.duration || 60)

        setShowScheduleModal(true)
    }

    const handleCancelLesson = async (lessonId: string, studentName: string) => {
        if (confirm(`Are you sure you want to cancel the lesson for ${studentName} ? The student will be fully refunded.`)) {
            setIsLoading(true)
            // Import dynamically or pass as prop if import fails, but since this is client component in app router we can use server actions directly
            const { cancelLesson } = await import("@/app/actions/lessons")

            const result = await cancelLesson(lessonId)
            setIsLoading(false)

            if (result.error) {
                toast({
                    variant: "destructive",
                    title: "Cancellation Failed",
                    description: result.error
                })
            } else {
                toast({
                    title: "Lesson Cancelled",
                    description: result.message
                })
            }
        }
    }

    const handleScheduleSubmit = async () => {
        if (!selectedStudent || !scheduleDate || !scheduleTime) return

        setIsLoading(true)

        if (isRescheduling && rescheduleLessonId) {
            // Import dynamically to avoid circular dependencies if any (though unlikely here)
            const { rescheduleLesson } = await import("@/app/actions/lessons")
            const result = await rescheduleLesson(rescheduleLessonId, scheduleDate, scheduleTime, scheduleDuration)

            if (result.error) {
                toast({
                    variant: "destructive",
                    title: "Rescheduling Failed",
                    description: result.error
                })
            } else {
                toast({
                    title: "Lesson Rescheduled",
                    description: result.message
                })
                setShowScheduleModal(false)
                setSelectedStudent(null)
                setIsRescheduling(false)
                setRescheduleLessonId(null)
            }
        } else {
            const result = await scheduleLesson(selectedStudent.id, scheduleDate, scheduleTime, scheduleDuration)

            if (result.error) {
                toast({
                    variant: "destructive",
                    title: "Scheduling Failed",
                    description: result.error
                })
            } else {
                toast({
                    title: "Lesson Scheduled",
                    description: result.message
                })
                setShowScheduleModal(false)
                setSelectedStudent(null)
            }
        }
        setIsLoading(false)
    }

    const handleEditLesson = (lesson: LessonWithStudent) => {
        setEditingLesson(lesson)
        setLessonNotes(lesson.notes || '')
        setVideoUrl(lesson.video_url || '')
        setSheetMusicUrl(lesson.sheet_music_url || '')
        setShowEditModal(true)
    }

    const handleSaveEdit = async () => {
        if (!editingLesson) return

        setIsLoading(true)
        const result = await updateLesson(
            editingLesson.id,
            lessonNotes,
            videoUrl,
            sheetMusicUrl
        )
        setIsLoading(false)

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: result.error
            })
        } else {
            toast({
                title: "Lesson Updated",
                description: result.message
            })
            setShowEditModal(false)
            setEditingLesson(null)
            setLessonNotes('')
            setVideoUrl('')
            setSheetMusicUrl('')
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.name.endsWith('.pdf')) {
            toast({
                variant: "destructive",
                title: "Invalid File",
                description: "Please upload a PDF file"
            })
            return
        }

        // Get the lesson ID for the file path
        // If ad-hoc logging, we don't have a lesson ID yet to upload to. 
        // We'll need to prevent upload until save, OR (simpler for now) just disable upload for ad-hoc logging
        // A better UX would be to allow it, upload to a temp location, then move it. 
        // For now, let's warn the user or just disable it if !lessonId

        const lessonId = isEdit ? editingLesson?.id : selectedLesson?.id

        if (!lessonId && selectedStudentForLog) {
            toast({
                variant: "destructive",
                title: "Upload not supported yet",
                description: "Please save the lesson first, then edit it to upload materials."
            })
            return
        }

        if (!lessonId) {
            toast({
                variant: "destructive",
                title: "Upload Failed",
                description: "No lesson selected"
            })
            return
        }

        setIsUploading(true)

        try {
            const supabase = createClient()

            // Create unique filename with timestamp
            const timestamp = Date.now()
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
            const filePath = `sheet_music / ${lessonId}/${timestamp}_${safeName}`

            // Upload to Supabase Storage
            const { data, error: uploadError } = await supabase.storage
                .from('lesson_materials')
                .upload(filePath, file, { upsert: true })

            if (uploadError) {
                throw uploadError
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('lesson_materials')
                .getPublicUrl(filePath)

            setSheetMusicUrl(publicUrl)
            toast({
                title: "Upload Complete",
                description: "PDF uploaded successfully"
            })
        } catch (error) {
            console.error('Upload error:', error)
            toast({
                variant: "destructive",
                title: "Upload Failed",
                description: error instanceof Error ? error.message : "Unknown error occurred"
            })
        } finally {
            setIsUploading(false)
            // Reset file input
            if (isEdit && editFileInputRef.current) {
                editFileInputRef.current.value = ''
            } else if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    // Format time for display (HH:MM:SS -> h:mm AM/PM)
    const formatTime = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number)
        const ampm = hours >= 12 ? 'PM' : 'AM'
        const displayHours = hours % 12 || 12
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
    }

    // Format date for display
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T00:00:00')
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        })
    }

    // Get today's date formatted
    const today = new Date()
    const formattedDate = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b bg-card sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
                                <Music className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <div>
                                <h1 className="text-xl font-serif font-semibold">{admin.studio_name || "Teacher Admin Portal"}</h1>
                                <p className="text-sm text-muted-foreground">{admin.name || 'Admin'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" asChild>
                                <a href="/admin/events" className="gap-2">
                                    <Calendar className="h-4 w-4" />
                                    Events
                                </a>
                            </Button>
                            <Button variant="outline" asChild>
                                <a href="/admin/editor2" className="gap-2">
                                    <Pencil className="h-4 w-4" />
                                    Site Builder
                                </a>
                            </Button>
                            <ProfileSettingsDialog
                                profile={admin}
                                trigger={
                                    <Button variant="outline">
                                        Profile Settings
                                    </Button>
                                }
                            />
                            <form action={logout}>
                                <Button variant="ghost" type="submit">
                                    Sign Out
                                </Button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <Tabs defaultValue="dashboard" className="space-y-8">
                    <TabsList className="grid w-full max-w-3xl grid-cols-5">
                        <TabsTrigger value="dashboard" className="gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            <span className="hidden sm:inline">Today</span>
                        </TabsTrigger>
                        <TabsTrigger value="calendar" className="gap-2">
                            <Calendar className="h-4 w-4" />
                            <span className="hidden sm:inline">Calendar</span>
                        </TabsTrigger>
                        <TabsTrigger value="scheduled" className="gap-2">
                            <Clock className="h-4 w-4" />
                            <span className="hidden sm:inline">List</span>
                        </TabsTrigger>
                        <TabsTrigger value="completed" className="gap-2">
                            <Music className="h-4 w-4" />
                            <span className="hidden sm:inline">Completed</span>
                        </TabsTrigger>
                        <TabsTrigger value="messages" className="gap-2 relative">
                            <MessageCircle className="h-4 w-4" />
                            <span className="hidden sm:inline">Messages</span>
                            {totalUnread > 0 && (
                                <Badge
                                    variant="destructive"
                                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                                >
                                    {totalUnread}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="dashboard" className="space-y-8">
                        {/* Daily Schedule */}
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
                                        {todaysLessons.length} Lessons
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {todaysLessons.length === 0 ? (
                                        <p className="text-center text-muted-foreground py-8">No lessons scheduled for today</p>
                                    ) : (
                                        todaysLessons.map((lesson) => (
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
                                                                    <span>60 min</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <Music className="h-3 w-3" />
                                                                    <span>{lesson.student.credits} credits left</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 flex-wrap justify-end max-w-[50%]">
                                                        {(lesson.zoom_link || lesson.student.zoom_link || admin.zoom_link) && (
                                                            <Button
                                                                size="sm"
                                                                className="bg-blue-600 hover:bg-blue-700"
                                                                asChild
                                                            >
                                                                <a
                                                                    href={lesson.zoom_link || lesson.student.zoom_link || admin.zoom_link || '#'}
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
                                                            onClick={() => handleLogLesson(lesson)}
                                                            disabled={isLoading}
                                                        >
                                                            <Upload className="h-4 w-4 mr-1" />
                                                            Log
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleReschedule(({ ...lesson, student_id: lesson.student.id } as any))}
                                                            disabled={isLoading}
                                                        >
                                                            <Calendar className="h-4 w-4 mr-1" />
                                                            Resched
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() => handleMarkNoShow(lesson)}
                                                            disabled={isLoading}
                                                        >
                                                            <XCircle className="h-4 w-4 mr-1" />
                                                            No-Show
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            className="text-destructive hover:text-destructive"
                                                            onClick={() => handleCancelLesson(lesson.id, lesson.student.name || 'Student')}
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

                        {/* Student Roster */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-2xl font-serif">Student Roster</CardTitle>
                                        <CardDescription>Complete overview of all active students</CardDescription>
                                    </div>
                                    <AddStudentModal />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="font-semibold">Name</TableHead>
                                                <TableHead className="font-semibold">Contact</TableHead>
                                                <TableHead className="font-semibold">Weekday</TableHead>
                                                <TableHead className="font-semibold text-center">Credits</TableHead>
                                                <TableHead className="font-semibold text-center">Balance Due</TableHead>
                                                <TableHead className="font-semibold">Status</TableHead>
                                                <TableHead className="font-semibold text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {students.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                                        No students found
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                students.map((student) => (
                                                    <TableRow key={student.id} className={Number(student.balance_due) > 0 ? "bg-destructive/5" : ""}>
                                                        <TableCell className="font-medium">{student.name || 'Unknown'}</TableCell>
                                                        <TableCell>
                                                            <div className="text-sm">
                                                                <div>{student.email}</div>
                                                                <div className="text-muted-foreground">{student.phone}</div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {student.lesson_day ? (
                                                                <Badge variant="outline">{student.lesson_day}</Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground text-sm">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant={student.credits <= 1 ? "destructive" : "secondary"}>
                                                                {student.credits}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {Number(student.balance_due) > 0 ? (
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                                                    <span className="font-semibold text-destructive">
                                                                        ${Number(student.balance_due).toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted-foreground">$0.00</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {student.credits === 0 ? (
                                                                <Badge variant="outline" className="bg-warning/10 text-warning-foreground border-warning">
                                                                    Needs Renewal
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="default">Active</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <EditStudentModal student={student} />
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleLogPastLesson(student)}
                                                                >
                                                                    <Upload className="h-4 w-4 mr-1" />
                                                                    Log
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="default"
                                                                    onClick={() => handleOpenSchedule(student)}
                                                                >
                                                                    <Plus className="h-4 w-4 mr-1" />
                                                                    Schedule
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Scheduled Lessons Tab */}
                    <TabsContent value="scheduled" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-2xl font-serif">Upcoming Lessons</CardTitle>
                                        <CardDescription>All scheduled lessons</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="secondary" className="text-base px-4 py-2">
                                            {scheduledLessons.length} Lessons
                                        </Badge>
                                        <Button onClick={openNewSchedule}>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Schedule Lesson
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {scheduledLessons.length === 0 ? (
                                        <p className="text-center text-muted-foreground py-8">No scheduled lessons</p>
                                    ) : (
                                        scheduledLessons.map((lesson) => (
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
                                                        {(lesson.zoom_link || lesson.student.zoom_link || admin.zoom_link) && (
                                                            <Button
                                                                size="sm"
                                                                className="bg-blue-600 hover:bg-blue-700"
                                                                asChild
                                                            >
                                                                <a
                                                                    href={lesson.zoom_link || lesson.student.zoom_link || admin.zoom_link || '#'}
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
                                                            onClick={() => handleReschedule(lesson)}
                                                        >
                                                            <Calendar className="h-4 w-4 mr-1" />
                                                            Reschedule
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            onClick={() => handleCancelLesson(lesson.id, lesson.student.name || 'Student')}
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
                    </TabsContent>

                    {/* Completed Lessons Tab */}
                    <TabsContent value="completed" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-2xl font-serif">Completed Lessons</CardTitle>
                                        <CardDescription>Past lesson history</CardDescription>
                                    </div>
                                    <Badge variant="secondary" className="text-base px-4 py-2">
                                        {completedLessons.length} Lessons
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {completedLessons.length === 0 ? (
                                        <p className="text-center text-muted-foreground py-8">No completed lessons</p>
                                    ) : (
                                        completedLessons.map((lesson) => (
                                            <Card key={lesson.id} className="border">
                                                <CardContent className="p-6">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex flex-col items-center justify-center h-14 w-14 bg-muted rounded-lg">
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
                                                                {lesson.notes && (
                                                                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                                                        {lesson.notes}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleEditLesson(lesson)}
                                                                >
                                                                    <Pencil className="h-3 w-3 mr-1" />
                                                                    Edit
                                                                </Button>
                                                                <Badge variant="default" className="bg-green-600">Completed</Badge>
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
                    </TabsContent>

                    <TabsContent value="messages">
                        <AdminChat />
                    </TabsContent>

                    <TabsContent value="calendar">
                        <Suspense fallback={
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        }>
                            <MasterCalendar />
                        </Suspense>
                    </TabsContent>
                </Tabs >
            </main >

            {/* Log Lesson Modal */}
            < Dialog open={showLogLessonModal} onOpenChange={setShowLogLessonModal} >
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-serif">Log Lesson</DialogTitle>
                        <DialogDescription>
                            Record notes and upload materials for {selectedLesson?.student.name || selectedStudentForLog?.name}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Date/Time selectors for Ad-Hoc Logging */}
                        {selectedStudentForLog && (
                            <div className="grid grid-cols-2 gap-4 border-b pb-4">
                                <div className="space-y-2">
                                    <Label htmlFor="log-date" className="text-base">Date</Label>
                                    <Input
                                        id="log-date"
                                        type="date"
                                        value={logDate}
                                        onChange={(e) => setLogDate(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="log-time" className="text-base">Time</Label>
                                    <Input
                                        id="log-time"
                                        type="time"
                                        value={logTime}
                                        onChange={(e) => setLogTime(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}


                        <div className="space-y-2">
                            <Label htmlFor="notes" className="text-base">
                                Teacher Notes
                            </Label>
                            <Textarea
                                id="notes"
                                placeholder="Enter your lesson notes, progress observations, and homework assignments..."
                                value={lessonNotes}
                                onChange={(e) => setLessonNotes(e.target.value)}
                                rows={6}
                                className="resize-none"
                            />
                        </div>


                        <div className="space-y-2">
                            <Label htmlFor="video" className="text-base">
                                Video Recording URL
                            </Label>
                            <Input
                                id="video"
                                type="url"
                                placeholder="https://storage.supabase.co/..."
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Upload video to Supabase Storage and paste the URL here</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="sheet-music" className="text-base">
                                Sheet Music PDF
                            </Label>
                            <div className="space-y-3">
                                <div className="flex gap-2 items-center">
                                    <Input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => handleFileUpload(e, false)}
                                        className="flex-1"
                                        disabled={isUploading}
                                    />
                                    {isUploading && (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground">Or paste a URL directly:</div>
                                <Input
                                    type="url"
                                    placeholder="https://..."
                                    value={sheetMusicUrl}
                                    onChange={(e) => setSheetMusicUrl(e.target.value)}
                                />
                                {sheetMusicUrl && (
                                    <div className="flex items-center gap-2 text-sm text-green-600">
                                        <FileText className="h-4 w-4" />
                                        <a href={sheetMusicUrl} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-xs">
                                            {sheetMusicUrl.split('/').pop() || 'Sheet Music'}
                                        </a>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSheetMusicUrl('')}
                                            className="h-6 px-2 text-red-500 hover:text-red-700"
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setShowLogLessonModal(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveLesson} disabled={isLoading}>
                            {isLoading ? 'Saving...' : 'Save Lesson'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog >

            {/* Schedule Lesson Modal */}
            < Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal} >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-serif">
                            {isRescheduling ? 'Reschedule Lesson' : 'Schedule Lesson'}
                        </DialogTitle>
                        <DialogDescription>
                            {isRescheduling
                                ? `Update lesson details for ${selectedStudent?.name || 'Student'}`
                                : selectedStudent
                                    ? `Schedule a new lesson for ${selectedStudent.name}`
                                    : 'Select a student and choose lesson details'
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Student Selector */}
                        <div className="space-y-2">
                            <Label htmlFor="student-select" className="text-base">
                                Student
                            </Label>
                            <select
                                id="student-select"
                                value={selectedStudent?.id || ''}
                                onChange={(e) => {
                                    const student = students.find(s => s.id === e.target.value)
                                    setSelectedStudent(student || null)
                                }}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isRescheduling}
                            >
                                <option value="">Select a student...</option>
                                {students.map((student) => (
                                    <option key={student.id} value={student.id}>
                                        {student.name} ({student.credits} credits)
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="date" className="text-base">
                                    Date
                                </Label>
                                <Input
                                    id="date"
                                    type="date"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="time" className="text-base">
                                    Time
                                </Label>
                                <Input
                                    id="time"
                                    type="time"
                                    value={scheduleTime}
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="duration" className="text-base">
                                Duration (minutes)
                            </Label>
                            <select
                                id="duration"
                                value={scheduleDuration}
                                onChange={(e) => setScheduleDuration(Number(e.target.value))}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="30">30 minutes</option>
                                <option value="45">45 minutes</option>
                                <option value="60">60 minutes</option>
                                <option value="90">90 minutes</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setShowScheduleModal(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={handleScheduleSubmit} disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                isRescheduling ? 'Update Lesson' : 'Schedule Lesson'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog >

            {/* Edit Lesson Modal */}
            < Dialog open={showEditModal} onOpenChange={setShowEditModal} >
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-serif">Edit Lesson</DialogTitle>
                        <DialogDescription>
                            Update lesson notes and materials for {editingLesson?.student.name}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-notes" className="text-base">
                                Teacher Notes
                            </Label>
                            <Textarea
                                id="edit-notes"
                                placeholder="Enter your lesson notes, progress observations, and homework assignments..."
                                value={lessonNotes}
                                onChange={(e) => setLessonNotes(e.target.value)}
                                rows={6}
                                className="resize-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-video" className="text-base">
                                Video Recording URL
                            </Label>
                            <Input
                                id="edit-video"
                                type="url"
                                placeholder="https://..."
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-sheet-music" className="text-base">
                                Sheet Music PDF
                            </Label>
                            <div className="space-y-3">
                                <div className="flex gap-2 items-center">
                                    <Input
                                        ref={editFileInputRef}
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => handleFileUpload(e, true)}
                                        className="flex-1"
                                        disabled={isUploading}
                                    />
                                    {isUploading && (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground">Or paste a URL directly:</div>
                                <Input
                                    type="url"
                                    placeholder="https://..."
                                    value={sheetMusicUrl}
                                    onChange={(e) => setSheetMusicUrl(e.target.value)}
                                />
                                {sheetMusicUrl && (
                                    <div className="flex items-center gap-2 text-sm text-green-600">
                                        <FileText className="h-4 w-4" />
                                        <a href={sheetMusicUrl} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-xs">
                                            {sheetMusicUrl.split('/').pop() || 'Sheet Music'}
                                        </a>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSheetMusicUrl('')}
                                            className="h-6 px-2 text-red-500 hover:text-red-700"
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Save Changes
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog >
        </div >
    )
}
