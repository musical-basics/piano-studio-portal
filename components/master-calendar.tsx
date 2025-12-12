"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Clock } from "lucide-react"
import { getLessonsForDateRange } from "@/app/actions/lessons"
import type { Lesson, Profile } from "@/lib/supabase/database.types"

// Helper to format date as YYYY-MM-DD for comparison/filtering
const formatDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

type CalendarLesson = Lesson & {
    student: {
        name: string | null
        email: string | null
    } | null
}

export function MasterCalendar() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [lessons, setLessons] = useState<CalendarLesson[]>([])
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
        // Cast the result to match our type (Supabase types can be tricky with joins)
        setLessons((result.lessons as unknown) as CalendarLesson[])
        setIsLoading(false)
    }

    useEffect(() => {
        loadLessons()
    }, [currentDate])

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

                        const dayLessons = lessons.filter(l => l.date === dateKey)

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
                                    {dayLessons.length > 0 && (
                                        <span className="text-xs text-muted-foreground font-mono">
                                            {dayLessons.length}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    {isLoading && idx === 0 ? (
                                        <div className="flex justify-center pt-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        dayLessons.map(lesson => (
                                            <div
                                                key={lesson.id}
                                                className="text-xs p-1.5 rounded bg-secondary/50 border border-secondary hover:bg-secondary truncate"
                                                title={`${lesson.time} - ${lesson.student?.name || 'Unknown Student'}`}
                                            >
                                                <div className="flex items-center gap-1 font-semibold text-primary/80">
                                                    <Clock className="h-3 w-3" />
                                                    {lesson.time}
                                                </div>
                                                <div className="truncate">
                                                    {lesson.student?.name}
                                                </div>
                                            </div>
                                        ))
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
