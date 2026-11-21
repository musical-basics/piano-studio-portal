"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { createCheckoutSession, getSubscriptionSummary } from "@/app/actions/stripe"
import { getStudentPricingPlan, type PricingPoint, type PricingPlan } from "@/app/actions/pricing"
import { getAutoRefillOffer, startAutoRefill } from "@/app/actions/auto-refill"
import { priceWords, type AutoRefillOffer } from "@/lib/auto-refill"
import { trackRollout } from "@/lib/rollout-track"
import { STUDIO_TZ } from "@/lib/studio-timezone"
import { useToast } from "@/hooks/use-toast"

interface PurchaseCreditsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The auto-refill option's id in the list (#1477); pricing points have uuids. */
const AUTO_REFILL = "auto-refill"

function endDay(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("en-US", { timeZone: STUDIO_TZ, month: "short", day: "numeric" })
}

/** The small line under the approved wording: what happens today. */
function todayLine(offer: Extract<AutoRefillOffer, { show: true }>): string {
  if (offer.mode === "buy") return `You're out of lessons, so your first ${offer.credits} are added today.`
  if (offer.mode === "save") return "Nothing is charged today: you still have lessons left."
  const ends = endDay(offer.subscriptionEndsAt)
  return `Nothing is charged today. Your monthly plan stops after the month you've paid for${ends ? ` (${ends})` : ""}, so you're never charged both ways.`
}

