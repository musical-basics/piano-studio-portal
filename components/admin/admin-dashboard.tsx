"use client"
import { ScheduledTab } from "@/components/admin/scheduled-tab"
import { CompletedTab } from "@/components/admin/completed-tab"
import { RosterTab } from "@/components/admin/roster-tab"
import { InquiriesTab } from "@/components/admin/inquiries-tab"
import { AnnouncementTab } from "@/components/admin/announcement-tab"
import { MasterCalendar } from "./master-calendar"
import { WeeklyScheduleTab, type RecurringSlotRow } from "@/components/admin/weekly-schedule-tab"
import { ProfileSettingsDialog } from "@/components/profile-settings-dialog"
import React, { useState, useRef, Suspense, useMemo, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, Calendar, CalendarClock, MessageCircle, LayoutDashboard, Plus, Loader2, Video, FileText, Pencil, Music, ShieldAlert, Star, Mail, DollarSign, Megaphone, Film, Wallet, History } from "lucide-react"
import { AdminChat } from "./admin-chat"
import { PricingManager } from "@/components/admin/pricing-manager"
import { PricingPlan } from "@/app/actions/pricing"
import { logout } from "@/app/login/actions"
import { logLesson, markNoShow, scheduleLesson, updateLesson, bulkScheduleLessons, getAdminDaySchedule } from "@/app/actions/lessons"
import { useToast } from "@/hooks/use-toast"
import { uploadSheetMusic } from "@/lib/uploads"
import { deleteStudent } from "@/app/actions/users"
import { deleteEvent, type AdminEvent } from "@/app/actions/events"
import { sendManualReminder } from "@/app/actions/reminders"
import { CreateEventModal } from "@/components/admin/create-event-modal"
import type { Profile, Lesson } from "@/lib/supabase/database.types"
import type { Resource } from "@/app/actions/resources"
import type { CalendarLesson } from "./master-calendar"
import { DashboardTab } from "@/components/admin/dashboard-tab"
import { MissedLessonDialog } from "@/components/admin/missed-lesson-dialog"
import { RunningLateDialog } from "@/components/admin/running-late-dialog"
import { UndoLogDialog } from "@/components/admin/undo-log-dialog"
import { ClassroomRecordingsTab } from "@/components/admin/classroom-recordings-tab"
import { TranscriptSearch } from "@/components/admin/transcript-search"
import { PracticeVideosTab } from "@/components/admin/practice-videos-tab"
import { BalancesTab } from "@/components/admin/balances-tab"
import { ChangesTab } from "@/components/admin/changes-tab"
import { StudentLink, StudentPanelProvider } from "@/components/admin/student-panel"
import { countPracticeVideosWaiting } from "@/app/actions/practice-videos"
import { UnloggedLessonsBadge } from "@/components/admin/unlogged-lessons-badge"
import { WaitingMessagesPill } from "@/components/admin/waiting-messages-pill"
import type { WaitingThread } from "@/lib/waiting-messages"
import type { AdminUnloggedLesson } from "@/lib/admin-unlogged-lessons"
import { MoveRequestsCard } from "@/components/admin/move-requests-card"
import type { PendingMoveRequest } from "@/lib/core/move-requests"
import { FreeReasonChips, NotePhraseChips, shortLessonDate } from "@/components/admin/note-phrase-chips"
import { isFreeTrialLesson } from "@/app/actions/free-trial"
import { appendNotePhrase } from "@/lib/lesson-note-phrases"
import { getLastHomework } from "@/app/actions/last-homework"
import type { LastHomework } from "@/lib/last-homework"
import type { HomeworkStatus } from "@/lib/homework"
import type { LessonWithStudent, TodayLesson, StudentRoster, Inquiry, AdminTodayEvent } from "@/types/admin"
import { isoToStudioWallClock, shiftDateStr, studioToday, studioWallClockToISO, weekdayOfDateStr } from "@/lib/studio-timezone"

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
    recurringSlots: RecurringSlotRow[]
    todayEvents: AdminTodayEvent[]
    totalUnread: number
    inquiries: Inquiry[]
    inquiriesError?: string
    resources: Resource[]
    pricingPlans: PricingPlan[]
    /** Past lessons nobody logged, for the red "N unlogged" badge (#760). */
    unloggedLessons?: AdminUnloggedLesson[]
    /** #990: family threads waiting for a reply. */
    waitingMessages?: WaitingThread[]
    /** Families asking to move a lesson, waiting for Approve or Decline (#878). */
    moveRequests?: PendingMoveRequest[]
    /** Each student's current homework and what they ticked (#945), by student id. */
    homeworkByStudent?: Record<string, HomeworkStatus>
}

