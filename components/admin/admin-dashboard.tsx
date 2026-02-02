"use client"
import { ScheduledTab } from "@/components/admin/scheduled-tab"
import { CompletedTab } from "@/components/admin/completed-tab"
import { RosterTab } from "@/components/admin/roster-tab"
import { InquiriesTab } from "@/components/admin/inquiries-tab"
import { MasterCalendar } from "./master-calendar"
import { ProfileSettingsDialog } from "@/components/profile-settings-dialog"
import React, { useState, useRef, Suspense, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, Calendar, MessageCircle, LayoutDashboard, Plus, Loader2, Video, FileText, Pencil, Music, ShieldAlert, Star, Mail } from "lucide-react"
import { AdminChat } from "./admin-chat"
import { logout } from "@/app/login/actions"
import { logLesson, markNoShow, scheduleLesson, updateLesson } from "@/app/actions/lessons"
import { useToast } from "@/hooks/use-toast"
import { uploadSheetMusic } from "@/app/actions/uploads"
import { deleteStudent } from "@/app/actions/users"
import { deleteEvent, type AdminEvent } from "@/app/actions/events"
import { sendManualReminder } from "@/app/actions/reminders"
import { CreateEventModal } from "@/components/admin/create-event-modal"
import type { Profile, Lesson } from "@/lib/supabase/database.types"
import type { Resource } from "@/app/actions/resources"
import type { CalendarLesson } from "./master-calendar"
import { DashboardTab } from "@/components/admin/dashboard-tab"
import type { LessonWithStudent, TodayLesson, StudentRoster, Inquiry } from "@/types/admin"

// Re-export types for compatibility if used elsewhere (e.g. page.tsx)
export type { LessonWithStudent, TodayLesson, StudentRoster, Inquiry }

type SortKey = 'name' | 'lesson_day' | 'credits'
type SortDirection = 'asc' | 'desc'
interface SortConfig {
    key: SortKey
    direction: SortDirection
}

export interface AdminDashboardProps {
    admin: Profile
    // todaysLessons removed - derived from scheduledLessons
    scheduledLessons: LessonWithStudent[]
    completedLessons: LessonWithStudent[]
    students: StudentRoster[]
    totalUnread: number
    inquiries: Inquiry[]
    resources: Resource[]
}

