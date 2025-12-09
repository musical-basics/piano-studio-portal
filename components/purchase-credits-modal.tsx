"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, CreditCard, Sparkles, Loader2 } from "lucide-react"
import { createCheckoutSession } from "@/app/actions/stripe"
import { getCurrentUserPricing } from "@/app/actions/pricing"
import { useToast } from "@/hooks/use-toast"

interface PurchaseCreditsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PurchaseCreditsModal({ open, onOpenChange }: PurchaseCreditsModalProps) {
  const { toast } = useToast()
  const [selectedQuantity, setSelectedQuantity] = useState<1 | 4>(4)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPricing, setIsLoadingPricing] = useState(true)
  const [lessonDuration, setLessonDuration] = useState<number>(30)
  const [pricing, setPricing] = useState<{ single_price: number; pack_price: number } | null>(null)

  // Fetch user's pricing on modal open
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
    if (!pricing) return

    setIsLoading(true)
    const result = await createCheckoutSession(selectedQuantity)

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
  const packPricePerLesson = packPrice / 4
  const savings = (singlePrice * 4) - packPrice

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Buy Lesson Credits</DialogTitle>
          <DialogDescription>
            Your {lessonDuration}-minute lesson packages
          </DialogDescription>
        </DialogHeader>

        {isLoadingPricing ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !pricing ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Pricing not available. Please contact your teacher.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              {/* Single Lesson Option */}
              <button
                onClick={() => setSelectedQuantity(1)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedQuantity === 1 ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="font-semibold text-lg">Single Lesson</span>
                    <p className="text-sm text-muted-foreground">
                      1 x {lessonDuration}-minute lesson
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">${singlePrice}</span>
                    <div
                      className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${selectedQuantity === 1 ? "border-primary bg-primary" : "border-muted-foreground"
                        }`}
                    >
                      {selectedQuantity === 1 && <Check className="h-4 w-4 text-primary-foreground" />}
                    </div>
                  </div>
                </div>
              </button>

              {/* 4-Pack Option */}
              <button
                onClick={() => setSelectedQuantity(4)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedQuantity === 4 ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">4-Lesson Package</span>
                      <Badge className="bg-primary text-primary-foreground">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Best Value
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      4 x {lessonDuration}-minute lessons
                    </p>
                    {savings > 0 && (
                      <p className="text-sm text-green-600 font-medium">
                        Save ${savings.toFixed(0)} (${packPricePerLesson.toFixed(0)}/lesson)
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">${packPrice}</span>
                    <div
                      className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${selectedQuantity === 4 ? "border-primary bg-primary" : "border-muted-foreground"
                        }`}
                    >
                      {selectedQuantity === 4 && <Check className="h-4 w-4 text-primary-foreground" />}
                    </div>
                  </div>
                </div>
              </button>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Selected</span>
                <span className="font-medium">{selectedQuantity === 1 ? "Single Lesson" : "4-Lesson Package"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total</span>
                <span className="text-2xl font-bold">${selectedQuantity === 1 ? singlePrice : packPrice}</span>
              </div>
              <Button className="w-full" size="lg" onClick={handleCheckout} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5 mr-2" />
                    Proceed to Checkout
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">Secure payment via Stripe</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
