"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Loader2, CheckCircle2 } from "lucide-react"
import { submitTrialInquiry } from "@/app/actions/trial-inquiries"
import { useToast } from "@/hooks/use-toast"

const TIMEZONES = [
    { value: "America/New_York", label: "Eastern (ET)" },
    { value: "America/Chicago", label: "Central (CT)" },
    { value: "America/Denver", label: "Mountain (MT)" },
    { value: "America/Phoenix", label: "Arizona (no DST)" },
    { value: "America/Los_Angeles", label: "Pacific (PT)" },
    { value: "America/Anchorage", label: "Alaska (AKT)" },
    { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
    { value: "Other", label: "Other" },
]

const AVAILABILITY_OPTIONS = [
    "Weekday mornings",
    "Weekday afternoons",
    "Weekday evenings",
    "Weekend mornings",
    "Weekend afternoons",
    "Weekend evenings",
]

const EXPERIENCE_OPTIONS = [
    "Beginner",
    "Intermediate",
    "Advanced",
    "Returning after a break",
]

interface TrialInquiryFormProps {
    className?: string
}

export function TrialInquiryForm({ className }: TrialInquiryFormProps) {
    const { toast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)

    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [ageConfirmed, setAgeConfirmed] = useState(false)
    const [timezone, setTimezone] = useState("")
    const [availability, setAvailability] = useState<string[]>([])
    const [experience, setExperience] = useState("")
    const [goals, setGoals] = useState("")

    const toggleAvailability = (option: string) => {
        setAvailability((prev) =>
            prev.includes(option) ? prev.filter((v) => v !== option) : [...prev, option]
        )
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        if (!ageConfirmed) {
            toast({
                variant: "destructive",
                title: "Age confirmation required",
                description: "This studio currently teaches students 12 and over.",
            })
            return
        }

        if (availability.length === 0) {
            toast({
                variant: "destructive",
                title: "Pick at least one availability window",
                description: "Helps me suggest trial times that actually work for you.",
            })
            return
        }

        setIsSubmitting(true)

        try {
            const result = await submitTrialInquiry({
                name,
                email,
                ageConfirmed,
                timezone,
                availability,
                experience,
                goals,
            })

            if (result.success) {
                setIsSuccess(true)
            } else {
                toast({
                    variant: "destructive",
                    title: "Something went wrong",
                    description: result.error || "Please try again.",
                })
            }
        } catch {
            toast({
                variant: "destructive",
                title: "Error",
                description: "An unexpected error occurred. Please try again.",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isSuccess) {
        return (
            <div className={`flex flex-col items-center justify-center py-10 text-center space-y-4 ${className ?? ""}`}>
                <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="font-serif text-2xl font-bold">Got it — talk soon</h3>
                <p className="text-gray-600 max-w-sm">
                    Your trial request just landed. I&apos;ll personally reply within 48 hours with a few proposed times. Check your inbox for a confirmation.
                </p>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className={`space-y-6 ${className ?? ""}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="trial-name">Name *</Label>
                    <Input
                        id="trial-name"
                        required
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="trial-email">Email *</Label>
                    <Input
                        id="trial-email"
                        type="email"
                        required
                        placeholder="email@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
                <Checkbox
                    id="trial-age"
                    checked={ageConfirmed}
                    onCheckedChange={(checked) => setAgeConfirmed(checked === true)}
                    required
                />
                <Label htmlFor="trial-age" className="text-sm font-normal leading-relaxed cursor-pointer">
                    I confirm I am 12 or older. *
                </Label>
            </div>

            <div className="space-y-2">
                <Label htmlFor="trial-timezone">Time zone *</Label>
                <Select required value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="trial-timezone">
                        <SelectValue placeholder="Select your time zone" />
                    </SelectTrigger>
                    <SelectContent>
                        {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-3">
                <Label>General availability *</Label>
                <p className="text-sm text-gray-500">Pick any windows that usually work — multiple OK.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {AVAILABILITY_OPTIONS.map((option) => {
                        const id = `trial-avail-${option.replace(/\s+/g, "-").toLowerCase()}`
                        return (
                            <div key={option} className="flex items-center gap-2">
                                <Checkbox
                                    id={id}
                                    checked={availability.includes(option)}
                                    onCheckedChange={() => toggleAvailability(option)}
                                />
                                <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                                    {option}
                                </Label>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="space-y-3">
                <Label>Experience level *</Label>
                <RadioGroup value={experience} onValueChange={setExperience} required>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {EXPERIENCE_OPTIONS.map((option) => {
                            const id = `trial-exp-${option.replace(/\s+/g, "-").toLowerCase()}`
                            return (
                                <div key={option} className="flex items-center gap-2">
                                    <RadioGroupItem id={id} value={option} />
                                    <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                                        {option}
                                    </Label>
                                </div>
                            )
                        })}
                    </div>
                </RadioGroup>
            </div>

            <div className="space-y-2">
                <Label htmlFor="trial-goals">What you want from lessons *</Label>
                <Textarea
                    id="trial-goals"
                    required
                    placeholder="Briefly — what are your goals?"
                    className="min-h-[100px]"
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full h-12 text-base">
                {isSubmitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                    </>
                ) : (
                    "Request a Free Trial"
                )}
            </Button>

            <p className="text-xs text-center text-gray-500">
                I&apos;ll personally reply within 48 hours.
            </p>
        </form>
    )
}