export function AdminDashboard({ admin, scheduledLessons, completedLessons, students, recurringSlots, todayEvents, totalUnread, inquiries, inquiriesError, resources, pricingPlans, unloggedLessons = [], moveRequests = [], homeworkByStudent = {}, waitingMessages = [] }: AdminDashboardProps) {
    const { toast } = useToast()

    const [isMounted, setIsMounted] = useState(false)

    // Handle hydration mismatch by waiting for mount
    React.useEffect(() => {
        setIsMounted(true)
    }, [])

    // Studio-time date (STUDIO_TZ), not the browser's: lessons run on studio time even
    // when the admin is viewing from another timezone
    const todayStr = studioToday()

    // Derive Today's Lessons from the superset. Logged lessons stay listed
    // (marked Logged) so the day reads as a whole, not just what's left.
    // Note: scheduleLessons from server should include "yesterday" (UTC) to safely cover "today" (studio time)
    const todaysLessons: TodayLesson[] = [...scheduledLessons, ...completedLessons]
        .filter(l => l.date === todayStr)

    // Filter "Upcoming" to likely show today + future
    const upcomingLessons = scheduledLessons.filter(l => l.date >= todayStr)

    // Events happening today (consultations etc.), compared in STUDIO
    // wall-clock so viewing from another timezone doesn't shift the day
    const todaysEvents = todayEvents.filter(e => isoToStudioWallClock(e.start_time).localDate === todayStr)


    const [showLogLessonModal, setShowLogLessonModal] = useState(false)
    const [showScheduleModal, setShowScheduleModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [selectedLesson, setSelectedLesson] = useState<TodayLesson | null>(null)
    const [editingLesson, setEditingLesson] = useState<LessonWithStudent | null>(null)
    const [selectedStudent, setSelectedStudent] = useState<StudentRoster | null>(null)
    const [selectedStudentForLog, setSelectedStudentForLog] = useState<StudentRoster | null>(null)
    const [lessonNotes, setLessonNotes] = useState("")
    // Kept separate from notes so the student portal can surface "what do I
    // practice this week" on its own Homework tab.
    const [lessonHomework, setLessonHomework] = useState("")
    // #943: the log dialog's empty Homework box starts with last lesson's
    // homework. The counter drops a late answer for a dialog opened since.
    const [lastHomework, setLastHomework] = useState<LastHomework | null>(null)
    const lastHomeworkSeq = useRef(0)
    // "Free, don't take a credit" in the log dialog (#756).
    const [logFree, setLogFree] = useState(false)
    const [logFreeReason, setLogFreeReason] = useState("")
    // #946: the lesson is the new student's free trial, so the log is free on its own.
    const [logIsTrial, setLogIsTrial] = useState(false)
    const logTrialSeq = useRef(0)
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
    const [activeFlags, setActiveFlags] = useState<any[]>([])

    // Fetch active flags when selectedStudent is selected/changed in scheduling modal
    React.useEffect(() => {
        if (selectedStudent) {
            import("@/app/actions/lesson-intent-flags").then(({ getLessonIntentFlagsAction }) => {
                getLessonIntentFlagsAction(selectedStudent.id).then(res => {
                    if (res && res.flags) {
                        setActiveFlags(res.flags.filter((f: any) => f.status === 'active'))
                    } else {
                        setActiveFlags([])
                    }
                }).catch(() => setActiveFlags([]))
            }).catch(() => setActiveFlags([]))
        } else {
            setActiveFlags([])
        }
    }, [selectedStudent])
    const [isUploading, setIsUploading] = useState(false)
    const [showEventModal, setShowEventModal] = useState(false)
    const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null)
    const [calendarVersion, setCalendarVersion] = useState(0)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const editFileInputRef = useRef<HTMLInputElement>(null)

    // Manual Reminder State
    // "I missed this": the lesson whose confirm dialog is open
    const [missedLessonId, setMissedLessonId] = useState<string | null>(null)
    // "Running late": today's lesson whose confirm dialog is open (#788)
    const [runningLateLessonId, setRunningLateLessonId] = useState<string | null>(null)
    // "Undo log": the logged lesson whose confirm dialog is open (#794)
    const [undoLogLessonId, setUndoLogLessonId] = useState<string | null>(null)

    const [showReminderModal, setShowReminderModal] = useState(false)
    const [lessonForReminder, setLessonForReminder] = useState<TodayLesson | null>(null)



    // State for Active Tab and Chat Selection
    const [activeTab, setActiveTab] = useState("dashboard")

    // #875: practice videos still waiting for a comment (red count on the tab)
    const [practiceWaiting, setPracticeWaiting] = useState(0)
    useEffect(() => {
        countPracticeVideosWaiting().then(setPracticeWaiting).catch(() => {})
    }, [])
    const [chatStudentId, setChatStudentId] = useState<string | null>(null)

    const handleJumpToMessage = (studentId: string) => {
        setChatStudentId(studentId)
        setActiveTab("messages")
    }

    // Day shown in the dashboard schedule. null follows the real today (so it
    // rolls over at midnight); any other date is fetched on demand because the
    // page only preloads lessons around today.
    const [pickedDate, setPickedDate] = useState<string | null>(null)
    const dayViewDate = pickedDate ?? todayStr
    const isViewingToday = dayViewDate === todayStr
    const [fetchedDay, setFetchedDay] = useState<{ date: string; lessons: TodayLesson[]; events: AdminTodayEvent[] } | null>(null)
    const [isLoadingDay, setIsLoadingDay] = useState(false)

    const showScheduleForDate = (date: string) => {
        if (!date) return
        setPickedDate(date === studioToday() ? null : date)
    }

    // Links from the studio emails (#793): /admin?day=YYYY-MM-DD opens the
    // Today tab on that day's schedule, where the lesson and its buttons are.
    React.useEffect(() => {
        const day = new URLSearchParams(window.location.search).get('day')
        if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
            setActiveTab("dashboard")
            showScheduleForDate(day)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Lesson props change whenever a lesson action revalidates the page, and
    // calendarVersion on schedule/cancel, so the fetched day refreshes with them.
    React.useEffect(() => {
        if (isViewingToday) return
        let cancelled = false
        setIsLoadingDay(true)
        getAdminDaySchedule(dayViewDate)
            .then(res => {
                if (cancelled) return
                if ('error' in res) {
                    toast({ variant: "destructive", title: "Could not load that day", description: res.error })
                } else {
                    setFetchedDay({ date: dayViewDate, ...res })
                }
            })
            .catch(() => {
                if (!cancelled) toast({ variant: "destructive", title: "Could not load that day" })
            })
            .finally(() => {
                if (!cancelled) setIsLoadingDay(false)
            })
        return () => { cancelled = true }
    }, [dayViewDate, isViewingToday, scheduledLessons, completedLessons, calendarVersion])

    const dayLessons = isViewingToday ? todaysLessons : fetchedDay?.date === dayViewDate ? fetchedDay.lessons : []
    const dayEvents = isViewingToday ? todaysEvents : fetchedDay?.date === dayViewDate ? fetchedDay.events : []

    /** Asks whether the lesson being logged is the free trial (#946), for the dialog's note. */
    const checkLogTrial = (studentId: string | null, lessonId: string | null, date: string, time: string) => {
        const seq = ++logTrialSeq.current
        setLogIsTrial(false)
        if (!studentId || !date) return
        isFreeTrialLesson(studentId, lessonId, date, String(time).slice(0, 5))
            .then(trial => { if (seq === logTrialSeq.current) setLogIsTrial(trial) })
            .catch(() => { /* no note; the log still decides on save */ })
    }

    // "Log a past lesson": the date and time can change, and whether it is the
    // first lesson depends on them, so ask again as they do.
    useEffect(() => {
        if (!showLogLessonModal || !selectedStudentForLog) return
        checkLogTrial(selectedStudentForLog.id, null, logDate, logTime)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showLogLessonModal, selectedStudentForLog, logDate, logTime])

    /** Fills an empty Homework box with last lesson's homework (#943); never overwrites typing. */
    const prefillLastHomework = (studentId: string | null, date: string, time: string) => {
        const seq = ++lastHomeworkSeq.current
        setLastHomework(null)
        if (!studentId) return
        getLastHomework(studentId, date, String(time).slice(0, 5))
            .then(last => {
                if (!last || seq !== lastHomeworkSeq.current) return
                setLastHomework(last)
                setLessonHomework(h => (h.trim() ? h : last.homework))
            })
            .catch(() => { /* the box just starts empty */ })
    }

    const handleLogLesson = (lesson: TodayLesson) => {
        setSelectedLesson(lesson)
        setSelectedStudentForLog(null)
        setVideoUrl(lesson.video_url || '')
        setSheetMusicUrl(lesson.sheet_music_url || '')
        setLessonNotes(lesson.notes || '')
        const ownHomework = (lesson as any).homework || ''
        setLessonHomework(ownHomework)
        prefillLastHomework(ownHomework.trim() ? null : lesson.student_id, lesson.date, lesson.time)
        setLogFree(false)
        setLogFreeReason('')
        checkLogTrial(lesson.student_id, lesson.id, lesson.date, lesson.time)
        setShowLogLessonModal(true)
    }

    const handleLogPastLesson = (student: StudentRoster) => {
        setSelectedStudentForLog(student)
        setSelectedLesson(null)
        // Set default date to today
        setLogDate(studioToday())
        setLogTime("12:00")
        setLogDuration(60)
        setLessonHomework("")
        prefillLastHomework(student.id, studioToday(), "12:00")
        setLogFree(false)
        setLogFreeReason("")
        setShowLogLessonModal(true)
    }

    const handleSaveLesson = async () => {
        console.log('handleSaveLesson started', { selectedLesson, selectedStudentForLog })
        if (!selectedLesson && !selectedStudentForLog) return

        setIsLoading(true)

        let result;
        const free = logFree ? { reason: logFreeReason.trim() } : null

        try {
            if (selectedLesson) {
                console.log('Calling logLesson', selectedLesson.id)
                result = await logLesson(
                    selectedLesson.id,
                    lessonNotes,
                    videoUrl || undefined,
                    sheetMusicUrl || undefined,
                    lessonHomework,
                    free
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
                    sheetMusicUrl || undefined,
                    lessonHomework,
                    free
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

            // Auto-schedule check for Roster Log
            let autoScheduleMsg = ""
            if (selectedStudentForLog && selectedStudentForLog.lesson_day && selectedStudentForLog.lesson_time) {
                try {
                    console.log('Attempting auto-schedule for', selectedStudentForLog.name)
                    const scheduleRes = await bulkScheduleLessons(selectedStudentForLog.id, 1)
                    if (!scheduleRes.error) {
                        autoScheduleMsg = " Next lesson scheduled."
                    }
                } catch (err) {
                    console.error('Auto-schedule failed', err)
                }
            }

            toast({
                title: "Lesson Logged",
                description: `Successfully logged lesson. ${(result as any)?.trial ? "Free trial: no credit taken." : free || (result as any)?.free ? "Free: no credit taken." : "Credit deducted."}${autoScheduleMsg}`
            })
            setShowLogLessonModal(false)
            setLessonNotes("")
            setLessonHomework("")
            setLogFree(false)
            setLogFreeReason("")
            setVideoUrl("")
            setSheetMusicUrl("")
            setSelectedLesson(null)
            setSelectedStudentForLog(null)
            setCalendarVersion(v => v + 1)
        }
    }

    const handleMarkNoShow = async (lesson: TodayLesson) => {
        if (confirm(`Mark ${lesson.student.name} as No-Show? This will deduct 1 credit without refund or makeup option.`)) {
            setIsLoading(true)
            let result: { error?: string }
            try {
                result = await markNoShow(lesson.id)
            } catch {
                result = { error: "The request failed before an answer came back. Check the lesson before trying again." }
            }
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

        // Autofill date from student's recurring lesson day
        const today = studioToday()
        const dayMap: Record<string, number> = {
            'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
            'Thursday': 4, 'Friday': 5, 'Saturday': 6
        }
        const targetDay = student.lesson_day ? dayMap[student.lesson_day] : undefined
        if (targetDay !== undefined) {
            let daysUntil = targetDay - weekdayOfDateStr(today)
            if (daysUntil < 0) daysUntil += 7 // Pick today if it matches, otherwise next occurrence
            setScheduleDate(shiftDateStr(today, daysUntil))
        } else {
            setScheduleDate(shiftDateStr(today, 1))
        }

        // Autofill time and duration from student defaults
        setScheduleTime(student.lesson_time || "15:00")
        setScheduleDuration((student as any).lesson_duration || 60)
        setIsRescheduling(false)
        setRescheduleLessonId(null)
        setShowScheduleModal(true)
    }

    const openNewSchedule = () => {
        setSelectedStudent(null)
        setScheduleDate(shiftDateStr(studioToday(), 1))
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
        if (confirm(`Are you sure you want to cancel the lesson for ${studentName}? The student will be fully refunded.`)) {
            setIsLoading(true)
            // Import dynamically or pass as prop if import fails, but since this is client component in app router we can use server actions directly
            let result: { error?: string; message?: string }
            try {
                const { cancelLesson } = await import("@/app/actions/lessons")
                result = await cancelLesson(lessonId)
            } catch {
                result = { error: "The request failed before an answer came back. Check the lesson before trying again." }
            }
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

    const handleScheduleSubmit = async (forceOverride = false) => {
        if (!selectedStudent || !scheduleDate || !scheduleTime) return

        setIsLoading(true)

        if (isRescheduling && rescheduleLessonId) {
            const { rescheduleLesson } = await import("@/app/actions/lessons")
            const result = await rescheduleLesson(rescheduleLessonId, scheduleDate, scheduleTime, scheduleDuration, forceOverride)

            if (result.error) {
                if (result.error === 'lesson_intent_conflict') {
                    const confirmMsg = "Warning: this student has an active skip/cancel/reschedule request for this date.\n\nDo you want to override and schedule anyway?"
                    setIsLoading(false)
                    if (confirm(confirmMsg)) {
                        handleScheduleSubmit(true)
                        return
                    }
                } else {
                    toast({
                        variant: "destructive",
                        title: "Rescheduling Failed",
                        description: result.error
                    })
                }
            } else {
                toast({
                    title: "Lesson Rescheduled",
                    description: result.warning ? `${result.message}. Note: ${result.warning}` : result.message
                })
                setShowScheduleModal(false)
                setSelectedStudent(null)
                setIsRescheduling(false)
                setRescheduleLessonId(null)
                setCalendarVersion(v => v + 1)
            }
        } else {
            const result = await scheduleLesson(selectedStudent.id, scheduleDate, scheduleTime, scheduleDuration, forceOverride)

            if (result.error) {
                if (result.error === 'lesson_intent_conflict') {
                    const confirmMsg = "Warning: this student has an active skip/cancel/reschedule request for this date.\n\nDo you want to override and schedule anyway?"
                    setIsLoading(false)
                    if (confirm(confirmMsg)) {
                        handleScheduleSubmit(true)
                        return
                    }
                } else {
                    toast({
                        variant: "destructive",
                        title: "Scheduling Failed",
                        description: result.error
                    })
                }
            } else {
                toast({
                    title: "Lesson Scheduled",
                    description: result.warning ? `${result.message}. Note: ${result.warning}` : result.message
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
        setLessonHomework((lesson as any).homework || '')
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
            sheetMusicUrl,
            lessonHomework
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
            setLessonHomework('')
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
        // Lesson times are studio wall-clock; parsing them as browser-local
        // time made a later-today lesson look past when viewed from EST
        const lessonDate = new Date(studioWallClockToISO(lesson.date, lesson.time.slice(0, 5)))

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
            const result = await uploadSheetMusic(file, lessonId)

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
            {/* #1087: any student name in admin opens their side panel */}
            <StudentPanelProvider students={students} onMessage={handleJumpToMessage} onSchedule={handleOpenSchedule} onLogPast={handleLogPastLesson}>
            {/* Header */}
            <header className="border-b bg-card sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
                    {/* On a phone the buttons go under the name and scroll sideways, so the page keeps the phone's width (#760). */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 sm:shrink-0">
                            <div className="h-10 w-10 shrink-0 bg-primary rounded-full flex items-center justify-center">
                                <Music className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-xl font-serif font-semibold">{admin.studio_name || "Teacher Admin Portal"}</h1>
                                    <UnloggedLessonsBadge lessons={unloggedLessons} />
                                    <WaitingMessagesPill threads={waitingMessages} onOpen={handleJumpToMessage} />
                                </div>
                                <p className="text-sm text-muted-foreground">{admin.name || 'Admin'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
                            <Button variant="outline" asChild>
                                <a href="/admin/events" className="gap-2">
                                    <Calendar className="h-4 w-4" />
                                    Events
                                </a>
                            </Button>
                            <Button variant="outline" asChild>
                                <a href="/admin/recital-review" className="gap-2">
                                    <Mail className="h-4 w-4" />
                                    Recital
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
                                <a href="/admin/jobs" className="gap-2">
                                    <Clock className="h-4 w-4" />
                                    Jobs
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
                    <TabsList className="w-full justify-start overflow-x-auto h-auto p-1">
                        <TabsTrigger value="dashboard" className="gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            <span className="hidden sm:inline">Today</span>
                        </TabsTrigger>
                        <TabsTrigger value="changes" className="gap-2">
                            <History className="h-4 w-4" />
                            <span className="hidden sm:inline">Changes</span>
                        </TabsTrigger>
                        <TabsTrigger value="calendar" className="gap-2">
                            <Calendar className="h-4 w-4" />
                            <span className="hidden sm:inline">Calendar</span>
                        </TabsTrigger>
                        <TabsTrigger value="weekly" className="gap-2">
                            <CalendarClock className="h-4 w-4" />
                            <span className="hidden sm:inline">Weekly</span>
                        </TabsTrigger>
                        <TabsTrigger value="scheduled" className="gap-2">
                            <Clock className="h-4 w-4" />
                            <span className="hidden sm:inline">List</span>
                        </TabsTrigger>
                        <TabsTrigger value="completed" className="gap-2">
                            <Music className="h-4 w-4" />
                            <span className="hidden sm:inline">Completed</span>
                        </TabsTrigger>
                        <TabsTrigger value="recordings" className="gap-2">
                            <Film className="h-4 w-4" />
                            <span className="hidden sm:inline">Classroom recordings</span>
                        </TabsTrigger>
                        <TabsTrigger value="practice" className="gap-2 relative">
                            <Video className="h-4 w-4" />
                            <span className="hidden sm:inline">Practice</span>
                            {practiceWaiting > 0 && (
                                <Badge
                                    variant="destructive"
                                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                                >
                                    {practiceWaiting}
                                </Badge>
                            )}
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
                            {inquiries.filter(i => i.status === 'Lead').length > 0 && (
                                <Badge
                                    variant="destructive"
                                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                                >
                                    {inquiries.filter(i => i.status === 'Lead').length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="balances" className="gap-2">
                            <Wallet className="h-4 w-4" />
                            <span className="hidden sm:inline">Balances</span>
                        </TabsTrigger>
                        <TabsTrigger value="pricing" className="gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span className="hidden sm:inline">Pricing</span>
                        </TabsTrigger>
                        <TabsTrigger value="announcements" className="gap-2">
                            <Megaphone className="h-4 w-4" />
                            <span className="hidden sm:inline">Announce</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="dashboard" className="space-y-8">
                        {/* Families asking to move a lesson (#878): Approve / Decline */}
                        <MoveRequestsCard
                            requests={moveRequests}
                            onChanged={() => setCalendarVersion(v => v + 1)}
                        />

                        {/* Daily Schedule */}
                        <DashboardTab
                            date={dayViewDate}
                            homeworkByStudent={homeworkByStudent}
                            isToday={isViewingToday}
                            onDateChange={showScheduleForDate}
                            isLoadingDay={isLoadingDay}
                            lessons={dayLessons}
                            events={dayEvents}
                            adminZoomLink={admin.zoom_link}
                            onLog={handleLogLesson}
                            onEdit={handleEditLesson}
                            onReschedule={handleReschedule}
                            onNoShow={handleMarkNoShow}
                            onCancel={handleCancelLesson}
                            onMissed={(lesson) => setMissedLessonId(lesson.id)}
                            onRunningLate={(lesson) => setRunningLateLessonId(lesson.id)}
                            onUndoLog={(lesson) => setUndoLogLessonId(lesson.id)}
                            onRemind={(lesson) => {
                                setLessonForReminder(lesson)
                                setShowReminderModal(true)
                            }}
                            isLoading={isLoading}
                            onMessage={handleJumpToMessage}
                        />

                        <MissedLessonDialog
                            lessonId={missedLessonId}
                            onClose={() => setMissedLessonId(null)}
                            onDone={() => setCalendarVersion(v => v + 1)}
                        />

                        <RunningLateDialog
                            lessonId={runningLateLessonId}
                            onClose={() => setRunningLateLessonId(null)}
                        />

                        {/* Student Roster */}
                        <RosterTab
                            students={students}
                            onLog={handleLogPastLesson}
                            onSchedule={handleOpenSchedule}
                            onDelete={handleDeleteStudent}
                            onMessage={handleJumpToMessage}
                            pricingPlans={pricingPlans}
                        />
                    </TabsContent>

                    {/* #1005: every lesson and credit change of the day, whoever made it */}
                    <TabsContent value="changes" className="space-y-4">
                        {activeTab === "changes" && <ChangesTab renderName={(id, name) => <StudentLink id={id} name={name} />} />}
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
                            onUndoLog={(lesson) => setUndoLogLessonId(lesson.id)}
                        />
                    </TabsContent>

                    {/* Classroom (LiveKit) recordings and the lesson each went on */}
                    <TabsContent value="recordings" className="space-y-4">
                        {/* #954: search what was said in every lesson (transcripts made on the Mac, #953) */}
                        {activeTab === "recordings" && <TranscriptSearch />}
                        <ClassroomRecordingsTab
                            onOpenDay={(date) => {
                                showScheduleForDate(date)
                                setActiveTab("dashboard")
                            }}
                        />
                    </TabsContent>

                    {/* #875: practice videos from students, with your comments */}
                    <TabsContent value="practice" className="space-y-4">
                        {activeTab === "practice" && <PracticeVideosTab onWaitingChange={setPracticeWaiting} />}
                    </TabsContent>

                    <TabsContent value="messages">
                        <AdminChat
                            initialStudentId={chatStudentId}
                            onClearInitialStudent={() => setChatStudentId(null)}
                        />
                    </TabsContent>

                    <TabsContent value="inquiries" className="m-0 h-full p-4 lg:p-10 overflow-auto">
                        <InquiriesTab inquiries={inquiries} error={inquiriesError} />
                    </TabsContent>

                    {/* #935: every active family's lessons left, lessons and next payment (read only) */}
                    <TabsContent value="balances" className="space-y-4">
                        {activeTab === "balances" && <BalancesTab onMessage={handleJumpToMessage} />}
                    </TabsContent>

                    <TabsContent value="pricing" className="p-4 lg:p-10">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-2xl font-serif">Pricing Plans</CardTitle>
                                <CardDescription>Manage subscription plans and credit packages</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <PricingManager initialPlans={pricingPlans} />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="announcements" className="p-4 lg:p-10">
                        <AnnouncementTab students={students} />
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
                                        onSelectDate={(date) => {
                                            showScheduleForDate(date)
                                            setActiveTab("dashboard")
                                        }}
                                        refreshTrigger={calendarVersion}
                                    />
                                </CardContent>
                            </Card>
                        </Suspense>
                    </TabsContent>

                    <TabsContent value="weekly">
                        <WeeklyScheduleTab
                            students={students}
                            recurringSlots={recurringSlots}
                            scheduledLessons={scheduledLessons}
                        />
                    </TabsContent>
                </Tabs >
            </main >
            </StudentPanelProvider>

            {/* "Undo log" (#794), opened from Today and from Completed */}
            <UndoLogDialog
                lessonId={undoLogLessonId}
                onClose={() => setUndoLogLessonId(null)}
                onDone={() => setCalendarVersion(v => v + 1)}
            />

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
                                placeholder="Enter your lesson notes and progress observations..."
                                value={lessonNotes}
                                onChange={(e) => setLessonNotes(e.target.value)}
                                rows={6}
                                className="resize-none"
                            />
                            <NotePhraseChips onPick={(phrase) => setLessonNotes(n => appendNotePhrase(n, phrase))} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="homework" className="text-base">
                                Homework
                            </Label>
                            <Textarea
                                id="homework"
                                placeholder="What should they practice before the next lesson? One item per line."
                                value={lessonHomework}
                                onChange={(e) => setLessonHomework(e.target.value)}
                                rows={4}
                                className="resize-none"
                            />
                            {lastHomework && lessonHomework === lastHomework.homework && (
                                <p className="text-xs text-muted-foreground">
                                    Last lesson&apos;s homework ({shortLessonDate(lastHomework.date)}): edit what changed or clear it.
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Shown on its own Homework tab in the student portal. One item per line becomes a checklist.
                            </p>
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
                                                .sort((a, b) => a.title.localeCompare(b.title))
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

                    {/* Free lesson (#756): logged, but no credit taken. */}
                    <div className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="log-free"
                                checked={logFree}
                                onCheckedChange={(v) => setLogFree(v === true)}
                            />
                            <Label htmlFor="log-free" className="text-sm font-medium cursor-pointer">
                                Free, don&apos;t take a credit
                            </Label>
                        </div>
                        {/* #947: ready reasons; a tap ticks Free and fills the reason. */}
                        <FreeReasonChips
                            value={logFree ? logFreeReason : ""}
                            onPick={(reason) => { setLogFree(true); setLogFreeReason(reason) }}
                            disabled={isLoading}
                        />
                        {logFree && (
                            <Input
                                id="log-free-reason"
                                placeholder="Reason (optional, only you see it)"
                                value={logFreeReason}
                                onChange={(e) => setLogFreeReason(e.target.value)}
                                maxLength={300}
                            />
                        )}
                        {logIsTrial && !logFree && (
                            <p className="text-sm text-emerald-700 dark:text-emerald-400">
                                First lesson and nothing paid yet: this is the free trial, so it is logged free on its own (reason Trial).
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            The family still gets the usual lesson email. Nothing is sent about it being free. The credit check leaves it alone.
                        </p>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setShowLogLessonModal(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveLesson} disabled={isLoading}>
                            {isLoading ? 'Saving...' : logFree || logIsTrial ? 'Save Lesson (free)' : 'Save Lesson'}
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

                        {activeFlags.length > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3 space-y-1 text-xs">
                                <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                    Active Student Requests:
                                </p>
                                <ul className="text-amber-700 dark:text-amber-400 list-disc pl-4 space-y-0.5">
                                    {activeFlags.map((flag) => (
                                        <li key={flag.id}>
                                            <strong>{flag.intent.replace('_', ' ')}</strong> on {flag.target_date} {flag.note ? `(${flag.note})` : ''}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

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
                                    min={studioToday()}
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
                        <Button onClick={() => handleScheduleSubmit()} disabled={isLoading}>
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
                                placeholder="Enter your lesson notes and progress observations..."
                                value={lessonNotes}
                                onChange={(e) => setLessonNotes(e.target.value)}
                                rows={6}
                                className="resize-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-homework" className="text-base">
                                Homework
                            </Label>
                            <Textarea
                                id="edit-homework"
                                placeholder="What should they practice before the next lesson? One item per line."
                                value={lessonHomework}
                                onChange={(e) => setLessonHomework(e.target.value)}
                                rows={4}
                                className="resize-none"
                            />
                            <p className="text-xs text-muted-foreground">
                                Shown on its own Homework tab in the student portal. One item per line becomes a checklist.
                            </p>
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
                                                .sort((a, b) => a.title.localeCompare(b.title))
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
