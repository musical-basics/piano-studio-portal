"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import {
    finishAutoRefillCheckout,
    turnOffMyAutoRefill,
    updateAutoRefillCard,
    type AutoRefillSettings,
} from "@/app/actions/auto-refill"
import { autoRefillWording, priceWords } from "@/lib/auto-refill"
import { STUDIO_TZ } from "@/lib/studio-timezone"

function day(iso: string | null): string | null {
    if (!iso) return null
    return new Date(iso).toLocaleDateString("en-US", { timeZone: STUDIO_TZ, weekday: "short", month: "short", day: "numeric" })
}

function cardWords(brand: string | null, last4: string | null): string {
    if (!last4) return "your saved card"
    const b = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card"
    return `${b} ending ${last4}`
}

/**
 * Auto-refill in Settings (#1477): on or off, the card it uses, turn it off,
 * and update the card (after a decline that also pays the waiting refill).
 * Shown only to families who have turned it on at some point. Coming back
 * from Stripe (?refill_checkout=...) finishes the checkout here too, in case
 * the webhook is slower than the family.
 */
export function AutoRefillSettingsCard({ settings, returnedSession }: { settings: AutoRefillSettings; returnedSession: string | null }) {
    const router = useRouter()
    const { toast } = useToast()
    const [busy, setBusy] = useState<null | "off" | "card" | "finish">(returnedSession ? "finish" : null)
    const [confirmOff, setConfirmOff] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const finished = useRef(false)

    useEffect(() => {
        if (!returnedSession || finished.current) return
        finished.current = true
        finishAutoRefillCheckout(returnedSession).then(res => {
            setBusy(null)
            setMessage(res.message)
            toast({ variant: res.ok ? "default" : "destructive", title: res.ok ? "Auto-refill" : "Auto-refill", description: res.message })
            // Drop ?refill_checkout from the address so a refresh doesn't run it again (it would do nothing anyway).
            router.replace("/student/settings#auto-refill")
            router.refresh()
        })
    }, [returnedSession, router, toast])

    const plan = settings.plan
    if (!plan) {
        // Back from turning it on, before the plan is saved: finish it here.
        if (!returnedSession) return null
        return (
            <Card id="auto-refill" data-testid="auto-refill-card">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Auto-refill</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                    {busy === "finish"
                        ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Finishing your checkout...</p>
                        : <p>{message}</p>}
                </CardContent>
            </Card>
        )
    }
    const wording = autoRefillWording(plan.credits, plan.priceCents)
    const declined = settings.waiting?.status === "failed"
    const on = plan.status === "on"

    async function turnOff() {
        setBusy("off")
        const res = await turnOffMyAutoRefill()
        setBusy(null)
        setConfirmOff(false)
        setMessage(res.message)
        toast({ variant: res.ok ? "default" : "destructive", title: "Auto-refill", description: res.message })
        router.refresh()
    }

    async function updateCard() {
        setBusy("card")
        const res = await updateAutoRefillCard()
        if (res.url) {
            window.location.href = res.url
            return
        }
        setBusy(null)
        toast({ variant: "destructive", title: "Auto-refill", description: res.error ?? "Something went wrong." })
    }

    return (
        <Card id="auto-refill" data-testid="auto-refill-card" className="scroll-mt-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Auto-refill
                </CardTitle>
                <CardDescription>{wording.full}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                {busy === "finish" && (
                    <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Finishing your checkout...</p>
                )}
                {on ? (
                    <p data-testid="auto-refill-status">
                        <span className="font-medium">On</span> since {day(plan.startedAt)}: {plan.credits} lessons for {priceWords(plan.priceCents)}, charged to {cardWords(plan.cardBrand, plan.cardLast4)} only when your lessons run out.
                    </p>
                ) : (
                    <p data-testid="auto-refill-status">
                        <span className="font-medium">Off</span>{plan.stoppedAt ? ` since ${day(plan.stoppedAt)}` : ""}. Your card is not charged when your lessons run out. You can turn it on again from Purchase Credits on your dashboard.
                    </p>
                )}
                {on && settings.monthlyEndsAt && (
                    <p className="text-muted-foreground">Your monthly plan stops on {day(settings.monthlyEndsAt)}, so you&apos;re never charged both ways.</p>
                )}
                {on && declined && (
                    <div className="rounded-md bg-red-50 p-3 text-red-900 dark:bg-red-950/40 dark:text-red-200" data-testid="auto-refill-declined">
                        Your last refill didn&apos;t go through, so those {plan.credits} lessons are still waiting to be paid. Your lessons keep going as usual.
                        {settings.waiting?.nextRetryAt ? ` We'll try your card again on ${day(settings.waiting.nextRetryAt)}, or update it now to pay straight away.` : " Please update your card to pay."}
                    </div>
                )}
                {on && settings.waiting && settings.waiting.status !== "failed" && (
                    <p className="text-muted-foreground">Your lessons ran out, so your next {plan.credits} are being added now.</p>
                )}
                {message && busy !== "finish" && <p className="text-muted-foreground">{message}</p>}

                {on && (
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={updateCard} disabled={busy !== null || settings.preview} variant={declined ? "default" : "outline"}>
                            {busy === "card" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                            {declined ? "Update my card and pay" : "Update card"}
                        </Button>
                        {!confirmOff ? (
                            <Button variant="ghost" onClick={() => setConfirmOff(true)} disabled={busy !== null}>Turn off auto-refill</Button>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                                <span>Turn it off? Your card won&apos;t be charged when your lessons run out.</span>
                                <Button size="sm" variant="destructive" onClick={turnOff} disabled={busy !== null} data-testid="auto-refill-confirm-off">
                                    {busy === "off" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Turn off"}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)} disabled={busy !== null}>Keep it on</Button>
                            </div>
                        )}
                    </div>
                )}
                {settings.preview && <p className="text-xs text-muted-foreground">Preview: the card buttons are the family&apos;s; turning it off here works and is recorded as you.</p>}
            </CardContent>
        </Card>
    )
}
