"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Calendar,
    Clock,
    Video,
    MonitorPlay,
    CreditCard,
    AlertCircle,
    Music,
    Download,
    CalendarX,
    CalendarClock,
    Users,
    FileText,
    PlayCircle,
    MessageCircle,
    Plus,
    CheckCircle,
    CheckCircle2,
    HelpCircle,
    Loader2,
    Megaphone,
} from "lucide-react"
import {
    mockEvents,
    mockTutorials,
    type Tutorial,
} from "@/lib/mock-data"
import { MakeupScheduler } from "./makeup-scheduler"
import { CancellationModal } from "./cancellation-modal"
import { LessonDetailModal } from "@/components/admin/lesson-detail-modal"
import { PurchaseCreditsModal } from "./purchase-credits-modal"
import { createBalancePaymentSession } from "@/app/actions/stripe"
import { MessagesPanel } from "./messages-panel"
import { ChatWidget } from "./chat-widget"
import { logout } from "@/app/login/actions"
import { cancelLesson, confirmAttendance } from "@/app/actions/lessons"
import { rsvpToEvent } from "@/app/actions/events"
import { notifyStudentJoined } from "@/app/actions/notifications"
import { useToast } from "@/hooks/use-toast"
import type { Profile, Lesson } from "@/lib/supabase/database.types"
import type { StudentEvent } from "@/app/actions/events"
import type { Resource } from "@/app/actions/resources"
import { EventSignupModal } from "./event-signup-modal"
import { LocalTimeDisplay } from "@/components/ui/local-time-display"

// Extended lesson type for UI compatibility
type UILesson = Lesson & {
    duration?: number
    teacher_notes?: string
    credit_snapshot?: number | null
    credit_snapshot_before?: number | null
}

export interface StudentDashboardProps {
    profile: Profile
    lessons: Lesson[]
    nextLesson: { id?: string; date: string; time: string; duration: number; rawTime?: string; isConfirmed?: boolean } | null
    zoomLink?: string | null
    studioName?: string
    teacherName?: string
    events?: StudentEvent[]
    resources?: Resource[]
    latestAnnouncement?: { id: string; subject: string; body: string; created_at: string } | null
}

// Category badge colors
const categoryColors: Record<string, string> = {
    'Sheet Music': 'bg-blue-100 text-blue-800',
    'Theory': 'bg-purple-100 text-purple-800',
    'Scales': 'bg-green-100 text-green-800',
    'Exercises': 'bg-orange-100 text-orange-800',
    'Recording': 'bg-pink-100 text-pink-800',
}

