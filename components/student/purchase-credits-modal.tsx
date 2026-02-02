"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Check, CreditCard, Repeat, Loader2, Sparkles } from "lucide-react"
import { createCheckoutSession } from "@/app/actions/stripe"
import { getStudentPricingPlan, type PricingPoint, type PricingPlan } from "@/app/actions/pricing"
import { useToast } from "@/hooks/use-toast"

interface PurchaseCreditsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PurchaseCreditsModal({ open, onOpenChange }: PurchaseCreditsModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<PricingPlan | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (open) {
      setLoading(true)
      getStudentPricingPlan().then(({ plan }) => {
        setPlan(plan)
        // Select the first subscription option by default, or the first option
        if (plan?.points?.length) {
          const defaultOption = plan.points.find((p: PricingPoint) => p.type === 'subscription') || plan.points[0]
          setSelectedPointId(defaultOption.id)
        }
        setLoading(false)
      })
    }
  }, [open])

  const handleCheckout = async () => {
    if (!selectedPointId) return
    setIsProcessing(true)

    const result = await createCheckoutSession(selectedPointId)

    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error })
      setIsProcessing(false)
    } else if (result.url) {
      window.location.href = result.url
    }
  }

  const selectedPoint = plan?.points?.find(p => p.id === selectedPointId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Purchase Credits</DialogTitle>
          <DialogDescription>
            {plan?.name ? `Plan: ${plan.name}` : "Select a package"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : !plan || !plan.points?.length ? (
          <div className="py-8 text-center text-muted-foreground">No pricing options available. Please contact your teacher.</div>
        ) : (
          <div className="space-y-3 py-4">
            {plan.points.map((point) => (
              <button
                key={point.id}
                onClick={() => setSelectedPointId(point.id)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all relative overflow-hidden ${selectedPointId === point.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
              >
                {point.type === 'subscription' && (
                  <div className="absolute top-0 right-0 bg-green-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                    AUTOPAY
                  </div>
                )}

                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-lg flex items-center gap-2">
                      {point.label}
                      {point.type === 'subscription' && <Repeat className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {point.description || `${point.credits} Credits`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold">${(point.price / 100).toFixed(0)}</span>
                    {point.type === 'subscription' && <span className="text-xs text-muted-foreground block">/mo</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="border-t pt-4">
          <Button className="w-full" size="lg" onClick={handleCheckout} disabled={isProcessing || !selectedPointId}>
            {isProcessing ? <Loader2 className="animate-spin mr-2" /> : (
              selectedPoint?.type === 'subscription' ? "Start Subscription" : "Checkout"
            )}
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-3">
            {selectedPoint?.type === 'subscription'
              ? "Recurring monthly charge. Cancel anytime."
              : "Secure payment via Stripe"
            }
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
