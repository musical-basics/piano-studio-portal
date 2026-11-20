"use client"

import { useEffect, useState } from "react"
import { DoorOpen } from "lucide-react"
import { getClassroomAttendance } from "@/app/actions/classroom-attendance"
import { classroomAttendanceLine, type ClassroomAttendance } from "@/lib/classroom-lesson-attendance"

/**
 * #1103: who was in the classroom room for the lessons on screen, loaded in
 * one call. null until it has loaded (or when it could not). Admin only.
 */
export function useClassroomAttendance(lessonIds: string[]): Record<string, ClassroomAttendance> | null {
    const key = [...lessonIds].sort().join(",")
    const [views, setViews] = useState<Record<string, ClassroomAttendance> | null>(null)
    useEffect(() => {
        let alive = true
        if (!key) { setViews({}); return }
        getClassroomAttendance(key.split(","))
            .then(res => { if (alive) setViews("error" in res ? null : res.views) })
            .catch(() => { if (alive) setViews(null) })
        return () => { alive = false }
    }, [key])
    return views
}

/**
 * "Classroom: you 31 min, student 29 min (joined 6:31pm)" under a lesson that
 * has started, when someone was in its classroom room (or it is a classroom
 * lesson and nobody came). Nothing otherwise, or before the data has loaded.
 */
export function ClassroomAttendanceLine({
    lesson,
    views,
}: {
    lesson: { id: string }
    views: Record<string, ClassroomAttendance> | null
}) {
    const view = views?.[lesson.id]
    if (!view) return null
    const line = classroomAttendanceLine(view)
    return (
        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title={line.title}>
            <DoorOpen className="h-3 w-3 shrink-0" />
            <span>{line.text}</span>
        </p>
    )
}