export function StudentDashboard({ profile, lessons, nextLesson, zoomLink, studioName = "Piano Studio", teacherName, events = [], resources = [], latestAnnouncement }: StudentDashboardProps) {
    const { toast } = useToast()

    // Classroom Link (prioritized over Zoom)
    const classroomBase = process.env.NEXT_PUBLIC_CLASSROOM_URL || "https://classroom.musicalbasics.com"
    const classroomUrl = profile.public_id ? `${classroomBase}/${profile.public_id}` : null

    // Transform lessons to UI format
    const uiLessons: UILesson[] = lessons.map(lesson => ({
        ...lesson,
        duration: 60, // Default duration
        teacher_notes: lesson.notes || undefined
    }))

    const completedLessons = uiLessons.filter((l) => l.status === "completed")


    // Find next scheduled lesson for cancellation
    // We use the nextLesson prop passed from the server which is already calculated correctly
    // The uiLessons array is sorted by date descending, so finding the first 'scheduled' one there would be wrong (it would be the latest one)

    // Mock messages for now (will be replaced with real data later)
    const unreadMessages = 1

    const [showMakeupScheduler, setShowMakeupScheduler] = useState(false)
    const [showCancellationModal, setShowCancellationModal] = useState(false)
    const [selectedLesson, setSelectedLesson] = useState<UILesson | null>(null)
    const [showLessonDetail, setShowLessonDetail] = useState(false)
    const [showPurchaseModal, setShowPurchaseModal] = useState(false)
    const [isPayingBalance, setIsPayingBalance] = useState(false)
    const [isCancelling, setIsCancelling] = useState(false)
    const [isConfirming, setIsConfirming] = useState(false)

    // Event Signup State
    const [showEventSignup, setShowEventSignup] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<StudentEvent | null>(null)

    // Local state for confirmation - allows instant UI feedback
    const [confirmationStatus, setConfirmationStatus] = useState<boolean>(!!nextLesson?.isConfirmed)

    // Sync local state if the prop changes (e.g. on page refresh)
    useEffect(() => {
        if (nextLesson) {
            setConfirmationStatus(!!nextLesson.isConfirmed)
        }
    }, [nextLesson])

    // const handleReschedule = () => {
    //     setShowMakeupScheduler(true)
    // }

    const handleCancel = () => {
        setShowCancellationModal(true)
    }

    const handleConfirmCancel = async () => {
        if (!nextLesson?.id) return

        setIsCancelling(true)
        const result = await cancelLesson(nextLesson.id)
        if (result.success) {
            toast({
                title: "Lesson Cancelled",
                description: result.message
            })
            setShowCancellationModal(false)
        } else {
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error
            })
        }
        setIsCancelling(false)
    }

    const handleConfirmAttendance = async () => {
        if (!nextLesson?.id) {
            toast({ variant: "destructive", title: "Error", description: "Lesson ID missing" })
            return
        }
        setIsConfirming(true)

        const result = await confirmAttendance(nextLesson.id)

        if (result.success) {
            // Update local state immediately for instant feedback
            setConfirmationStatus(true)

            toast({
                title: "Attendance Confirmed",
                description: "Thanks for letting us know you'll be there!",
            })
        } else {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not confirm attendance. Please try again."
            })
        }
        setIsConfirming(false)
    }

    const handleSignUpClick = (event: StudentEvent) => {
        setSelectedEvent(event)
        setShowEventSignup(true)
    }

    const handleSignupConfirm = async (eventId: string, message: string) => {
        const result = await rsvpToEvent(eventId, 'going', message)
        if (result.success) {
            toast({ title: "Signed Up!", description: "You have successfully RSVP'd to the event." })
            setShowEventSignup(false)
            setSelectedEvent(null)
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error || "Failed to sign up" })
            throw new Error(result.error)
        }
    }

    const handleUnenroll = async (eventId: string) => {
        if (!confirm("Are you sure you want to unenroll from this event?")) return

        const result = await rsvpToEvent(eventId, 'not_going', '')
        if (result.success) {
            toast({ title: "Unenrolled", description: "You have been removed from the event." })
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error || "Failed to unenroll" })
        }
    }
    const handleRenewPackage = () => {
        setShowPurchaseModal(true)
    }

    const handlePayBalance = async () => {
        setIsPayingBalance(true)
        const result = await createBalancePaymentSession()

        if (result.error) {
            toast({ variant: "destructive", title: "Error", description: result.error })
            setIsPayingBalance(false)
        } else if (result.url) {
            window.location.href = result.url
        }
    }

    const handleDownload = (resource: Resource) => {
        // Open file in new tab for download
        window.open(resource.file_url, '_blank')
    }

    const handleWatchTutorial = (tutorial: Tutorial) => {
        alert(`Opening tutorial: ${tutorial.title}`)
    }

    const needsRenewal = profile.credits <= 1

    // Format time for display (HH:MM:SS -> h:mm AM/PM)
    const formatTime = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number)
        const ampm = hours >= 12 ? 'PM' : 'AM'
        const displayHours = hours % 12 || 12
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
    }

    // Format date for display - parse as local time to avoid timezone shift
    const formatDate = (dateStr: string) => {
        // If date is in YYYY-MM-DD format (no time), parse as local time
        // to avoid UTC midnight conversion shifting to previous day
        let date: Date
        if (dateStr.length === 10 && dateStr.includes('-')) {
            // Parse YYYY-MM-DD as local time by adding T12:00:00
            date = new Date(dateStr + 'T12:00:00')
        } else {
            date = new Date(dateStr)
        }
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    const [currentDate, setCurrentDate] = useState("")

    useEffect(() => {
        const date = new Date()
        setCurrentDate(date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }))
    }, [])

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b bg-card sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
                                <Music className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <div>
                                <h1 className="text-xl font-serif font-semibold">{studioName}</h1>
                                <p className="text-sm text-muted-foreground">{profile.name || 'Student'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {currentDate && (
                                <div className="hidden md:block text-right">
                                    <p className="text-sm text-muted-foreground">Today is</p>
                                    <p className="font-medium">{currentDate}</p>
                                </div>
                            )}
                            <form action={logout}>
                                <Button variant="outline" type="submit">
                                    Sign Out
                                </Button>
                            </form>
                        </div>
                    </div>
                    {currentDate && (
                        <div className="md:hidden mt-3 pt-3 border-t">
                            <p className="text-sm text-muted-foreground">Today is <span className="font-medium text-foreground">{currentDate}</span></p>
                        </div>
                    )}
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 space-y-8">

                {/* Confirmation Banner */}
                {nextLesson?.id && !confirmationStatus && (
                    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10 shadow-sm">
                        <CardContent className="flex flex-col sm:flex-row items-center justify-between p-6 gap-4">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0 text-blue-600">
                                    <Calendar className="h-5 w-5" />
                                </div>
                                <div className="space-y-1 text-center sm:text-left">
                                    <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                                        Upcoming Lesson Confirmation
                                    </h3>
                                    <p className="text-sm text-blue-700 dark:text-blue-300">
                                        Please confirm you will be attending your lesson on {formatDate(nextLesson.date)} at {nextLesson.time}.
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={handleConfirmAttendance}
                                disabled={isConfirming}
                                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                            >
                                {isConfirming ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Confirming...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        Confirm Attendance
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Renewal Banner */}
                {needsRenewal && (
                    <Card className="border-warning bg-warning/5">
                        <CardContent className="flex items-center justify-between p-6">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="h-6 w-6 text-warning" />
                                <div>
                                    <h3 className="font-semibold text-warning-foreground">Low Credits</h3>
                                    <p className="text-sm text-muted-foreground">
                                        You have {profile.credits} credit{profile.credits === 1 ? "" : "s"} remaining.
                                        Renew now to continue lessons.
                                    </p>
                                </div>
                            </div>
                            <Button onClick={handleRenewPackage} className="bg-warning text-warning-foreground hover:bg-warning/90">
                                Renew Package
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Hero Section - Next Lesson */}
                <Card className="border-2 overflow-hidden">
                    <CardHeader className="pb-4 bg-muted/20 border-b">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-2xl font-serif">Next Lesson</CardTitle>

                            {/* STATUS BADGE */}
                            {nextLesson && (
                                confirmationStatus ? (
                                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 pl-1.5 pr-2.5 py-1">
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                        Confirmed
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 pl-1.5 pr-2.5 py-1">
                                        <HelpCircle className="w-3.5 h-3.5 mr-1" />
                                        Unconfirmed
                                    </Badge>
                                )
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        {nextLesson ? (
                            <>
                                <div className="grid md:grid-cols-3 gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center h-12 w-12 bg-primary/10 rounded-lg">
                                            <Calendar className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Date</p>
                                            <p className="font-semibold">{formatDate(nextLesson.date)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center h-12 w-12 bg-primary/10 rounded-lg">
                                            <Clock className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Time</p>
                                            <LocalTimeDisplay date={nextLesson.date} time={nextLesson.time} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center h-12 w-12 bg-primary/10 rounded-lg">
                                            <Music className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Duration</p>
                                            <p className="font-semibold">{nextLesson.duration} minutes</p>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex flex-wrap gap-3">

                                    {/* 1. PRIMARY ACTION: Join Classroom */}
                                    <Button
                                        size="lg"
                                        className="flex-1 min-w-[200px] bg-indigo-600 hover:bg-indigo-700 text-white border-0 shadow-md shadow-indigo-900/10"
                                        onClick={() => {
                                            notifyStudentJoined('classroom') // fire-and-forget
                                            window.open(`${process.env.NEXT_PUBLIC_CLASSROOM_URL || "https://classroom.musicalbasics.com"}/${profile.public_id}`, '_blank')
                                        }}
                                    >
                                        <MonitorPlay className="h-5 w-5 mr-2" />
                                        Join Classroom
                                    </Button>

                                    {/* 2. FALLBACK: Join Zoom Lesson */}
                                    {zoomLink ? (
                                        <Button
                                            size="lg"
                                            variant="outline"
                                            className="flex-1 min-w-[200px] text-zinc-600 dark:text-zinc-400"
                                            onClick={() => {
                                                notifyStudentJoined('zoom') // fire-and-forget
                                                window.open(zoomLink, '_blank')
                                            }}
                                        >
                                            <Video className="h-5 w-5 mr-2" />
                                            Zoom (Backup)
                                        </Button>
                                    ) : (
                                        <Button size="lg" variant="ghost" className="flex-1 min-w-[200px] text-muted-foreground" disabled>
                                            <Video className="h-5 w-5 mr-2 opacity-50" />
                                            No Zoom Link
                                        </Button>
                                    )}

                                    {/* 3. Existing Actions */}
                                    {/* <Button size="lg" variant="outline" onClick={handleReschedule}>
                                        <CalendarClock className="h-5 w-5 mr-2" />
                                        Reschedule
                                    </Button> */}
                                    <Button size="lg" variant="destructive" onClick={handleCancel}>
                                        <CalendarX className="h-5 w-5 mr-2" />
                                        Cancel
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-8">
                                <p className="text-muted-foreground">No upcoming lesson scheduled</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Stats Bar */}
                <div className="flex flex-wrap gap-3">
                    <Card className="flex-1 min-w-[200px]">
                        <CardContent className="flex items-center justify-between p-4">
                            <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Credits Remaining</p>
                                <p className="text-xl font-bold">
                                    {profile.credits}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => setShowPurchaseModal(true)} className="h-8">
                                    <Plus className="h-3 w-3 mr-1" />
                                    Buy
                                </Button>
                                <CreditCard className="h-6 w-6 text-primary" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={`flex-1 min-w-[200px] ${Number(profile.balance_due) > 0 ? "border-destructive" : ""}`}>
                        <CardContent className="flex items-center justify-between p-4">
                            <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Outstanding Balance</p>
                                <p className={`text-xl font-bold ${Number(profile.balance_due) > 0 ? "text-destructive" : ""}`}>
                                    ${Number(profile.balance_due).toFixed(2)}
                                </p>
                            </div>

                            {Number(profile.balance_due) > 0 ? (
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={handlePayBalance}
                                    disabled={isPayingBalance}
                                    className="h-8"
                                >
                                    {isPayingBalance ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pay Now"}
                                </Button>
                            ) : (
                                <AlertCircle className="h-6 w-6 text-success" />
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* My Library */}
                    <div className="lg:col-span-2 space-y-6">
                        <Tabs defaultValue="lessons" className="w-full">
                            <TabsList className="grid w-full grid-cols-4 mb-6">
                                <TabsTrigger value="lessons" className="gap-2">
                                    <Music className="h-4 w-4" />
                                    <span className="hidden sm:inline">Lessons</span>
                                </TabsTrigger>
                                <TabsTrigger value="downloads" className="gap-2">
                                    <FileText className="h-4 w-4" />
                                    <span className="hidden sm:inline">Downloads</span>
                                </TabsTrigger>
                                <TabsTrigger value="tutorials" className="gap-2">
                                    <PlayCircle className="h-4 w-4" />
                                    <span className="hidden sm:inline">Tutorials (still under construction)</span>
                                </TabsTrigger>
                                <TabsTrigger value="messages" className="gap-2 relative">
                                    <MessageCircle className="h-4 w-4" />
                                    <span className="hidden sm:inline">Messages</span>
                                    {unreadMessages > 0 && (
                                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-destructive rounded-full" />
                                    )}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="lessons" className="space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-2xl font-serif font-semibold">Past Lessons</h2>
                                    <Badge variant="secondary">{completedLessons.length} lessons</Badge>
                                </div>
                                <div className="grid gap-4">
                                    {completedLessons.map((lesson) => (
                                        <Card
                                            key={lesson.id}
                                            className="cursor-pointer hover:shadow-md transition-shadow border-2"
                                            onClick={() => {
                                                setSelectedLesson(lesson)
                                                setShowLessonDetail(true)
                                            }}
                                        >
                                            <CardContent className="flex items-center justify-between p-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-14 w-14 bg-primary/10 rounded-lg flex items-center justify-center">
                                                        <Music className="h-6 w-6 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold mb-1">Lesson - {formatDate(lesson.date)}</h3>
                                                        <p className="text-sm text-muted-foreground line-clamp-1">
                                                            {lesson.teacher_notes || "No notes available"}
                                                        </p>
                                                        <div className="flex gap-3 mt-2">
                                                            {lesson.video_url && (
                                                                <Badge variant="secondary" className="text-xs">
                                                                    <Video className="h-3 w-3 mr-1" />
                                                                    Video
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {lesson.sheet_music_url && (
                                                            <div className="mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                                                                <p className="text-xs text-muted-foreground mb-2">📄 Download Sheet Music:</p>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="bg-primary/5 hover:bg-primary/10 border-primary/20"
                                                                    asChild
                                                                >
                                                                    <a href={lesson.sheet_music_url} download target="_blank" rel="noopener noreferrer">
                                                                        <Download className="h-4 w-4 mr-2" />
                                                                        {(() => {
                                                                            try {
                                                                                const url = new URL(lesson.sheet_music_url)
                                                                                const pathname = decodeURIComponent(url.pathname)
                                                                                const filename = pathname.split('/').pop() || 'Sheet Music.pdf'
                                                                                // Remove timestamp prefix if present (e.g., "1734567890123_")
                                                                                const cleanName = filename.replace(/^\d{10,}_/, '')
                                                                                return cleanName.length > 30 ? cleanName.slice(0, 27) + '...' : cleanName
                                                                            } catch {
                                                                                return 'Sheet Music.pdf'
                                                                            }
                                                                        })()}
                                                                    </a>
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Credit Receipt Footer */}
                                                {lesson.credit_snapshot !== undefined && lesson.credit_snapshot !== null && (
                                                    <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                                                        Credits spent: 1 • Remaining: {lesson.credit_snapshot}
                                                    </div>
                                                )}
                                                <Clock className="h-5 w-5 text-muted-foreground" />
                                            </CardContent>
                                        </Card>
                                    ))}
                                    {completedLessons.length === 0 && (
                                        <p className="text-center text-muted-foreground py-8">No completed lessons yet</p>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="downloads" className="space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-2xl font-serif font-semibold">Practice Materials</h2>
                                    <Badge variant="secondary">{resources.length} files</Badge>
                                </div>
                                {resources.length === 0 ? (
                                    <Card className="border-2">
                                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                            <h3 className="font-semibold text-lg mb-2">No Practice Materials Yet</h3>
                                            <p className="text-muted-foreground max-w-sm">
                                                Your teacher will add practice materials here for you to download.
                                            </p>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="grid gap-4">
                                        {resources.map((resource) => (
                                            <Card key={resource.id} className="border-2 hover:shadow-md transition-shadow">
                                                <CardContent className="flex items-center justify-between p-6">
                                                    <div className="flex items-center gap-4 flex-1">
                                                        <div className="h-14 w-14 bg-primary/10 rounded-lg flex items-center justify-center">
                                                            {resource.file_type === 'mp3' || resource.file_type === 'wav' ? (
                                                                <Music className="h-6 w-6 text-primary" />
                                                            ) : (
                                                                <FileText className="h-6 w-6 text-primary" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1">
                                                            <h3 className="font-semibold mb-1">{resource.title}</h3>
                                                            {resource.description && (
                                                                <p className="text-sm text-muted-foreground mb-2">{resource.description}</p>
                                                            )}
                                                            <Badge
                                                                variant="secondary"
                                                                className={`text-xs ${categoryColors[resource.category] || ''}`}
                                                            >
                                                                {resource.category}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <Button size="sm" onClick={() => handleDownload(resource)}>
                                                        <Download className="h-4 w-4 mr-2" />
                                                        Download
                                                    </Button>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="tutorials" className="space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-2xl font-serif font-semibold">Tutorials (still under construction)</h2>
                                    <Badge variant="secondary">{mockTutorials.length} videos</Badge>
                                </div>
                                <div className="grid gap-4">
                                    {mockTutorials.map((tutorial) => (
                                        <Card key={tutorial.id} className="border-2 hover:shadow-md transition-shadow">
                                            <CardContent className="p-6">
                                                <div className="flex gap-4">
                                                    <div className="relative w-40 h-24 bg-muted rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                                                        {tutorial.thumbnail_url ? (
                                                            <img
                                                                src={tutorial.thumbnail_url || "/placeholder.svg"}
                                                                alt={tutorial.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <PlayCircle className="h-10 w-10 text-muted-foreground" />
                                                        )}
                                                        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                                                            {tutorial.duration}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <h3 className="font-semibold mb-1">{tutorial.title}</h3>
                                                        <p className="text-sm text-muted-foreground mb-3">{tutorial.description}</p>
                                                        <div className="flex items-center justify-between">
                                                            <Badge variant="outline" className="text-xs capitalize">
                                                                {tutorial.category.replace("-", " ")}
                                                            </Badge>
                                                            <Button size="sm" onClick={() => handleWatchTutorial(tutorial)}>
                                                                <PlayCircle className="h-4 w-4 mr-2" />
                                                                Watch
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </TabsContent>

                            <TabsContent value="messages" className="space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-2xl font-serif font-semibold">Messages</h2>
                                    {unreadMessages > 0 && <Badge variant="secondary">{unreadMessages} unread</Badge>}
                                </div>
                                <MessagesPanel studentId={profile.id} teacherName={teacherName} />
                            </TabsContent>
                        </Tabs>
                    </div>

                    {/* Announcement Alert */}
                    <div className="space-y-4">
                        {latestAnnouncement && (
                            <Card className="border-indigo-200 bg-indigo-50 dark:bg-indigo-900/10 shadow-sm">
                                <CardContent className="p-4 space-y-2">
                                    <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                                        <Megaphone className="h-4 w-4 shrink-0" />
                                        <h3 className="font-semibold text-sm">{latestAnnouncement.subject}</h3>
                                    </div>
                                    <p className="text-sm text-indigo-600/80 dark:text-indigo-300/70 whitespace-pre-wrap leading-relaxed">
                                        {latestAnnouncement.body}
                                    </p>
                                    <p className="text-xs text-indigo-400">
                                        Posted {new Date(latestAnnouncement.created_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {/* Lesson & Credits History */}
                        <h2 className="text-2xl font-serif font-semibold">Lesson & Credits History</h2>
                        <div className="space-y-3">
                            {completedLessons.length === 0 ? (
                                <Card>
                                    <CardContent className="text-center py-8">
                                        <p className="text-muted-foreground">No completed lessons yet</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                completedLessons.slice(0, 15).map((lesson) => (
                                    <Card key={lesson.id} className="hover:shadow-sm transition-shadow">
                                        <CardContent className="p-4 space-y-2">
                                            {/* Date */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Music className="h-4 w-4 text-muted-foreground" />
                                                    <span className="text-sm font-medium">
                                                        {formatDate(lesson.date)}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatTime(lesson.time)}
                                                </span>
                                            </div>

                                            {/* Credit trail */}
                                            {(lesson.credit_snapshot !== undefined && lesson.credit_snapshot !== null) && (
                                                <div className="flex items-center gap-1.5 text-xs bg-muted/50 rounded px-2 py-1.5">
                                                    <span className="text-muted-foreground font-medium">Credits:</span>
                                                    <span className="font-mono font-semibold">
                                                        {(lesson as any).credit_snapshot_before ?? '?'}
                                                    </span>
                                                    <span className="text-muted-foreground">→</span>
                                                    <span className="text-red-500 font-mono font-semibold">-1</span>
                                                    <span className="text-muted-foreground">→</span>
                                                    <span className="font-mono font-semibold">
                                                        {lesson.credit_snapshot}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Teacher notes */}
                                            {lesson.teacher_notes && (
                                                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                                    {lesson.teacher_notes}
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Modals */}
            <MakeupScheduler
                open={showMakeupScheduler}
                onOpenChange={setShowMakeupScheduler}
                lessonId={nextLesson?.id}
                onSuccess={() => window.location.reload()}
            />

            <CancellationModal
                open={showCancellationModal}
                onOpenChange={setShowCancellationModal}
                onConfirm={handleConfirmCancel}
                isLoading={isCancelling}
                lesson={nextLesson || undefined}
            />

            {selectedLesson && (
                <LessonDetailModal
                    lesson={selectedLesson}
                    open={showLessonDetail}
                    onOpenChange={setShowLessonDetail}
                />
            )}

            <PurchaseCreditsModal open={showPurchaseModal} onOpenChange={setShowPurchaseModal} />

            <ChatWidget
                studentId={profile.id}
                unreadCount={unreadMessages}
                teacherName={teacherName}
            />

            <EventSignupModal
                event={selectedEvent}
                studentName={profile.name || "Student"}
                open={showEventSignup}
                onOpenChange={setShowEventSignup}
                onConfirm={handleSignupConfirm}
            />
        </div>
    )
}
