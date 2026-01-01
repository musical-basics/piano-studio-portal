"use client"

import React, { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, Upload, Plus, Trash2, ArrowUpDown } from "lucide-react"
import type { StudentRoster } from "@/types/admin"
import { AddStudentModal } from "@/components/add-student-modal"
import { EditStudentModal } from "@/components/edit-student-modal"

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
}

export function RosterTab({ students, onLog, onSchedule, onDelete }: RosterTabProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'lesson_day', direction: 'asc' })

    const dayOrder: Record<string, number> = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
        'Thursday': 4, 'Friday': 5, 'Saturday': 6
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
                    <AddStudentModal />
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
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
                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                        No students found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedStudents.map((student) => (
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
