"use client"

import { useEffect, useState } from "react"
import { STUDIO_TZ, studioTzAbbr, studioWallClockToISO } from "@/lib/studio-timezone"

interface LocalTimeDisplayProps {
    date: string // "YYYY-MM-DD"
    time: string // "HH:MM" (24h format from DB)
    duration?: number
}

export function LocalTimeDisplay({ date, time }: LocalTimeDisplayProps) {
    const [localTimeStr, setLocalTimeStr] = useState<string | null>(null)

    // Tolerate both "HH:MM" and "HH:MM:SS" (Postgres TIME comes back with seconds).
    const [h = '0', m = '00'] = (time || '').split(':')
    const hours = parseInt(h)
    const minutes = m.padStart(2, '0')

    useEffect(() => {
        if (!time) return
        // Someone already in the studio's zone doesn't need it twice.
        const userZone = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (userZone === STUDIO_TZ) return
        try {
            // The real moment of the lesson (studio wall-clock, daylight time included),
            // shown in the viewer's own zone.
            const instant = new Date(studioWallClockToISO(date, `${String(hours).padStart(2, '0')}:${minutes}`))
            setLocalTimeStr(instant.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }))
        } catch (e) {
            console.error("Time conversion error:", e)
        }
    }, [date, time, hours, minutes])

    if (!time) return <span className="font-medium text-foreground">TBD</span>

    // Studio time first, rendered the same on server and client.
    const suffix = hours >= 12 ? 'PM' : 'AM'
    const studioTimeStr = `${hours % 12 || 12}:${minutes} ${suffix} ${studioTzAbbr(date)}`

    return (
        <div className="flex flex-col items-start justify-center h-full">
            <span className="font-medium text-foreground">{studioTimeStr}</span>
            {localTimeStr && (
                <span className="text-xs text-muted-foreground font-medium">
                    ({localTimeStr})
                </span>
            )}
        </div>
    )
}
