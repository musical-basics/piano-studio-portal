"use client"
import { AddStudentModal } from "@/components/add-student-modal"
import { useState, useRef } from "react"
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
export type TodayLesson = Lesson & {
    student: Profile
}

export type LessonWithStudent = Lesson & {
    student: Profile
}

export type StudentRoster = Profile & {
    last_lesson_date?: string
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
    const [lessonNotes, setLessonNotes] = useState("")
    const [videoUrl, setVideoUrl] = useState("")
    const [sheetMusicUrl, setSheetMusicUrl] = useState("")
    const [scheduleDate, setScheduleDate] = useState("")
    const [scheduleTime, setScheduleTime] = useState("15:00")
    const [scheduleDuration, setScheduleDuration] = useState<number>(60)
    const [isLoading, setIsLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const editFileInputRef = useRef<HTMLInputElement>(null)

    const handleLogLesson = (lesson: TodayLesson) => {
        setSelectedLesson(lesson)
        setShowLogLessonModal(true)
    }

    const handleSaveLesson = async () => {
        if (!selectedLesson) return

        setIsLoading(true)
        const result = await logLesson(
            selectedLesson.id,
            lessonNotes,
            videoUrl || undefined,
            sheetMusicUrl || undefined
        )
        setIsLoading(false)

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error
            })
        } else {
            toast({
                title: "Lesson Logged",
                description: `Successfully logged lesson for ${selectedLesson.student.name}. Credit deducted.`
            })
            setShowLogLessonModal(false)
            setLessonNotes("")
            setVideoUrl("")
            setSheetMusicUrl("")
            setSelectedLesson(null)
        }
    }

    const handleMarkNoShow = async (lesson: TodayLesson) => {
        if (confirm(`Mark ${lesson.student.name} as No-Show? This will deduct 1 credit without refund or makeup option.`)) {
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
                    description: `${lesson.student.name} marked as No-Show. Credit forfeited.`
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
        setShowScheduleModal(true)
    }

    const openNewSchedule = () => {
        setSelectedStudent(null)
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setScheduleDate(tomorrow.toISOString().split('T')[0])
        setScheduleTime("15:00")
        setScheduleDuration(60)
        setShowScheduleModal(true)
    }

    const handleScheduleLesson = async () => {
        if (!selectedStudent || !scheduleDate || !scheduleTime) return

        setIsLoading(true)
        const result = await scheduleLesson(selectedStudent.id, scheduleDate, scheduleTime, scheduleDuration)
        setIsLoading(false)

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
        const lessonId = isEdit ? editingLesson?.id : selectedLesson?.id
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
            const filePath = `sheet_music/${lessonId}/${timestamp}_${safeName}`

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
                                <h1 className="text-xl font-serif font-semibold">Teacher Admin Portal</h1>
                                <p className="text-sm text-muted-foreground">{admin.name || 'Admin'}</p>
                            </div>
                        </div>
                        <form action={logout}>
                            <Button variant="outline" type="submit">
                                Sign Out
                            </Button>
                        </form>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <Tabs defaultValue="dashboard" className="space-y-8">
                    <TabsList className="grid w-full max-w-2xl grid-cols-4">
                        <TabsTrigger value="dashboard" className="gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            <span className="hidden sm:inline">Today</span>
                        </TabsTrigger>
                        <TabsTrigger value="scheduled" className="gap-2">
                            <Calendar className="h-4 w-4" />
                            <span className="hidden sm:inline">Scheduled</span>
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
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleLogLesson(lesson)}
                                                            disabled={isLoading}
                                                        >
                                                            <Upload className="h-4 w-4 mr-1" />
                                                            Log Lesson
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
                                                <TableHead className="font-semibold text-center">Credits</TableHead>
                                                <TableHead className="font-semibold text-center">Balance Due</TableHead>
                                                <TableHead className="font-semibold">Status</TableHead>
                                                <TableHead className="font-semibold text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {students.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                                                        <TableCell className="text-center">
                                                            <Badge variant={student.credits <= 1 ? "destructive" : "secondary"}>
                                                                {student.credits}/{student.credits_total}
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
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleOpenSchedule(student)}
                                                            >
                                                                <Plus className="h-4 w-4 mr-1" />
                                                                Schedule
                                                            </Button>
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
                </Tabs>
            </main>

            {/* Log Lesson Modal */}
            <Dialog open={showLogLessonModal} onOpenChange={setShowLogLessonModal}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-serif">Log Lesson</DialogTitle>
                        <DialogDescription>
                            Record notes and upload materials for {selectedLesson?.student.name}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
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
            </Dialog>

            {/* Schedule Lesson Modal */}
            <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-serif">Schedule Lesson</DialogTitle>
                        <DialogDescription>
                            {selectedStudent
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
                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                            >
                                <option value="">Select a student...</option>
                                {students.map((student) => (
                                    <option key={student.id} value={student.id}>
                                        {student.name} ({student.email})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date */}
                        <div className="space-y-2">
                            <Label htmlFor="schedule-date" className="text-base">
                                Date
                            </Label>
                            <Input
                                id="schedule-date"
                                type="date"
                                value={scheduleDate}
                                onChange={(e) => setScheduleDate(e.target.value)}
                            />
                        </div>

                        {/* Time */}
                        <div className="space-y-2">
                            <Label htmlFor="schedule-time" className="text-base">
                                Time
                            </Label>
                            <Input
                                id="schedule-time"
                                type="time"
                                value={scheduleTime}
                                onChange={(e) => setScheduleTime(e.target.value)}
                            />
                        </div>

                        {/* Duration */}
                        <div className="space-y-2">
                            <Label className="text-base">Duration</Label>
                            <div className="flex gap-2">
                                {[30, 45, 60].map((duration) => (
                                    <Button
                                        key={duration}
                                        type="button"
                                        variant={scheduleDuration === duration ? "default" : "outline"}
                                        className="flex-1"
                                        onClick={() => setScheduleDuration(duration)}
                                    >
                                        {duration} min
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setShowScheduleModal(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={handleScheduleLesson} disabled={isLoading || !selectedStudent || !scheduleDate || !scheduleTime}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Scheduling...
                                </>
                            ) : (
                                <>
                                    <Calendar className="h-4 w-4 mr-2" />
                                    Schedule Lesson
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Lesson Modal */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
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
            </Dialog>
        </div>
    )
}
