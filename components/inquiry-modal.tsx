"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InquiryForm } from "./inquiry-form"

interface InquiryModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
    const [isSuccess, setIsSuccess] = useState(false)

    const handleSuccess = () => {
        setIsSuccess(true)
    }

    const handleClose = () => {
        onOpenChange(false)
        // Reset state after transition
        setTimeout(() => {
            setIsSuccess(false)
        }, 300)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            {/* CRITICAL FIX: 
               We removed 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' 
               from the className below. The Dialog primitive handles this now.
            */}
            <DialogContent className="sm:max-w-[500px]">
                {isSuccess ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                        <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                            <CheckCircle2 className="h-8 w-8" />
                        </div>
                        <DialogTitle className="text-2xl font-serif">Inquiry Sent!</DialogTitle>
                        <DialogDescription className="text-base max-w-xs mx-auto">
                            Thank you for your interest. We have received your details and will contact you shortly to schedule a consultation.
                        </DialogDescription>
                        <Button className="mt-4" onClick={handleClose}>
                            Close
                        </Button>
                    </div>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-serif">Inquire for Lessons</DialogTitle>
                            <DialogDescription>
                                Tell us about your musical goals. We'll get back to you within 24 hours.
                            </DialogDescription>
                        </DialogHeader>

                        <InquiryForm onSuccess={handleSuccess} className="py-2" />
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
