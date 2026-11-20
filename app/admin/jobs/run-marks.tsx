"use client"

import { useState } from "react"
import type { DayMark } from "@/lib/scheduled-jobs"

// A job's last 30 days (Lionel's #1077): one mark per studio day, oldest on
// the left. Green worked, red at least one run failed, grey no run. Hover or
// tap a mark to read that day below the row.

const COLOR: Record<DayMark["state"], string> = {
    ok: "bg-green-500",
    failed: "bg-red-500",
    none: "bg-gray-200 dark:bg-gray-700",
}

export function RunMarks({ marks }: { marks: DayMark[] }) {
    const [picked, setPicked] = useState<number | null>(null)
    const [hovered, setHovered] = useState<number | null>(null)
    const shown = hovered ?? picked
    const failedDays = marks.filter(m => m.state === "failed").length
    return (
        <div className="pt-1">
            <div className="flex max-w-sm gap-[2px]" aria-label={`Last ${marks.length} days`}>
                {marks.map((m, i) => (
                    <button
                        key={m.date}
                        type="button"
                        title={m.text}
                        aria-label={m.text}
                        aria-pressed={picked === i}
                        onClick={() => setPicked(picked === i ? null : i)}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        className={`h-5 min-w-0 flex-1 rounded-[2px] ${COLOR[m.state]} ${shown === i ? "ring-2 ring-foreground/60 ring-offset-1 ring-offset-background" : ""}`}
                    />
                ))}
            </div>
            <p className="mt-1 min-h-4 text-xs text-muted-foreground break-words">
                {shown !== null
                    ? marks[shown].text
                    : `Last ${marks.length} days${failedDays ? `: ${failedDays} with a failed run` : ""}. Tap a mark for that day.`}
            </p>
        </div>
    )
}
