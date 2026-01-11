"use client"

import { useEffect, useState } from "react"

interface LocalTimeDisplayProps {
    date: string // "YYYY-MM-DD"
    time: string // "HH:MM" (24h format from DB)
    duration?: number
}

export function LocalTimeDisplay({ date, time }: LocalTimeDisplayProps) {
    const [localTimeStr, setLocalTimeStr] = useState<string | null>(null)

    // 1. Format the "Studio Time" (Hardcoded to PST per your requirement)
    // We do this simply to ensure the server and client render the exact same text initially
    // Check if time exists first
    if (!time) return <span className="font-medium text-foreground">TBD</span>

    const [h, m] = time.split(':')
    const hours = parseInt(h)
    const suffix = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12
    const studioTimeStr = `${hours12}:${m} ${suffix} PST`

    useEffect(() => {
        // 2. Detect User's Timezone
        const userZone = Intl.DateTimeFormat().resolvedOptions().timeZone

        // If they are in Pacific time, no need to show double
        if (userZone === "America/Los_Angeles") return

        try {
            // 3. Create a Date object for the lesson in PST
            // We append -08:00 for Standard PST. 
            // (Note: To handle Daylight Savings perfectly year-round, we'd use a library like 'date-fns-tz', 
            // but this native approach works for the immediate request).
            const lessonDate = new Date(`${date}T${time}:00-08:00`)

            // 4. Format to User's Local Time
            const userTimeStr = lessonDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short' // This gives us EST, CST, etc.
            })

            setLocalTimeStr(userTimeStr)
        } catch (e) {
            console.error("Time conversion error:", e)
        }
    }, [date, time])

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
