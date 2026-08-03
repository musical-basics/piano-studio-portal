"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { StudentRoster, LessonWithStudent } from "@/types/admin"

// Row shape from recurring_lesson_slots (fetched server-side in app/admin/page.tsx
// via the service-role client, since RLS only lets students read their own rows).
export interface RecurringSlotRow {
    student_id: string
    day_of_week: string
    time: string
    duration: number
}

interface WeeklyScheduleTabProps {
    students: StudentRoster[]
    recurringSlots: RecurringSlotRow[]
    scheduledLessons: LessonWithStudent[]
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const HOUR_PX = 64
const MIN_GAP_MINUTES = 30

// Per-student block colors, assigned stably by hashing the student id.
// `border` is the solid left accent for standing slots; `borderFull` is the
// dashed full border used for inferred slots (kept as separate literal classes
// so Tailwind never has to resolve shorthand vs longhand border colors).
const PALETTE = [
    { border: "border-l-blue-500", borderFull: "border-blue-500/60", bg: "bg-blue-500/15", text: "text-blue-800 dark:text-blue-200" },
    { border: "border-l-emerald-500", borderFull: "border-emerald-500/60", bg: "bg-emerald-500/15", text: "text-emerald-800 dark:text-emerald-200" },
    { border: "border-l-violet-500", borderFull: "border-violet-500/60", bg: "bg-violet-500/15", text: "text-violet-800 dark:text-violet-200" },
    { border: "border-l-amber-500", borderFull: "border-amber-500/60", bg: "bg-amber-500/15", text: "text-amber-800 dark:text-amber-200" },
    { border: "border-l-rose-500", borderFull: "border-rose-500/60", bg: "bg-rose-500/15", text: "text-rose-800 dark:text-rose-200" },
    { border: "border-l-cyan-500", borderFull: "border-cyan-500/60", bg: "bg-cyan-500/15", text: "text-cyan-800 dark:text-cyan-200" },
    { border: "border-l-orange-500", borderFull: "border-orange-500/60", bg: "bg-orange-500/15", text: "text-orange-800 dark:text-orange-200" },
    { border: "border-l-teal-500", borderFull: "border-teal-500/60", bg: "bg-teal-500/15", text: "text-teal-800 dark:text-teal-200" },
    { border: "border-l-fuchsia-500", borderFull: "border-fuchsia-500/60", bg: "bg-fuchsia-500/15", text: "text-fuchsia-800 dark:text-fuchsia-200" },
    { border: "border-l-indigo-500", borderFull: "border-indigo-500/60", bg: "bg-indigo-500/15", text: "text-indigo-800 dark:text-indigo-200" },
]

function colorFor(studentId: string) {
    let hash = 0
    for (let i = 0; i < studentId.length; i++) {
        hash = (hash * 31 + studentId.charCodeAt(i)) >>> 0
    }
    return PALETTE[hash % PALETTE.length]
}

// Accepts 'HH:MM' or 'HH:MM:SS' (TIME columns come back with seconds).
function toMinutes(time: string | null | undefined): number | null {
    if (!time) return null
    const match = time.match(/^(\d{1,2}):(\d{2})/)
    if (!match) return null
    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    if (hours > 23 || minutes > 59) return null
    return hours * 60 + minutes
}

function formatTime(totalMinutes: number): string {
    const h24 = Math.floor(totalMinutes / 60) % 24
    const m = totalMinutes % 60
    const period = h24 >= 12 ? "PM" : "AM"
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

// Compact form without AM/PM for inside small blocks.
function formatTimeShort(totalMinutes: number): string {
    const h24 = Math.floor(totalMinutes / 60) % 24
    const m = totalMinutes % 60
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return `${h12}:${String(m).padStart(2, "0")}`
}

function normalizeDay(day: string | null | undefined): string | null {
    if (!day) return null
    const trimmed = day.trim().toLowerCase()
    return DAYS.find(d => d.toLowerCase() === trimmed) || null
}

interface WeeklySlot {
    studentId: string
    studentName: string
    day: string
    startMin: number
    endMin: number
    source: "standing" | "extra" | "inferred"
}

interface PositionedSlot extends WeeklySlot {
    col: number
    cols: number
    hasOverlap: boolean
}

// Greedy column assignment for overlapping slots within one day (calendar-style
// side-by-side layout). Overlaps mean a double booking, so they are also flagged.
function layoutDay(slots: WeeklySlot[]): PositionedSlot[] {
    const sorted = [...slots].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
    const colEnds: number[] = []
    const placed: PositionedSlot[] = []
    let clusterStart = 0
    let clusterEnd = -1

    const closeCluster = (from: number, to: number) => {
        const cols = Math.max(...placed.slice(from, to).map(p => p.col)) + 1
        for (let i = from; i < to; i++) placed[i].cols = cols
    }

    for (const slot of sorted) {
        if (slot.startMin >= clusterEnd && placed.length > 0) {
            closeCluster(clusterStart, placed.length)
            clusterStart = placed.length
            colEnds.length = 0
        }
        let col = colEnds.findIndex(end => end <= slot.startMin)
        if (col === -1) {
            col = colEnds.length
            colEnds.push(slot.endMin)
        } else {
            colEnds[col] = slot.endMin
        }
        clusterEnd = Math.max(clusterEnd, slot.endMin)
        placed.push({ ...slot, col, cols: 1, hasOverlap: false })
    }
    if (placed.length > 0) closeCluster(clusterStart, placed.length)

    for (const slot of placed) {
        slot.hasOverlap = placed.some(
            other => other !== slot && other.startMin < slot.endMin && slot.startMin < other.endMin
        )
    }
    return placed
}

function computeGaps(daySlots: WeeklySlot[], windowStart: number, windowEnd: number): Array<[number, number]> {
    const intervals = daySlots
        .map(s => [s.startMin, s.endMin] as [number, number])
        .sort((a, b) => a[0] - b[0])
    const gaps: Array<[number, number]> = []
    let cursor = windowStart
    for (const [start, end] of intervals) {
        if (start > cursor) gaps.push([cursor, Math.min(start, windowEnd)])
        cursor = Math.max(cursor, end)
    }
    if (cursor < windowEnd) gaps.push([cursor, windowEnd])
    return gaps.filter(([a, b]) => b - a >= MIN_GAP_MINUTES)
}

export function WeeklyScheduleTab({ students, recurringSlots, scheduledLessons }: WeeklyScheduleTabProps) {
    const { slotsByDay, unslotted, hasInferred, windowStartHour, windowEndHour, totalSlots, totalMinutes, activeCount } =
        useMemo(() => {
            const activeStudents = students.filter(s => !s.status || s.status === "active")
            const activeById = new Map(activeStudents.map(s => [s.id, s]))

            const slots: WeeklySlot[] = []
            const seen = new Set<string>()
            const push = (slot: WeeklySlot) => {
                const key = `${slot.studentId}|${slot.day}|${slot.startMin}`
                if (seen.has(key)) return
                seen.add(key)
                slots.push(slot)
            }

            for (const student of activeStudents) {
                const day = normalizeDay(student.lesson_day)
                const startMin = toMinutes(student.lesson_time)
                if (day && startMin !== null) {
                    push({
                        studentId: student.id,
                        studentName: student.name || student.email || "Unnamed",
                        day,
                        startMin,
                        endMin: startMin + (student.lesson_duration || 30),
                        source: "standing",
                    })
                }
            }

            for (const row of recurringSlots) {
                const student = activeById.get(row.student_id)
                const day = normalizeDay(row.day_of_week)
                const startMin = toMinutes(row.time)
                if (!student || !day || startMin === null) continue
                push({
                    studentId: student.id,
                    studentName: student.name || student.email || "Unnamed",
                    day,
                    startMin,
                    endMin: startMin + (row.duration || 30),
                    source: "extra",
                })
            }

            // Students with no standing slot at all: infer their weekly time from
            // upcoming scheduled lessons so they still occupy the grid.
            const slottedIds = new Set(slots.map(s => s.studentId))
            const now = new Date()
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
            for (const lesson of scheduledLessons) {
                if (lesson.date < todayStr) continue
                if (slottedIds.has(lesson.student_id)) continue
                const student = activeById.get(lesson.student_id)
                if (!student) continue
                const startMin = toMinutes(lesson.time)
                if (startMin === null) continue
                const day = DAYS[new Date(`${lesson.date}T00:00:00`).getDay()]
                push({
                    studentId: student.id,
                    studentName: student.name || student.email || "Unnamed",
                    day,
                    startMin,
                    endMin: startMin + (lesson.duration || 30),
                    source: "inferred",
                })
            }

            const slotsByDay = new Map<string, WeeklySlot[]>(DAYS.map(d => [d, []]))
            for (const slot of slots) slotsByDay.get(slot.day)!.push(slot)

            const coveredIds = new Set(slots.map(s => s.studentId))
            const unslotted = activeStudents.filter(s => !coveredIds.has(s.id))

            let windowStartHour = 9
            let windowEndHour = 20
            if (slots.length > 0) {
                windowStartHour = Math.floor(Math.min(...slots.map(s => s.startMin)) / 60)
                windowEndHour = Math.ceil(Math.max(...slots.map(s => s.endMin)) / 60)
                if (windowEndHour <= windowStartHour) windowEndHour = windowStartHour + 1
            }

            return {
                slotsByDay,
                unslotted,
                hasInferred: slots.some(s => s.source === "inferred"),
                windowStartHour,
                windowEndHour,
                totalSlots: slots.length,
                totalMinutes: slots.reduce((sum, s) => sum + (s.endMin - s.startMin), 0),
                activeCount: activeStudents.length,
            }
        }, [students, recurringSlots, scheduledLessons])

    const windowStart = windowStartHour * 60
    const windowEnd = windowEndHour * 60
    const totalPx = (windowEndHour - windowStartHour) * HOUR_PX
    const hours = Array.from({ length: windowEndHour - windowStartHour }, (_, i) => windowStartHour + i)
    const gridTemplate = { gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl font-serif">Weekly Schedule</CardTitle>
                <CardDescription>
                    Standing weekly slots for active students. Gaps in the grid (and the open times listed under each
                    day) are where a new student can fit.
                    {hasInferred && " Dashed blocks have no standing slot set and are inferred from upcoming lessons."}
                </CardDescription>
                <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="secondary">{activeCount} active students</Badge>
                    <Badge variant="secondary">{totalSlots} weekly lessons</Badge>
                    <Badge variant="secondary">{(totalMinutes / 60).toFixed(1).replace(/\.0$/, "")}h / week</Badge>
                </div>
            </CardHeader>
            <CardContent>
                {totalSlots === 0 ? (
                    <p className="text-muted-foreground text-center py-12">
                        No weekly slots yet. Set a lesson day and time on students in the roster to see them here.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[880px]">
                            {/* Day headers */}
                            <div className="grid border-b" style={gridTemplate}>
                                <div />
                                {DAYS.map(day => {
                                    const count = slotsByDay.get(day)!.length
                                    return (
                                        <div key={day} className="px-2 py-2 text-center border-l">
                                            <div className="text-sm font-medium">{day.slice(0, 3)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {count > 0 ? `${count} lesson${count === 1 ? "" : "s"}` : "open"}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Time grid */}
                            <div className="grid" style={gridTemplate}>
                                <div className="relative" style={{ height: totalPx }}>
                                    {hours.map(h => (
                                        <div
                                            key={h}
                                            className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground"
                                            style={{ top: (h - windowStartHour) * HOUR_PX }}
                                        >
                                            {h % 12 === 0 ? 12 : h % 12} {h >= 12 ? "PM" : "AM"}
                                        </div>
                                    ))}
                                </div>
                                {DAYS.map(day => {
                                    const positioned = layoutDay(slotsByDay.get(day)!)
                                    return (
                                        <div key={day} className="relative border-l" style={{ height: totalPx }}>
                                            {hours.map(h => (
                                                <div
                                                    key={h}
                                                    className="absolute inset-x-0 border-t border-border/60"
                                                    style={{ top: (h - windowStartHour) * HOUR_PX }}
                                                />
                                            ))}
                                            {positioned.map((slot, i) => {
                                                const color = colorFor(slot.studentId)
                                                const top = ((slot.startMin - windowStart) / 60) * HOUR_PX
                                                const height = Math.max(((slot.endMin - slot.startMin) / 60) * HOUR_PX, 18)
                                                const width = 100 / slot.cols
                                                const duration = slot.endMin - slot.startMin
                                                const tooltip = [
                                                    slot.studentName,
                                                    `${day} ${formatTime(slot.startMin)} - ${formatTime(slot.endMin)} (${duration} min)`,
                                                    slot.source === "extra" ? "Additional weekly day" : "",
                                                    slot.source === "inferred" ? "Inferred from upcoming lessons (no standing slot set)" : "",
                                                    slot.hasOverlap ? "WARNING: overlaps another lesson" : "",
                                                ].filter(Boolean).join("\n")
                                                return (
                                                    <div
                                                        key={`${slot.studentId}-${slot.startMin}-${i}`}
                                                        title={tooltip}
                                                        className={`absolute overflow-hidden rounded-md px-1.5 py-0.5 cursor-default ${color.bg} ${color.text} ${
                                                            slot.source === "inferred"
                                                                ? `border-2 border-dashed ${color.borderFull}`
                                                                : `border-l-2 ${color.border}`
                                                        } ${slot.hasOverlap ? "ring-2 ring-destructive" : ""}`}
                                                        style={{
                                                            top,
                                                            height: height - 2,
                                                            left: `${slot.col * width}%`,
                                                            width: `calc(${width}% - 3px)`,
                                                        }}
                                                    >
                                                        {height >= 44 ? (
                                                            <>
                                                                <div className="text-xs font-medium truncate leading-tight">{slot.studentName}</div>
                                                                <div className="text-[10px] opacity-80 truncate leading-tight">
                                                                    {formatTimeShort(slot.startMin)} - {formatTime(slot.endMin)}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="text-[11px] font-medium truncate leading-tight">
                                                                {formatTimeShort(slot.startMin)} {slot.studentName}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Open times per day */}
                            <div className="grid border-t mt-0" style={gridTemplate}>
                                <div className="py-3 pr-2 text-right text-[11px] font-medium text-muted-foreground">Open</div>
                                {DAYS.map(day => {
                                    const daySlots = slotsByDay.get(day)!
                                    const gaps = computeGaps(daySlots, windowStart, windowEnd)
                                    return (
                                        <div key={day} className="border-l px-1.5 py-3 flex flex-col items-stretch gap-1">
                                            {daySlots.length === 0 ? (
                                                <Badge variant="outline" className="justify-center text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-normal">
                                                    All day
                                                </Badge>
                                            ) : gaps.length === 0 ? (
                                                <span className="text-center text-[11px] text-muted-foreground">Full</span>
                                            ) : (
                                                gaps.map(([start, end]) => (
                                                    <Badge
                                                        key={start}
                                                        variant="outline"
                                                        className="justify-center whitespace-nowrap text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-normal"
                                                    >
                                                        {formatTimeShort(start)} - {formatTime(end)}
                                                    </Badge>
                                                ))
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {unslotted.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                        <p className="text-sm font-medium mb-2">
                            Active students with no weekly slot ({unslotted.length})
                        </p>
                        <p className="text-xs text-muted-foreground mb-3">
                            No lesson day/time set on their profile and no upcoming scheduled lessons.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {unslotted.map(s => (
                                <Badge key={s.id} variant="outline">{s.name || s.email || "Unnamed"}</Badge>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
