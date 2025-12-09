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
import { AlertTriangle } from "lucide-react"

interface CancellationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAcceptFee: () => void
}

export function CancellationModal({ open, onOpenChange, onAcceptFee }: CancellationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
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
        </DialogHeader>

        <div className="bg-muted p-4 rounded-lg my-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Late Cancellation Fee</span>
            <span className="text-lg font-semibold">$20.00</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Credit Status</span>
            <span className="text-sm font-medium text-success">Preserved</span>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Keep Lesson
          </Button>
          <Button variant="destructive" onClick={onAcceptFee} className="w-full sm:w-auto">
            Accept Fee & Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
