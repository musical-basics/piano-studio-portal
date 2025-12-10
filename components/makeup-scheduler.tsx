"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, Clock, CheckCircle2, Loader2 } from "lucide-react"
import { getAvailableMakeupSlots, claimMakeupSlot, type MakeupSlot } from "@/app/actions/makeup-slots"
import { useToast } from "@/hooks/use-toast"

interface MakeupSchedulerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lessonId?: string
  onSuccess?: () => void
}

export function MakeupScheduler({ open, onOpenChange, lessonId, onSuccess }: MakeupSchedulerProps) {
  const { toast } = useToast()
  const [slots, setSlots] = useState<MakeupSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<MakeupSlot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch available slots when modal opens
  useEffect(() => {
    if (open) {
      setIsLoading(true)
      setSelectedSlot(null)
      getAvailableMakeupSlots(5).then(({ slots: availableSlots }) => {
        setSlots(availableSlots)
        setIsLoading(false)
      })
    }
  }, [open])

  const handleConfirm = async () => {
    if (!selectedSlot || !lessonId) {
      // Skip option - just close
      onOpenChange(false)
      setSelectedSlot(null)
      return
    }

    setIsSubmitting(true)
    const result = await claimMakeupSlot(selectedSlot.id, lessonId)
    setIsSubmitting(false)

    if (result.error) {
      toast({
        variant: "destructive",
        title: "Reschedule Failed",
        description: result.error
      })
    } else if (result.success) {
      toast({
        title: "Lesson Rescheduled!",
        description: result.message
      })
      onOpenChange(false)
      setSelectedSlot(null)
      onSuccess?.()
    }
  }

  const handleSkip = () => {
    onOpenChange(false)
    setSelectedSlot(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Choose Your Makeup Lesson</DialogTitle>
          <DialogDescription className="text-base">
            {slots.length > 0
              ? `We found ${slots.length} available slot${slots.length > 1 ? 's' : ''} for you. Select one to reschedule your lesson.`
              : "Select an option below."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No available slots at this time</p>
              <p className="text-sm">Your teacher will add more slots soon. Check back later!</p>
            </div>
          ) : (
            slots.map((slot) => (
              <Card
                key={slot.id}
                className={`p-4 cursor-pointer transition-all border-2 ${selectedSlot?.id === slot.id ? "border-primary bg-accent" : "border-border hover:border-primary/50"
                  }`}
                onClick={() => setSelectedSlot(slot)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center justify-center w-16 h-16 bg-primary text-primary-foreground rounded-lg">
                      <span className="text-xs font-medium uppercase">{slot.day?.slice(0, 3)}</span>
                      <span className="text-xl font-bold">{slot.date?.split(' ')[1]}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{slot.day}</h3>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span className="text-sm">{slot.date}</span>
                        <Clock className="h-4 w-4 ml-2" />
                        <span className="text-sm">{slot.time}</span>
                      </div>
                    </div>
                  </div>
                  {selectedSlot?.id === slot.id && <CheckCircle2 className="h-6 w-6 text-primary" />}
                </div>
              </Card>
            ))
          )}

          {/* Skip Option - only show if there are slots */}
          {!isLoading && (
            <Card
              className={`p-4 cursor-pointer transition-all border-2 border-dashed ${selectedSlot === null
                  ? "border-muted-foreground bg-muted"
                  : "border-border hover:border-muted-foreground"
                }`}
              onClick={() => setSelectedSlot(null)}
            >
              <div className="text-center py-2">
                <h3 className="font-semibold text-lg mb-1">
                  {slots.length > 0 ? "None of these work" : "Cancel Rescheduling"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {slots.length > 0
                    ? "Skip this week and keep your current lesson time"
                    : "Go back without making changes"
                  }
                </p>
              </div>
            </Card>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={handleSkip}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || (slots.length > 0 && selectedSlot !== null && !selectedSlot)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rescheduling...
              </>
            ) : selectedSlot ? (
              "Confirm Reschedule"
            ) : (
              "Close"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
