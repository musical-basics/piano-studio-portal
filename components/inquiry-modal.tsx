"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Loader2, CheckCircle2 } from "lucide-react"
import { submitInquiry } from "@/app/actions/inquiries"
import { useToast } from "@/hooks/use-toast"

interface InquiryModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function InquiryModal({ open, onOpenChange }: InquiryModalProps) {
    const { toast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)

    // Form states
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        experience: "",
        goals: ""
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSelectChange = (value: string) => {
        setFormData(prev => ({ ...prev, experience: value }))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            const formDataObj = new FormData()
            Object.entries(formData).forEach(([key, value]) => {
                formDataObj.append(key, value)
            })

            const result = await submitInquiry(formDataObj)

            if (result.success) {
                setIsSuccess(true)
                // Reset after 3 seconds / allow user to close
            } else {
                toast({
                    variant: "destructive",
                    title: "Something went wrong",
                    description: result.error || "Please try again later."
                })
            }
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "An unexpected error occurred. Please try again."
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleClose = () => {
        onOpenChange(false)
        // Reset form after transition
        setTimeout(() => {
            setIsSuccess(false)
            setFormData({
                name: "",
                email: "",
                phone: "",
                experience: "",
                goals: ""
            })
        }, 300)
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
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

                        <form onSubmit={handleSubmit} className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name *</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    required
                                    placeholder="Your name"
                                    value={formData.name}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email *</Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        required
                                        placeholder="email@example.com"
                                        value={formData.email}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone (Optional)</Label>
                                    <Input
                                        id="phone"
                                        name="phone"
                                        type="tel"
                                        placeholder="(555) 123-4567"
                                        value={formData.phone}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="experience">Experience Level *</Label>
                                <Select required onValueChange={handleSelectChange} value={formData.experience}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select your level" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Beginner">Beginner (New to piano)</SelectItem>
                                        <SelectItem value="Intermediate">Intermediate (Some experience)</SelectItem>
                                        <SelectItem value="Advanced">Advanced (Several years experience)</SelectItem>
                                        <SelectItem value="Returning">Returning after a break</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="goals">Musical Goals *</Label>
                                <Textarea
                                    id="goals"
                                    name="goals"
                                    required
                                    placeholder="What would you like to achieve? (e.g. Learn classical, play for fun, prepare for exams)"
                                    className="min-h-[100px]"
                                    value={formData.goals}
                                    onChange={handleChange}
                                />
                            </div>

                            <DialogFooter className="pt-4">
                                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        "Submit Inquiry"
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