export function AdminDashboard({ admin, scheduledLessons, completedLessons, students, totalUnread, inquiries, resources }: AdminDashboardProps) {
    const { toast } = useToast()

    const [isMounted, setIsMounted] = useState(false)

    // Handle hydration mismatch by waiting for mount
    React.useEffect(() => {
        setIsMounted(true)
    }, [])

    // Client-side date calculation for robust timezone handling
    // We want YYYY-MM-DD in local time
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const todayStr = `${year}-${month}-${day}`

    // Derive Today's Lessons from the superset
    // Note: scheduleLessons from server should include "yesterday" (UTC) to safely cover "today" (PST)
    const todaysLessons = scheduledLessons
        .filter(l => l.date === todayStr)
        .map(l => ({ ...l, student: l.student })) // Ensure shape matches TodayLesson if needed

    // Filter "Upcoming" to likely show today + future
    const upcomingLessons = scheduledLessons.filter(l => l.date >= todayStr)


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
    const [showEventModal, setShowEventModal] = useState(false)
    const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null)
    const [calendarVersion, setCalendarVersion] = useState(0)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const editFileInputRef = useRef<HTMLInputElement>(null)

    // Manual Reminder State
    const [showReminderModal, setShowReminderModal] = useState(false)
    const [lessonForReminder, setLessonForReminder] = useState<TodayLesson | null>(null)



    // State for Active Tab and Chat Selection
    const [activeTab, setActiveTab] = useState("dashboard")
    const [chatStudentId, setChatStudentId] = useState<string | null>(null)

    const handleJumpToMessage = (studentId: string) => {
        setChatStudentId(studentId)
        setActiveTab("messages")
    }

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
        console.log('handleSaveLesson started', { selectedLesson, selectedStudentForLog })
        if (!selectedLesson && !selectedStudentForLog) return

        setIsLoading(true)

        let result;

        try {
            if (selectedLesson) {
                console.log('Calling logLesson', selectedLesson.id)
                result = await logLesson(
                    selectedLesson.id,
                    lessonNotes,
                    videoUrl || undefined,
                    sheetMusicUrl || undefined
                )
            } else if (selectedStudentForLog) {
                console.log('Calling logPastLesson', selectedStudentForLog.id)
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
        } catch (e) {
            console.error('Error calling lesson action:', e)
            toast({
                variant: "destructive",
                title: "Error",
                description: "An unexpected error occurred"
            })
            setIsLoading(false)
            return
        }

        console.log('Action result:', result)
        setIsLoading(false)

        if (result?.error) {
            console.log('Showing error toast')
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error
            })
        } else {
            console.log('Success, closing modal')
            toast({
                title: "Lesson Logged",
                description: `Successfully logged lesson. Credit deducted.`
            })
            setShowLogLessonModal(false)
            setLessonNotes("")
            setVideoUrl("")
            setSheetMusicUrl("")
            setSelectedLesson(null)
            setSelectedStudentForLog(null)
            setCalendarVersion(v => v + 1)
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
                setCalendarVersion(v => v + 1)
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
                setCalendarVersion(v => v + 1)
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
                setCalendarVersion(v => v + 1)
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
            setCalendarVersion(v => v + 1)
        }
    }

    const handleDeleteStudent = async (student: StudentRoster) => {
        if (confirm(`Are you sure you want to remove ${student.name}? This will delete all data associated with the student.`)) {
            setIsLoading(true)
            const result = await deleteStudent(student.id)
            setIsLoading(false)

            if (result.error) {
                toast({
                    variant: "destructive",
                    title: "Delete Failed",
                    description: result.error
                })
            } else {
                toast({
                    title: "Student Removed",
                    description: result.message
                })
                // Usually the revalidatePath in action handles refresh, but if not we might need router.refresh()
            }
        }
    }

    const handleEditEvent = (event: AdminEvent) => {
        setEditingEvent(event)
        setShowEventModal(true)
    }

    const handleDeleteEvent = async (event: AdminEvent) => {
        if (confirm(`Are you sure you want to delete "${event.title}"? This will remove all student invites.`)) {
            setIsLoading(true)
            const result = await deleteEvent(event.id)
            setIsLoading(false)

            if (!result.success) {
                toast({
                    variant: "destructive",
                    title: "Delete Failed",
                    description: result.error || "Unknown error"
                })
            } else {
                toast({
                    title: "Event Deleted",
                    description: "Event and invites have been removed."
                })
                setCalendarVersion(v => v + 1)
            }
        }
    }

    const onEditCalendarLesson = (lesson: CalendarLesson) => {
        // Fork in the Road Logic:
        // Future -> Reschedule
        // Past -> Log/Complete

        const now = new Date()
        const lessonDate = new Date(`${lesson.date}T${lesson.time}`) // ISO string for comparison

        if (lessonDate < now) {
            // Past: Open Log Lesson Modal
            // Adapt CalendarLesson to TodayLesson (needs 'student' as Profile)
            // We create a minimal Profile object sufficient for display
            const minimalStudentProfile: any = {
                id: lesson.student_id,
                name: lesson.student?.name || 'Unknown',
                email: lesson.student?.email || '',
                // Other fields are not critical for Log Modal display
                credits: 0,
            }

            const todayLessonAdapter: TodayLesson = {
                ...lesson,
                student: minimalStudentProfile,
                status: 'scheduled', // or 'completed' if we are re-logging? But usually it's 'scheduled' if it's on calendar
            } as any

            handleLogLesson(todayLessonAdapter)
        } else {
            // Future: Open Reschedule Modal
            const lessonWithId = { ...lesson } as any
            handleReschedule(lessonWithId)
        }
    }

    const onDeleteCalendarLesson = (lesson: CalendarLesson) => {
        const studentName = lesson.student?.name || 'Student'
        handleCancelLesson(lesson.id, studentName)
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
                description: "No lesson selected (save the lesson first)"
            })
            return
        }

        setIsUploading(true)

        try {
            // Prepare FormData for Server Action
            const formData = new FormData()
            formData.append('file', file)

            // Call Server Action
            const result = await uploadSheetMusic(formData, lessonId)

            if (result.error) {
                throw new Error(result.error)
            }

            if (result.url) {
                setSheetMusicUrl(result.url)
                toast({
                    title: "Upload Complete",
                    description: "PDF uploaded successfully"
                })
            }
        } catch (error) {
            console.error('Upload error:', error)
            toast({
                variant: "destructive",
                title: "Upload Failed",
                description: error instanceof Error ? error.message : "Unknown error occurred"
            })
        } finally {
            setIsUploading(false)
            if (isEdit && editFileInputRef.current) {
                editFileInputRef.current.value = ''
            } else if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    const handleSendReminder = async (variant: '24h' | '2h' | '15m') => {
        if (!lessonForReminder) return
        setIsLoading(true)

        const result = await sendManualReminder(lessonForReminder.id, variant)

        setIsLoading(false)
        setShowReminderModal(false)

        if (result.error) {
            toast({ variant: "destructive", title: "Error", description: result.error })
        } else {
            toast({ title: "Email Sent", description: result.message })
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

    // Prevent hydration mismatch by not rendering until mounted
    if (!isMounted) {
        return null
    }

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
                                <a href="/admin/library" className="gap-2">
                                    <FileText className="h-4 w-4" />
                                    Library
                                </a>
                            </Button>
                            <Button variant="outline" asChild>
                                <a href="/admin/editor2" className="gap-2">
                                    <Pencil className="h-4 w-4" />
                                    Site Builder
                                </a>
                            </Button>
                            <Button variant="outline" asChild>
                                <a href="/admin/logs" className="gap-2">
                                    <ShieldAlert className="h-4 w-4" />
                                    Logs
                                </a>
                            </Button>
                            <Button variant="outline" asChild>
                                <a href="/admin/reviews" className="gap-2">
                                    <Star className="h-4 w-4" />
                                    Reviews
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
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <TabsList className="grid w-full max-w-4xl grid-cols-3 sm:grid-cols-6 h-auto sm:h-10">
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
                        <TabsTrigger value="inquiries" className="gap-2 relative">
                            <Mail className="h-4 w-4" />
                            <span className="hidden sm:inline">Inquiries</span>
                            {inquiries.filter(i => i.status === 'new').length > 0 && (
                                <Badge
                                    variant="destructive"
                                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                                >
                                    {inquiries.filter(i => i.status === 'new').length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="dashboard" className="space-y-8">
                        {/* Daily Schedule */}
                        <DashboardTab
                            lessons={todaysLessons}
                            adminZoomLink={admin.zoom_link}
                            onLog={handleLogLesson}
                            onReschedule={handleReschedule}
                            onNoShow={handleMarkNoShow}
                            onCancel={handleCancelLesson}
                            onRemind={(lesson) => {
                                setLessonForReminder(lesson)
                                setShowReminderModal(true)
                            }}
                            isLoading={isLoading}
                            onMessage={handleJumpToMessage}
                        />

                        {/* Student Roster */}
                        <RosterTab
                            students={students}
                            onLog={handleLogPastLesson}
                            onSchedule={handleOpenSchedule}
                            onDelete={handleDeleteStudent}
                            onMessage={handleJumpToMessage}
                        />
                    </TabsContent>

                    {/* Scheduled Lessons Tab */}
                    <TabsContent value="scheduled" className="space-y-4">
                        <ScheduledTab
                            lessons={scheduledLessons}
                            adminZoomLink={admin.zoom_link || undefined}
                            onReschedule={handleReschedule}
                            onCancel={handleCancelLesson}
                            onScheduleNew={openNewSchedule}
                        />
                    </TabsContent>

                    {/* Completed Lessons Tab */}
                    <TabsContent value="completed" className="space-y-4">
                        <CompletedTab
                            lessons={completedLessons}
                            onEdit={handleEditLesson}
                        />
                    </TabsContent>

                    <TabsContent value="messages">
                        <AdminChat
                            initialStudentId={chatStudentId}
                            onClearInitialStudent={() => setChatStudentId(null)}
                        />
                    </TabsContent>

                    <TabsContent value="inquiries" className="m-0 h-full p-4 lg:p-10 overflow-auto">
                        <InquiriesTab inquiries={inquiries} />
                    </TabsContent>

                    <TabsContent value="calendar">
                        <Suspense fallback={
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        }>
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-2xl font-serif">Master Calendar</CardTitle>
                                            <CardDescription>View all lessons and events</CardDescription>
                                        </div>
                                        <Button onClick={() => {
                                            setEditingEvent(null)
                                            setShowEventModal(true)
                                        }}>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Create Event
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <MasterCalendar
                                        onEditLesson={onEditCalendarLesson}
                                        onDeleteLesson={onDeleteCalendarLesson}
                                        onEditEvent={handleEditEvent}
                                        onDeleteEvent={handleDeleteEvent}
                                        refreshTrigger={calendarVersion}
                                    />
                                </CardContent>
                            </Card>
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
                                {/* Library Selector */}
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Select from Library</Label>
                                    <Select onValueChange={(url) => setSheetMusicUrl(url)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose from Library..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {resources
                                                .filter(r => ['Sheet Music', 'Exercises', 'Theory'].includes(r.category))
                                                .map(resource => (
                                                    <SelectItem key={resource.id} value={resource.file_url}>
                                                        {resource.title} ({resource.category})
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-background px-2 text-muted-foreground">
                                            Or upload new
                                        </span>
                                    </div>
                                </div>

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
                                            {resources.find(r => r.file_url === sheetMusicUrl)?.title || sheetMusicUrl.split('/').pop() || 'Sheet Music'}
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
                            Update lesson details for {editingLesson?.student.name}
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
                                {/* Library Selector */}
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Select from Library</Label>
                                    <Select onValueChange={(url) => setSheetMusicUrl(url)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose from Library..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {resources
                                                .filter(r => ['Sheet Music', 'Exercises', 'Theory'].includes(r.category))
                                                .map(resource => (
                                                    <SelectItem key={resource.id} value={resource.file_url}>
                                                        {resource.title} ({resource.category})
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-background px-2 text-muted-foreground">
                                            Or upload new
                                        </span>
                                    </div>
                                </div>

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
                                            {resources.find(r => r.file_url === sheetMusicUrl)?.title || sheetMusicUrl.split('/').pop() || 'Sheet Music'}
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
            {/* Event Modal */}
            <CreateEventModal
                open={showEventModal}
                onOpenChange={setShowEventModal}
                eventToEdit={editingEvent}
                onEventCreated={() => {
                    // Refresh is handled by revalidatePath in action, but we might want to ensure state is clear
                    setEditingEvent(null)
                    setCalendarVersion(v => v + 1)
                }}
            />
            {/* Manual Reminder Modal */}
            <Dialog open={showReminderModal} onOpenChange={setShowReminderModal}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Send Reminder</DialogTitle>
                        <DialogDescription>
                            Manually trigger an email for {lessonForReminder?.student.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 py-4">
                        <Button
                            variant="default"
                            onClick={() => handleSendReminder('exact' as any)}
                            className="justify-start bg-blue-600 hover:bg-blue-700"
                        >
                            <Clock className="mr-2 h-4 w-4" />
                            Send "Exact Time Remaining"
                        </Button>

                        <Separator />

                        <Button variant="outline" onClick={() => handleSendReminder('24h')} className="justify-start">
                            <Clock className="mr-2 h-4 w-4" />
                            Send "Tomorrow" Reminder (24h)
                        </Button>
                        <Button variant="outline" onClick={() => handleSendReminder('2h')} className="justify-start">
                            <Clock className="mr-2 h-4 w-4" />
                            Send "Starting Soon" Reminder (2h)
                        </Button>
                        <Button variant="default" onClick={() => handleSendReminder('15m')} className="justify-start bg-green-600 hover:bg-green-700">
                            <Video className="mr-2 h-4 w-4" />
                            Send "Join Now" Link (Urgent)
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    )
}