export function PurchaseCreditsModal({ open, onOpenChange }: PurchaseCreditsModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<PricingPlan | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  // A running subscription makes every subscription option unbuyable, because
  // createCheckoutSession refuses to sell a second one. Track it so we neither
  // preselect nor offer an option that can only come back as an error.
  const [hasSubscription, setHasSubscription] = useState(false)
  // Auto-refill (#1477, protocol 1.20 half split): offered next to the monthly
  // plan to families in the new half; when it is on, the monthly plan can't be
  // bought on top of it.
  const [offer, setOffer] = useState<AutoRefillOffer | null>(null)

  useEffect(() => {
    if (open) {
      setLoading(true)
      trackRollout("auto_refill", "opened", { once: true })
      Promise.all([
        getStudentPricingPlan(),
        // On failure fall through as "no subscription": the checkout guard is
        // still there, so the worst case is the old error, not a double charge.
        getSubscriptionSummary().catch(() => null),
        getAutoRefillOffer().catch(() => null),
      ]).then(([{ plan }, summary, refill]) => {
        setPlan(plan)
        const subscribed = summary?.active === true
        setHasSubscription(subscribed)
        setOffer(refill)
        if (refill?.show) trackRollout("auto_refill", "offered", { once: true })
        const refillOn = refill?.show === false && refill.on === true

        if (plan?.points?.length) {
          const buyable = plan.points.filter((p: PricingPoint) => !((subscribed || refillOn) && p.type === 'subscription'))
          // Subscriptions are still the preferred default when one is allowed.
          const defaultOption = buyable.find((p: PricingPoint) => p.type === 'subscription') || buyable[0]
          setSelectedPointId(defaultOption?.id ?? (refill?.show ? AUTO_REFILL : null))
        } else if (refill?.show) {
          setSelectedPointId(AUTO_REFILL)
        }
        setLoading(false)
      })
    }
  }, [open])

  const handleCheckout = async () => {
    if (!selectedPointId) return
    setIsProcessing(true)

    const result = selectedPointId === AUTO_REFILL ? await startAutoRefill() : await createCheckoutSession(selectedPointId)

    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error })
      setIsProcessing(false)
    } else if (result.url) {
      window.location.href = result.url
    }
  }

  const selectedPoint = plan?.points?.find(p => p.id === selectedPointId)
  const refillOffer = offer?.show ? offer : null
  const refillOn = offer?.show === false && offer.on === true

  const autoRefillOption = refillOffer && (
    <div key={AUTO_REFILL} className="relative" data-testid="auto-refill-option">
      <div className="absolute -top-2.5 left-4 bg-blue-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full z-10 border border-white shadow-sm">
        New
      </div>
      <button
        onClick={() => setSelectedPointId(AUTO_REFILL)}
        className={`w-full text-left p-4 rounded-lg border-2 transition-all relative overflow-hidden ${selectedPointId === AUTO_REFILL
          ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30"
          : "border-blue-200 hover:border-blue-600 dark:border-blue-900"
          }`}
      >
        <div className="flex justify-between items-start gap-3">
          <div>
            <div className="font-semibold text-lg">{refillOffer.title}</div>
            <p className="text-sm text-muted-foreground">{refillOffer.body}</p>
            <p className="text-xs text-muted-foreground mt-1.5">{todayLine(refillOffer)}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xl font-bold">{priceWords(refillOffer.priceCents)}</span>
            <span className="text-xs text-muted-foreground block">per {refillOffer.credits} lessons</span>
          </div>
        </div>
      </button>
    </div>
  )

  // Auto-refill sits right after the monthly plan, side by side with it.
  const points = plan?.points ?? []
  const lastSubscription = points.map(p => p.type).lastIndexOf('subscription')
  const insertAt = lastSubscription >= 0 ? lastSubscription + 1 : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Purchase Credits</DialogTitle>
          <DialogDescription>
            {plan?.name ? `Plan: ${plan.name}` : "Select a package"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : (!plan || !plan.points?.length) && !refillOffer ? (
          <div className="py-8 text-center text-muted-foreground">No pricing options available. Please contact your teacher.</div>
        ) : (
          <div className="space-y-3 py-4">
            {refillOn && (
              <p className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-sm" data-testid="auto-refill-on-note">
                You&apos;re on auto-refill: your card is charged only when your lessons run out. You can still buy extra lessons here.{" "}
                <Link href="/student/settings#auto-refill" className="underline underline-offset-2">Manage it in Settings</Link>.
              </p>
            )}
            {points.flatMap((point, i) => {
              // Already subscribed (or on auto-refill): this option cannot be
              // purchased, so show it as settled rather than a dead end.
              const alreadyOnIt = hasSubscription && point.type === 'subscription'
              const blockedByRefill = !alreadyOnIt && refillOn && point.type === 'subscription'
              const unavailable = alreadyOnIt || blockedByRefill
              return [
              ...(i === insertAt && autoRefillOption ? [autoRefillOption] : []),
              <div key={point.id} className="relative">
                {point.type === 'subscription' && !unavailable && (
                  <div className="absolute -top-2.5 left-4 bg-green-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full z-10 border border-white shadow-sm">
                    Recommended
                  </div>
                )}
                {alreadyOnIt && (
                  <div className="absolute -top-2.5 left-4 bg-muted text-muted-foreground text-[10px] uppercase font-bold px-2 py-0.5 rounded-full z-10 border shadow-sm">
                    Your current plan
                  </div>
                )}
                <button
                  onClick={() => setSelectedPointId(point.id)}
                  disabled={unavailable}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all relative overflow-hidden ${unavailable
                    ? "border-border bg-muted/30 opacity-70 cursor-default"
                    : selectedPointId === point.id
                      ? (point.type === 'subscription' ? "border-green-600 bg-green-50/50" : "border-primary bg-primary/5")
                      : (point.type === 'subscription' ? "border-green-200 hover:border-green-600" : "border-border hover:border-primary/50")
                    }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-lg flex flex-wrap items-center gap-2">
                        {point.label}
                        {point.type === 'subscription' && !unavailable && (
                          <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                            Autopay
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {alreadyOnIt
                          ? "You are already on this plan, so it renews on its own. Message your teacher to change it."
                          : blockedByRefill
                            ? "You're on auto-refill instead. Turn auto-refill off in Settings to switch to the monthly plan."
                            : (point.description || `${point.credits} Credits`)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-bold">${(point.price / 100).toFixed(0)}</span>
                      {point.type === 'subscription' && <span className="text-xs text-muted-foreground block">/mo</span>}
                    </div>
                  </div>
                </button>
              </div>,
              ]
            })}
            {insertAt >= points.length && autoRefillOption}

            {!selectedPointId && (
              <p className="text-sm text-center text-muted-foreground pt-1">
                Your plan has no extra options to buy right now. Message your teacher if you need more lessons.
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Your tuition includes:</span> weekly Zoom lessons, weekly assignments, lesson recordings, course material, and written questions/answers to your teacher.
        </div>

        <div className="border-t pt-4">
          <Button className="w-full" size="lg" onClick={handleCheckout} disabled={isProcessing || !selectedPointId}>
            {isProcessing ? <Loader2 className="animate-spin mr-2" /> : (
              selectedPointId === AUTO_REFILL
                ? (refillOffer?.mode === "buy" ? "Start auto-refill" : "Save my card for auto-refill")
                : selectedPoint?.type === 'subscription' ? "Start Subscription" : "Checkout"
            )}
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-3">
            Purchased Lesson Credits Never Expire.
          </p>
        </div>
      </DialogContent>
    </Dialog >
  )
}
