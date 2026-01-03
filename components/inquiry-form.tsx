"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { submitInquiry } from "@/app/actions/inquiries"
import { useToast } from "@/hooks/use-toast"

interface InquiryFormProps {
    onSuccess?: () => void
    className?: string
}

export function InquiryForm({ onSuccess, className }: InquiryFormProps) {
    const { toast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)

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
                // Clear form
                setFormData({
                    name: "",
                    email: "",
                    phone: "",
                    experience: "",
                    goals: ""
                })

                if (onSuccess) {
                    onSuccess()
                } else {
                    toast({
                        title: "Inquiry Sent",
                        description: "We'll get back to you shortly."
                    })
                }
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

    return (
        <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="pt-4">
                <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                        </>
                    ) : (
                        "Submit Inquiry"
                    )}
                </Button>
            </div>
        </form>
    )
}
