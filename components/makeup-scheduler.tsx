"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, Clock, CheckCircle2 } from "lucide-react"
import { mockMakeupSlots, type MakeupSlot } from "@/lib/mock-data"

interface MakeupSchedulerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectSlot: (slot: MakeupSlot | null) => void
}

export function MakeupScheduler({ open, onOpenChange, onSelectSlot }: MakeupSchedulerProps) {
  const [selectedSlot, setSelectedSlot] = useState<MakeupSlot | null>(null)

  const handleConfirm = () => {
    onSelectSlot(selectedSlot)
    onOpenChange(false)
    setSelectedSlot(null)
  }

  const handleSkip = () => {
    onSelectSlot(null)
    onOpenChange(false)
    setSelectedSlot(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Choose Your Makeup Lesson</DialogTitle>
          <DialogDescription className="text-base">
            We found 3 available slots for you this week. Select one or skip to preserve your credit for next package.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {mockMakeupSlots.map((slot) => (
            <Card
              key={slot.id}
              className={`p-4 cursor-pointer transition-all border-2 ${
                selectedSlot?.id === slot.id ? "border-primary bg-accent" : "border-border hover:border-primary/50"
              }`}
              onClick={() => setSelectedSlot(slot)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center justify-center w-16 h-16 bg-primary text-primary-foreground rounded-lg">
                    <span className="text-xs font-medium uppercase">{slot.day.slice(0, 3)}</span>
                    <span className="text-xl font-bold">{slot.date.split("/")[1]}</span>
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
          ))}

          {/* Skip Option */}
          <Card
            className={`p-4 cursor-pointer transition-all border-2 border-dashed ${
              selectedSlot === null && open
                ? "border-muted-foreground bg-muted"
                : "border-border hover:border-muted-foreground"
            }`}
            onClick={() => setSelectedSlot(null)}
          >
            <div className="text-center py-2">
              <h3 className="font-semibold text-lg mb-1">None of these work</h3>
              <p className="text-sm text-muted-foreground">
                Skip this week and preserve your credit for the next package
              </p>
            </div>
          </Card>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedSlot === undefined}>
            {selectedSlot ? "Confirm Slot" : "Skip This Week"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
