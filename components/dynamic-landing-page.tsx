"use client"

import { useEffect, useRef } from "react"

interface DynamicLandingPageProps {
    html: string
    script: string
}

export function DynamicLandingPage({ html, script }: DynamicLandingPageProps) {
    const scriptExecuted = useRef(false)

    useEffect(() => {
        // Execute scripts only once after mount
        if (script && !scriptExecuted.current) {
            scriptExecuted.current = true
            try {
                // Create and execute script
                const scriptEl = document.createElement('script')
                scriptEl.textContent = script
                document.body.appendChild(scriptEl)

                // Cleanup on unmount
                return () => {
                    if (scriptEl.parentNode) {
                        scriptEl.parentNode.removeChild(scriptEl)
                    }
                }
            } catch (error) {
                console.error('Script execution error:', error)
            }
        }
    }, [script])

    return (
        <div
            className="dynamic-landing-page"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}
