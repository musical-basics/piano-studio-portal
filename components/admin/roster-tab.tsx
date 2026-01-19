"use client"

import React, { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, Upload, Plus, Trash2, ArrowUpDown, MessageCircle, MonitorPlay, CalendarClock, Loader2, Download } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { bulkScheduleLessons } from "@/app/actions/lessons"
import { useToast } from "@/hooks/use-toast"

// We assume your Lesson App is hosted here (Change this if different!)
const CLASSROOM_URL = process.env.NEXT_PUBLIC_CLASSROOM_URL || "https://classroom.musicalbasics.com"
import type { StudentRoster } from "@/types/admin"
import { AddStudentModal } from "./add-student-modal"
import { EditStudentModal } from "./edit-student-modal"

type SortKey = 'name' | 'lesson_day' | 'credits'
type SortDirection = 'asc' | 'desc'
interface SortConfig {
    key: SortKey
    direction: SortDirection
}

interface RosterTabProps {
    students: StudentRoster[]
    onLog: (student: StudentRoster) => void
    onSchedule: (student: StudentRoster) => void
    onDelete: (student: StudentRoster) => void
    onMessage: (studentId: string) => void
}

function AutoScheduleButton({ student }: { student: StudentRoster }) {
    const { toast } = useToast()
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    if (!student.lesson_day || !student.lesson_time) return null

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <CalendarClock className="h-4 w-4" />
                    )}
                    <span className="sr-only">Auto-Schedule</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
                <div className="space-y-2">
                    <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider px-2">
                        {student.lesson_day}s at {student.lesson_time}
                    </h4>
                    <div className="grid gap-1">
                        {[1, 2, 4].map((num) => (
                            <Button
                                key={num}
                                variant="ghost"
                                className="justify-start h-8 font-normal"
                                disabled={isLoading}
                                onClick={async () => {
                                    setIsLoading(true)
                                    toast({ title: "Scheduling...", description: "Please wait." })

                                    try {
                                        const res = await bulkScheduleLessons(student.id, num)
                                        if (res.error) {
                                            toast({ variant: "destructive", title: "Error", description: res.error })
                                        } else {
                                            toast({ title: "Done", description: res.message })
                                            setOpen(false) // Close the popover
                                            router.refresh()
                                        }
                                    } catch (e) {
                                        toast({ variant: "destructive", title: "Error", description: "Something went wrong" })
                                    } finally {
                                        setIsLoading(false)
                                    }
                                }}
                            >
                                Schedule Next {num}
                            </Button>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function RosterTab({ students, onLog, onSchedule, onDelete, onMessage }: RosterTabProps) {
    const { toast } = useToast()
    const router = useRouter()
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'lesson_day', direction: 'asc' })

    const dayOrder: Record<string, number> = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
        'Thursday': 4, 'Friday': 5, 'Saturday': 6
    }

    // Helper to generate the Launcher Link
    const getClassroomLink = (student: StudentRoster) => {
        // We pass the ID. The Launcher (on the other app) handles the Auth.
        // We also pass metadata (name/email) just in case the cache is stale, 
        // ensuring the video interface always has the correct label.
        const params = new URLSearchParams({
            email: student.email || "",
            name: student.name || "",
        })
        return `${CLASSROOM_URL}/start/${student.id}?${params.toString()}`
    }

    const sortedStudents = useMemo(() => {
        return [...students].sort((a, b) => {
            const { key, direction } = sortConfig
            let comparison = 0

            if (key === 'name') {
                comparison = (a.name || '').localeCompare(b.name || '')
            } else if (key === 'lesson_day') {
                const dayA = a.lesson_day ? dayOrder[a.lesson_day] ?? 99 : 99
                const dayB = b.lesson_day ? dayOrder[b.lesson_day] ?? 99 : 99
                comparison = dayA - dayB
            } else if (key === 'credits') {
                comparison = (a.credits ?? 0) - (b.credits ?? 0)
            }

            return direction === 'asc' ? comparison : -comparison
        })
    }, [students, sortConfig])

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }))
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-2xl font-serif">Student Roster</CardTitle>
                        <CardDescription>Complete overview of all active students</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => {
                            const headers = ["Name", "Contact Email", "Weekday", "Credits"]
                            const csvContent = [
                                headers.join(","),
                                ...students.map(student => [
                                    `"${student.name || ''}"`,
                                    `"${student.email || ''}"`,
                                    `"${student.lesson_day || ''}"`,
                                    `"${student.credits}"`
                                ].join(","))
                            ].join("\n")

                            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
                            const link = document.createElement("a")
                            const url = URL.createObjectURL(blob)
                            link.setAttribute("href", url)
                            link.setAttribute("download", `student_roster_${new Date().toISOString().split('T')[0]}.csv`)
                            document.body.appendChild(link)
                            link.click()
                            document.body.removeChild(link)
                        }}>
                            <Download className="h-4 w-4 mr-2" />
                            Export CSV
                        </Button>
                        <AddStudentModal />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead className="font-semibold">
                                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => handleSort('name')}>
                                        Name
                                        <ArrowUpDown className={`h-4 w-4 ${sortConfig.key === 'name' ? 'opacity-100' : 'opacity-40'}`} />
                                    </Button>
                                </TableHead>
                                <TableHead className="font-semibold">Contact</TableHead>
                                <TableHead className="font-semibold">
                                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => handleSort('lesson_day')}>
                                        Weekday
                                        <ArrowUpDown className={`h-4 w-4 ${sortConfig.key === 'lesson_day' ? 'opacity-100' : 'opacity-40'}`} />
                                    </Button>
                                </TableHead>
                                <TableHead className="font-semibold text-center">
                                    <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => handleSort('credits')}>
                                        Credits
                                        <ArrowUpDown className={`h-4 w-4 ${sortConfig.key === 'credits' ? 'opacity-100' : 'opacity-40'}`} />
                                    </Button>
                                </TableHead>
                                <TableHead className="font-semibold text-center">Balance Due</TableHead>
                                <TableHead className="font-semibold">Status</TableHead>
                                <TableHead className="font-semibold text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedStudents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                                        No students found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedStudents.map((student) => (
                                    <TableRow key={student.id} className={Number(student.balance_due) > 0 ? "bg-destructive/5" : ""}>
                                        <TableCell>
                                            <EditStudentModal student={student} />
                                        </TableCell>
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

                                                {/* --- NEW AUTO-SCHEDULE BUTTON --- */}
                                                {/* --- NEW AUTO-SCHEDULE BUTTON --- */}
                                                <AutoScheduleButton student={student} />
                                                {/* -------------------------------- */}
                                                {/* -------------------------------- */}

                                                {/* --- NEW BUTTON: JOIN CLASSROOM --- */}
                                                <Button
                                                    size="sm"
                                                    // We use 'secondary' or a distinct color like 'indigo' 
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white border-0"
                                                    onClick={() => window.open(getClassroomLink(student), '_blank')}
                                                    title="Open Teacher Interface"
                                                >
                                                    <MonitorPlay className="h-4 w-4 mr-1" />
                                                    Room
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => onMessage(student.id)}
                                                >
                                                    <MessageCircle className="h-4 w-4 mr-1" />
                                                    Msg
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => onLog(student)}
                                                >
                                                    <Upload className="h-4 w-4 mr-1" />
                                                    Log
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    onClick={() => onSchedule(student)}
                                                >
                                                    <Plus className="h-4 w-4 mr-1" />
                                                    Schedule
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    className="px-2"
                                                    onClick={() => onDelete(student)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
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
    )
}
