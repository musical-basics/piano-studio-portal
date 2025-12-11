"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"

interface CancellationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmCancel: () => void
  lessonDate?: string  // YYYY-MM-DD format
  lessonTime?: string  // HH:MM format
  isLoading?: boolean
}

/**
 * Check if a lesson is within 24 hours (late cancellation)
 */
function isLateCancellation(lessonDate?: string, lessonTime?: string): boolean {
  if (!lessonDate) return false

  // Parse the lesson date and time as local time
  const timeStr = lessonTime || '12:00'
  const lessonDateTime = new Date(`${lessonDate}T${timeStr}:00`)
  const now = new Date()

  // Calculate hours difference
  const diffMs = lessonDateTime.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  // Late if less than 24 hours AND lesson is in the future
  return diffHours > 0 && diffHours < 24
}

export function CancellationModal({
  open,
  onOpenChange,
  onConfirmCancel,
  lessonDate,
  lessonTime,
  isLoading = false
}: CancellationModalProps) {
  const isLate = isLateCancellation(lessonDate, lessonTime)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {isLate ? (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <DialogTitle className="text-xl font-serif">Late Cancellation Fee</DialogTitle>
              </div>
              <DialogDescription className="text-base leading-relaxed pt-2">
                You are cancelling with less than 24 hours notice. A <strong className="text-foreground">$20 fee</strong>{" "}
                will be charged to preserve your lesson credit for future use.
              </DialogDescription>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
                <DialogTitle className="text-xl font-serif">Cancel Lesson</DialogTitle>
              </div>
              <DialogDescription className="text-base leading-relaxed pt-2">
                You are cancelling with more than 24 hours notice. Your lesson credit will be fully refunded.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        <div className="bg-muted p-4 rounded-lg my-4">
          {isLate ? (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Late Cancellation Fee</span>
                <span className="text-lg font-semibold">$20.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Credit Status</span>
                <span className="text-sm font-medium text-success">Preserved</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Cancellation Fee</span>
                <span className="text-lg font-semibold text-success">$0.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Credit Status</span>
                <span className="text-sm font-medium text-success">Refunded</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto" disabled={isLoading}>
            Keep Lesson
          </Button>
          <Button
            variant={isLate ? "destructive" : "default"}
            onClick={onConfirmCancel}
            className="w-full sm:w-auto"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cancelling...
              </>
            ) : isLate ? (
              "Accept Fee & Cancel"
            ) : (
              "Confirm Cancellation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
