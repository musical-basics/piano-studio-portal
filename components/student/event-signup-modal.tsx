"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Calendar, Clock, Video, MapPin, Send } from "lucide-react"
import type { StudentEvent } from "@/app/actions/events"

interface EventSignupModalProps {
    event: StudentEvent | null
    studentName: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: (eventId: string, message: string) => Promise<void>
}

export function EventSignupModal({ event, studentName, open, onOpenChange, onConfirm }: EventSignupModalProps) {
    const [message, setMessage] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!event) return null

    const handleConfirm = async () => {
        if (!event) return
        setIsSubmitting(true)
        try {
            await onConfirm(event.id, message)
            setMessage("") // Clear message on success
            onOpenChange(false)
        } catch (error) {
            console.error("Signup failed", error)
            // Error handling is likely done in onConfirm or parent
        } finally {
            setIsSubmitting(false)
        }
    }

    const isVirtual = event.location_type === 'virtual'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader className="space-y-4">
                    <DialogTitle className="text-2xl font-serif">{event.title}</DialogTitle>
                    <DialogDescription className="hidden">
                        Sign up for {event.title}
                    </DialogDescription>

                    {/* Date, Time & Location */}
                    <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>{event.date}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{event.start_time}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            {isVirtual ? (
                                <>
                                    <Video className="h-4 w-4" />
                                    <span className="text-primary font-medium">Zoom Meeting</span>
                                </>
                            ) : (
                                <>
                                    <MapPin className="h-4 w-4" />
                                    <span>{event.location_address || "Studio"}</span>
                                </>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Teacher's Note Section */}
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                            Note from Teacher
                        </p>
                        <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
                            {event.description || "Please let me know what piece you plan to perform!"}
                        </p>
                    </div>

                    {/* RSVP Form */}
                    <div className="space-y-4">
                        {/* Student Name (Read-only) */}
                        <div className="space-y-2">
                            <Label htmlFor="student-name" className="text-sm font-medium">
                                Student Name
                            </Label>
                            <Input id="student-name" value={studentName} readOnly className="bg-muted cursor-not-allowed" />
                        </div>

                        {/* Student Message */}
                        <div className="space-y-2">
                            <Label htmlFor="message" className="text-sm font-medium">
                                Your Message / Repertoire Info
                            </Label>
                            <Textarea
                                id="message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="I would like to play Für Elise..."
                                className="min-h-[100px] resize-none"
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                Confirming...
                            </>
                        ) : (
                            <>
                                <Send className="h-4 w-4 mr-2" />
                                Confirm Attendance
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
