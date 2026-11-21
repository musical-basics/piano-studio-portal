"use client"

/**
 * "Put the portal on your home screen" (#1081). A small card on a phone:
 *  - iPhone/iPad: Safari has no install button a page can press, so it says
 *    how (Share, then Add to Home Screen).
 *  - Android: a real Install button once Chrome offers it (beforeinstallprompt,
 *    which needs a tap and about 30 seconds on the page); until then, where to
 *    find it in the browser menu.
 * Hidden when the portal is already running from the home screen, on a
 * computer, and for good on this device once dismissed (localStorage, which
 * can be unavailable, so every read and write is guarded).
 */

import { useEffect, useState } from "react"
import { Share, Smartphone, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { trackRollout } from "@/lib/rollout-track"

const DISMISSED_KEY = "studio-install-hint-dismissed"

type InstallPromptEvent = Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type Platform = "ios" | "android" | null

function detectPlatform(): Platform {
    const ua = navigator.userAgent || ""
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios"
    // iPadOS Safari reports itself as a Mac; touch points give it away.
    if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) return "ios"
    if (/Android/i.test(ua)) return "android"
    return null
}

function runningInstalled(): boolean {
    try {
        if (window.matchMedia?.("(display-mode: standalone)").matches) return true
        if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true
    } catch {
        // older browsers without matchMedia display-mode support
    }
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function wasDismissed(): boolean {
    try {
        return window.localStorage.getItem(DISMISSED_KEY) === "1"
    } catch {
        return false
    }
}

// Chrome can offer the install before React has mounted this card, so the
// offer is caught as soon as this file loads and handed to the card. Only on
// Android with the tip still wanted: anywhere else Chrome's own bar is left alone.
let stashedPrompt: InstallPromptEvent | null = null
const promptListeners = new Set<(e: InstallPromptEvent) => void>()
if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e) => {
        if (detectPlatform() !== "android" || wasDismissed() || runningInstalled()) return
        e.preventDefault() // our Install button shows the same prompt
        stashedPrompt = e as InstallPromptEvent
        promptListeners.forEach(l => l(stashedPrompt as InstallPromptEvent))
    })
}

export function InstallAppHint() {
    const [platform, setPlatform] = useState<Platform>(null)
    const [visible, setVisible] = useState(false)
    const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)

    useEffect(() => {
        const p = detectPlatform()
        if (!p || runningInstalled() || wasDismissed()) return
        setPlatform(p)
        setVisible(true)
        trackRollout("install_tip", "shown", { once: true, idle: true })
        if (stashedPrompt) setInstallEvent(stashedPrompt)

        const onInstalled = () => setVisible(false)
        promptListeners.add(setInstallEvent)
        window.addEventListener("appinstalled", onInstalled)
        return () => {
            promptListeners.delete(setInstallEvent)
            window.removeEventListener("appinstalled", onInstalled)
        }
    }, [])

    const dismiss = () => {
        setVisible(false)
        trackRollout("install_tip", "dismissed")
        try {
            window.localStorage.setItem(DISMISSED_KEY, "1")
        } catch {
            // private mode or blocked storage: hidden for this visit only
        }
    }

    const install = async () => {
        if (!installEvent) return
        trackRollout("install_tip", "install_tapped")
        try {
            await installEvent.prompt()
            const choice = await installEvent.userChoice
            if (choice.outcome === "accepted") setVisible(false)
        } catch {
            // the prompt can only be shown once; fall back to the menu text
        }
        stashedPrompt = null
        setInstallEvent(null)
    }

    if (!visible || !platform) return null

    return (
        <Card className="border-dashed py-0" data-testid="install-app-hint">
            <CardContent className="flex items-start gap-3 p-4">
                <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Smartphone className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1 text-sm">
                    <p className="font-medium">Add the portal to your home screen</p>
                    {platform === "ios" ? (
                        <p className="text-muted-foreground">
                            Tap <Share className="inline h-4 w-4 -mt-1" aria-label="Share" /> Share, then
                            {" "}<span className="font-medium text-foreground">Add to Home Screen</span>. Lessons and messages are then one tap away.
                        </p>
                    ) : installEvent ? (
                        <p className="text-muted-foreground">Lessons and messages one tap away, full screen like an app.</p>
                    ) : (
                        <p className="text-muted-foreground">
                            Open the browser menu (the three dots), then tap
                            {" "}<span className="font-medium text-foreground">Install app</span> or
                            {" "}<span className="font-medium text-foreground">Add to Home screen</span>.
                        </p>
                    )}
                    {platform === "android" && installEvent && (
                        <Button size="sm" className="mt-2" onClick={install}>
                            Install
                        </Button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Hide this tip"
                    title="Hide this tip"
                >
                    <X className="h-4 w-4" />
                </button>
            </CardContent>
        </Card>
    )
}
