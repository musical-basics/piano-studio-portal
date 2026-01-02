"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, CreditCard, Sparkles, Loader2, Repeat, Infinity } from "lucide-react"
import { createCheckoutSession } from "@/app/actions/stripe"
import { getCurrentUserPricing } from "@/app/actions/pricing"
import { useToast } from "@/hooks/use-toast"

interface PurchaseCreditsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Hardcoded subscription pricing map based on your rules
const SUBSCRIPTION_PRICES: Record<number, number> = {
  30: 160,
  45: 220,
  60: 280
}

export function PurchaseCreditsModal({ open, onOpenChange }: PurchaseCreditsModalProps) {
  const { toast } = useToast()

  // Track which option is selected: 'single', 'pack', or 'subscription'
  const [selectedOption, setSelectedOption] = useState<'single' | 'pack' | 'subscription'>('pack')

  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPricing, setIsLoadingPricing] = useState(true)
  const [lessonDuration, setLessonDuration] = useState<number>(30)
  const [pricing, setPricing] = useState<{ single_price: number; pack_price: number } | null>(null)

  useEffect(() => {
    if (open) {
      setIsLoadingPricing(true)
      getCurrentUserPricing().then(({ lessonDuration: duration, pricing: userPricing }) => {
        setLessonDuration(duration || 30)
        setPricing(userPricing)
        setIsLoadingPricing(false)
      })
    }
  }, [open])

  const handleCheckout = async () => {
    if (!pricing && selectedOption !== 'subscription') return

    setIsLoading(true)

    // Determine what we are sending to the server
    let purchaseType = selectedOption
    // If subscription, we rely on the server to pick the right Price ID based on lessonDuration

    const result = await createCheckoutSession(purchaseType, lessonDuration)

    if (result.error) {
      setIsLoading(false)
      toast({
        variant: "destructive",
        title: "Checkout Failed",
        description: result.error
      })
    } else if (result.url) {
      window.location.href = result.url
    }
  }

  const singlePrice = pricing?.single_price ? pricing.single_price / 100 : 0
  const packPrice = pricing?.pack_price ? pricing.pack_price / 100 : 0
  const subPrice = SUBSCRIPTION_PRICES[lessonDuration] || 0

  // Calculate savings
  const packSavings = (singlePrice * 4) - packPrice
  const subSavings = (singlePrice * 4) - subPrice

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Buy Lesson Credits</DialogTitle>
          <DialogDescription>
            Choose a package or subscribe for automatic renewals
          </DialogDescription>
        </DialogHeader>

        {isLoadingPricing ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-3 py-4">

              {/* Option 1: Monthly Autopay (Featured) */}
              <button
                onClick={() => setSelectedOption('subscription')}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all relative overflow-hidden ${selectedOption === 'subscription' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
              >
                {/* Banner for Best Value */}
                <div className="absolute top-0 right-0 bg-green-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                  AUTOPAY
                </div>

                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">Monthly Subscription</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      4 credits per month (auto-refill)
                    </p>
                    {subSavings > 0 && (
                      <p className="text-sm text-green-600 font-medium">
                        Best Value: Save ${subSavings.toFixed(0)}/mo
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-2xl font-bold block">${subPrice}</span>
                      <span className="text-xs text-muted-foreground">/ month</span>
                    </div>
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${selectedOption === 'subscription' ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                      {selectedOption === 'subscription' && <Check className="h-4 w-4 text-primary-foreground" />}
                    </div>
                  </div>
                </div>
              </button>

              {/* Option 2: 4-Pack */}
              <button
                onClick={() => setSelectedOption('pack')}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedOption === 'pack' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="font-semibold text-lg">4-Lesson Pack</span>
                    <p className="text-sm text-muted-foreground">One-time purchase</p>
                    {packSavings > 0 && (
                      <p className="text-sm text-green-600 font-medium">
                        Save ${packSavings.toFixed(0)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">${packPrice}</span>
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${selectedOption === 'pack' ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                      {selectedOption === 'pack' && <Check className="h-4 w-4 text-primary-foreground" />}
                    </div>
                  </div>
                </div>
              </button>

              {/* Option 3: Single */}
              <button
                onClick={() => setSelectedOption('single')}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedOption === 'single' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="font-semibold text-lg">Single Lesson</span>
                    <p className="text-sm text-muted-foreground">Pay as you go</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">${singlePrice}</span>
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${selectedOption === 'single' ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                      {selectedOption === 'single' && <Check className="h-4 w-4 text-primary-foreground" />}
                    </div>
                  </div>
                </div>
              </button>

            </div>

            {/* Credits Never Expire Notice */}
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground bg-muted/30 rounded-md">
              <Infinity className="h-4 w-4" />
              <span>Credits never expire</span>
            </div>

            <div className="border-t pt-4">
              <Button className="w-full" size="lg" onClick={handleCheckout} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {selectedOption === 'subscription' ? <Repeat className="h-5 w-5 mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
                    {selectedOption === 'subscription' ? 'Start Subscription' : 'Proceed to Checkout'}
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-3">
                {selectedOption === 'subscription'
                  ? "Recurring monthly charge. Cancel anytime."
                  : "Secure payment via Stripe"
                }
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
