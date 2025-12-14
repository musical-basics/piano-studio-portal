"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Clock, Pencil, Trash2, MoreHorizontal } from "lucide-react"
import { getLessonsForDateRange } from "@/app/actions/lessons"
import type { Lesson, Profile } from "@/lib/supabase/database.types"
import type { AdminEvent, EventInvite } from "@/app/actions/events"

// Helper to format date as YYYY-MM-DD for comparison/filtering
const formatDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

// Helper to extract LOCAL date and time from an ISO string
// (Same as in create-event-modal.tsx)
const getLocalDateTime = (isoString: string) => {
    if (!isoString) return { localDate: '', localTime: '' }

    const date = new Date(isoString);
    if (isNaN(date.getTime())) return { localDate: '', localTime: '' }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const localTime = `${hours}:${minutes}`;

    return { localDate, localTime };
};

export type CalendarLesson = Lesson & {
    student: {
        name: string | null
        email: string | null
    } | null
    type: 'lesson'
}

type CalendarEvent = AdminEvent & {
    type: 'event'
}

type CalendarItem = CalendarLesson | CalendarEvent

interface MasterCalendarProps {
    onEditLesson?: (lesson: CalendarLesson) => void
    onDeleteLesson?: (lesson: CalendarLesson) => void
    onEditEvent?: (event: AdminEvent) => void
    onDeleteEvent?: (event: AdminEvent) => void
    refreshTrigger?: number
}

