"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, CreditCard, Sparkles, Loader2 } from "lucide-react"
import { createCheckoutSession } from "@/app/actions/stripe"
import { useToast } from "@/hooks/use-toast"

type CreditPackage = {
  id: string
  name: string
  credits: number
  price: number
  price_per_lesson: number
  popular?: boolean
}

const creditPackages: CreditPackage[] = [
  { id: "single", name: "Single Lesson", credits: 1, price: 50, price_per_lesson: 50 },
  { id: "4-pack", name: "4-Lesson Package", credits: 4, price: 200, price_per_lesson: 50, popular: true },
  { id: "8-pack", name: "8-Lesson Package", credits: 8, price: 400, price_per_lesson: 50 },
]

interface PurchaseCreditsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PurchaseCreditsModal({ open, onOpenChange }: PurchaseCreditsModalProps) {
  const { toast } = useToast()
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(
    creditPackages.find((p) => p.popular) || null,
  )
  const [isLoading, setIsLoading] = useState(false)

  const handleCheckout = async () => {
    if (!selectedPackage) return

    setIsLoading(true)
    const result = await createCheckoutSession(selectedPackage.credits)

    if (result.error) {
      setIsLoading(false)
      toast({
        variant: "destructive",
        title: "Checkout Failed",
        description: result.error
      })
    } else if (result.url) {
      // Redirect to Stripe Checkout
      window.location.href = result.url
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Buy Lesson Credits</DialogTitle>
          <DialogDescription>Choose a package that works for your schedule</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {creditPackages.map((pkg) => {
            const isSelected = selectedPackage?.id === pkg.id
            const savings = pkg.credits > 1 ? creditPackages[0].price * pkg.credits - pkg.price : 0

            return (
              <button
                key={pkg.id}
                onClick={() => setSelectedPackage(pkg)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{pkg.name}</span>
                      {pkg.popular && (
                        <Badge className="bg-primary text-primary-foreground">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Best Value
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {pkg.credits} {pkg.credits === 1 ? "lesson credit" : "lesson credits"}
                    </p>
                    {savings > 0 && (
                      <p className="text-sm text-success font-medium">
                        Save ${savings} (${pkg.price_per_lesson}/lesson)
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">${pkg.price}</span>
                    <div
                      className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-primary bg-primary" : "border-muted-foreground"
                        }`}
                    >
                      {isSelected && <Check className="h-4 w-4 text-primary-foreground" />}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Selected package</span>
            <span className="font-medium">{selectedPackage?.name || "None"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold">${selectedPackage?.price || 0}</span>
          </div>
          <Button className="w-full" size="lg" onClick={handleCheckout} disabled={!selectedPackage || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5 mr-2" />
                Buy Credits (Test Mode)
              </>
            )}
          </Button>
          <p className="text-xs text-center text-muted-foreground">Test mode - credits added instantly</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
