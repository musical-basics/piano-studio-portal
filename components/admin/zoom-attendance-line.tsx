"use client"

import { useEffect, useState } from "react"
import { Video } from "lucide-react"
import { getLessonAttendance } from "@/app/actions/zoom-attendance"
import { attendanceLine, showsAttendance, type AttendanceView } from "@/lib/zoom-lesson-attendance"

/**
 * #964: the saved Zoom attendance for the lessons on screen, loaded in one
 * call. null until it has loaded (or when it could not), so nothing flashes
 * "not checked yet" while loading. Admin only.
 */
export function useLessonAttendance(lessonIds: string[]): Record<string, AttendanceView> | null {
    const key = [...lessonIds].sort().join(",")
    const [views, setViews] = useState<Record<string, AttendanceView> | null>(null)
    useEffect(() => {
        let alive = true
        if (!key) { setViews({}); return }
        getLessonAttendance(key.split(","))
            .then(res => { if (alive) setViews("error" in res ? null : res.views) })
            .catch(() => { if (alive) setViews(null) })
        return () => { alive = false }
    }, [key])
    return views
}

/**
 * "Zoom: you 31 min, student 29 min (joined 6:31pm)" under a lesson that was on
 * Zoom and has started. Nothing for classroom lessons, future lessons, or
 * before the saved rows have loaded.
 */
export function ZoomAttendanceLine({
    lesson,
    views,
    now,
}: {
    lesson: { id: string; date: string; time: string; zoom_meeting_id?: string | null }
    views: Record<string, AttendanceView> | null
    now?: Date
}) {
    if (!views || !showsAttendance(lesson, now)) return null
    const line = attendanceLine(views[lesson.id])
    return (
        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title={line.title ?? undefined}>
            <Video className="h-3 w-3 shrink-0" />
            <span>{line.text}</span>
        </p>
    )
}