export function MasterCalendar({ onEditLesson, onDeleteLesson, onEditEvent, onDeleteEvent, refreshTrigger = 0 }: MasterCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [items, setItems] = useState<CalendarItem[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // Get start/end of current month view (including padding days from prev/next months)
    const getMonthBounds = (date: Date) => {
        const year = date.getFullYear()
        const month = date.getMonth()

        const firstDayOfMonth = new Date(year, month, 1)
        const lastDayOfMonth = new Date(year, month + 1, 0)

        const startDayOfWeek = firstDayOfMonth.getDay() // 0 (Sun) - 6 (Sat)

        // Start date for the grid (go back to Sunday)
        const startDate = new Date(firstDayOfMonth)
        startDate.setDate(startDate.getDate() - startDayOfWeek)

        // End date for the grid (go forward to Saturday)
        const endDayOfWeek = lastDayOfMonth.getDay()
        const endDate = new Date(lastDayOfMonth)
        endDate.setDate(endDate.getDate() + (6 - endDayOfWeek))

        return { startDate, endDate }
    }

    const loadLessons = async () => {
        setIsLoading(true)
        const { startDate, endDate } = getMonthBounds(currentDate)

        // Format for DB query
        const startStr = formatDateKey(startDate)
        const endStr = formatDateKey(endDate)

        const result = await getLessonsForDateRange(startStr, endStr)

        // Process Lessons
        const loadedLessons = (result.lessons as any[]).map(l => ({
            ...l,
            type: 'lesson'
        })) as CalendarLesson[]

        // Process Events
        const loadedEvents = (result.events || []).map((e: any) => {
            // Map invites individually
            const invites: EventInvite[] = e.event_invites?.map((invite: any) => ({
                student_id: invite.student_id,
                student_name: invite.profiles?.name || 'Unknown',
                status: invite.status,
                responded_at: invite.updated_at,
                student_notes: invite.student_notes
            })) || []



            // Fix: Use Local Time for Calendar Display (avoids timezone shift)
            const { localDate, localTime } = getLocalDateTime(e.start_time)

            // Fallback if parsing failed
            const dateStr = localDate
            const timeStr = localTime

            return {
                id: e.id,
                title: e.title,
                description: e.description || '',
                date: dateStr,
                start_time: timeStr,
                duration_minutes: e.duration,
                location_type: e.location_type,
                location_address: e.location_details, // or logic from getAdminEvents
                zoom_link: e.location_type === 'virtual' ? e.location_details : undefined,
                rsvp_deadline: e.rsvp_deadline ? getLocalDateTime(e.rsvp_deadline).localDate : '',
                invites: invites,
                created_at: e.created_at,
                type: 'event'
            }
        }) as CalendarEvent[]

        setItems([...loadedLessons, ...loadedEvents])
        setIsLoading(false)
    }

    useEffect(() => {
        loadLessons()
    }, [currentDate, refreshTrigger])

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    }

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    }

    const handleToday = () => {
        setCurrentDate(new Date())
    }

    const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const { startDate, endDate } = getMonthBounds(currentDate)

    // Generate days for the grid
    const days: Date[] = []
    let day = new Date(startDate)
    while (day <= endDate) {
        days.push(new Date(day))
        day.setDate(day.getDate() + 1)
    }

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <h2 className="text-2xl font-bold font-serif">{monthName}</h2>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handlePrevMonth}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleToday}>
                        Today
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleNextMonth}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="bg-background rounded-lg border shadow-sm overflow-hidden">
                {/* Week headers */}
                <div className="grid grid-cols-7 border-b bg-muted/30">
                    {weekDays.map(d => (
                        <div key={d} className="py-2 text-center text-sm font-semibold text-muted-foreground border-r last:border-r-0">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 auto-rows-fr">
                    {days.map((date, idx) => {
                        const dateKey = formatDateKey(date)
                        const isCurrentMonth = date.getMonth() === currentDate.getMonth()
                        const isToday = formatDateKey(new Date()) === dateKey

                        // Filter items for this day
                        const dayItems = items.filter(item => {
                            if (item.type === 'lesson') {
                                return item.date === dateKey
                            } else {
                                // Event start_time is ISO, checks were dateKey
                                // We parsed dateStr in map
                                return item.date === dateKey
                            }
                        })

                        return (
                            <div
                                key={dateKey}
                                className={`min-h-[120px] p-2 border-b border-r last:border-r-0 relative group transition-colors
                    ${!isCurrentMonth ? 'bg-muted/10 text-muted-foreground' : 'bg-background'}
                    ${isToday ? 'bg-primary/5' : ''}
                `}
                            >
                                <div className={`flex justify-between items-start mb-1`}>
                                    <span className={`text-sm font-medium h-7 w-7 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-primary text-primary-foreground' : ''}
                    `}>
                                        {date.getDate()}
                                    </span>
                                    {dayItems.length > 0 && (
                                        <span className="text-xs text-muted-foreground font-mono">
                                            {dayItems.length}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    {isLoading && idx === 0 ? (
                                        <div className="flex justify-center pt-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        dayItems.map(item => {
                                            if (item.type === 'lesson') {
                                                const timeDisplay = item.time.substring(0, 5) // HH:MM
                                                return (
                                                    <Popover key={item.id}>
                                                        <PopoverTrigger asChild>
                                                            <div
                                                                className="text-xs p-1.5 rounded bg-secondary/50 border border-secondary hover:bg-secondary truncate cursor-pointer transition-colors"
                                                                title={`${timeDisplay} - ${item.student?.name || 'Unknown Student'}`}
                                                            >
                                                                <div className="flex items-center gap-1 font-semibold text-primary/80">
                                                                    <Clock className="h-3 w-3" />
                                                                    {timeDisplay}
                                                                </div>
                                                                <div className="truncate">
                                                                    {item.student?.name}
                                                                </div>
                                                            </div>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-40 p-1" align="start">
                                                            <div className="flex flex-col gap-0.5">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="justify-start h-8 px-2 font-normal"
                                                                    onClick={() => onEditLesson?.(item)}
                                                                >
                                                                    <Pencil className="h-3 w-3 mr-2" />
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="justify-start h-8 px-2 font-normal text-destructive hover:text-destructive"
                                                                    onClick={() => onDeleteLesson?.(item)}
                                                                >
                                                                    <Trash2 className="h-3 w-3 mr-2" />
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                )
                                            } else {
                                                // Event Rendering
                                                return (
                                                    <Popover key={item.id}>
                                                        <PopoverTrigger asChild>
                                                            <div
                                                                className="text-xs p-1.5 rounded bg-primary/10 border border-primary/20 hover:bg-primary/20 truncate cursor-pointer transition-colors"
                                                                title={`${item.start_time} - ${item.title}`}
                                                            >
                                                                <div className="flex items-center gap-1 font-semibold text-primary">
                                                                    <CalendarIcon className="h-3 w-3" />
                                                                    {item.start_time}
                                                                </div>
                                                                <div className="truncate font-medium">
                                                                    {item.title}
                                                                </div>
                                                            </div>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-40 p-1" align="start">
                                                            <div className="flex flex-col gap-0.5">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="justify-start h-8 px-2 font-normal"
                                                                    onClick={() => onEditEvent?.(item)}
                                                                >
                                                                    <Pencil className="h-3 w-3 mr-2" />
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="justify-start h-8 px-2 font-normal text-destructive hover:text-destructive"
                                                                    onClick={() => onDeleteEvent?.(item)}
                                                                >
                                                                    <Trash2 className="h-3 w-3 mr-2" />
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                )
                                            }
                                        })
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
