"use client"

import { useEffect, useState } from "react"

interface LocalTimestampProps {
    date: string
}

export function LocalTimestamp({ date }: LocalTimestampProps) {
    const [localTime, setLocalTime] = useState<string>("")

    useEffect(() => {
        setLocalTime(new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        }))
    }, [date])

    if (!localTime) {
        // Render a placeholder or the server time with a specific style to indicate loading?
        // Or just render nothing / skeleton to avoid flicker. 
        // Rendering UTC time might be confusing if it flips. 
        // Let's render a simple formatted UTC or "..." to keep layout stable.
        return <span className="opacity-50">...</span>
    }

    return <span>{localTime}</span>
}
