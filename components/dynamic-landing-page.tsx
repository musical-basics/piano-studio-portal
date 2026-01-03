"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { InquiryModal } from "@/components/inquiry-modal"

interface DynamicLandingPageProps {
    html: string
    script: string
}

export function DynamicLandingPage({ html, script }: DynamicLandingPageProps) {
    const scriptExecuted = useRef(false)
    const [showInquiryModal, setShowInquiryModal] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

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

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Check if the clicked element or its parent is a link to /contact
        const target = e.target as HTMLElement
        const link = target.closest('a')

        if (link) {
            const href = link.getAttribute('href')
            // Intercept internal /contact links (and also handle full URLs if needed)
            if (href === '/contact' || href?.endsWith('/contact')) {
                e.preventDefault()
                setShowInquiryModal(true)
            }
        }
    }

    return (
        <>
            <div
                className="dynamic-landing-page"
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={handleClick}
            />
            {/* Dialog handles its own portal automatically */}
            {mounted && (
                <InquiryModal open={showInquiryModal} onOpenChange={setShowInquiryModal} />
            )}
        </>
    )
}

