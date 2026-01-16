"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Pencil, Loader2, Save } from "lucide-react"
import { updateStudent } from "@/app/actions/users"
import { useToast } from "@/hooks/use-toast"
import type { Profile } from "@/lib/supabase/database.types"

function SubmitButton() {
    const { pending } = useFormStatus()

    return (
        <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
                <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                </>
            ) : (
                <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                </>
            )}
        </Button>
    )
}

interface EditStudentModalProps {
    student: Profile
}

export function EditStudentModal({ student }: EditStudentModalProps) {
    const [open, setOpen] = useState(false)
    const [lessonDuration, setLessonDuration] = useState(
        String(student.lesson_duration || 30)
    )
    const [lessonTime, setLessonTime] = useState(
        (student as any).lesson_time || "15:30"
    )
    const [timezone, setTimezone] = useState(
        student.timezone || "America/Los_Angeles"
    )
    const { toast } = useToast()
    const router = useRouter()

    async function handleSubmit(formData: FormData) {
        // Add lesson duration from state
        formData.set('lessonDuration', lessonDuration)
        formData.set('lessonTime', lessonTime)
        formData.set('timezone', timezone)

        try {
            const result = await updateStudent(formData)
            console.log("Update result:", result)

            if (result.error) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: result.error
                })
            } else if (result.success) {
                toast({
                    title: "Student Updated",
                    description: result.message
                })
                setOpen(false)
                router.refresh()
            }
        } catch (e) {
            console.error("Submission error:", e)
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to submit updates"
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-serif">Edit Student</DialogTitle>
                    <DialogDescription>
                        Update student information and lesson settings
                    </DialogDescription>
                </DialogHeader>

                <form action={handleSubmit} className="space-y-4 py-4">
                    <input type="hidden" name="id" value={student.id} />

                    <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                            id="name"
                            name="name"
                            type="text"
                            defaultValue={student.name || ''}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="publicId">Public ID (Optional)</Label>
                        <Input
                            id="publicId"
                            name="publicId"
                            type="text"
                            defaultValue={student.public_id || ''}
                            placeholder="e.g. 12345"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            defaultValue={student.email || ''}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="parentEmail">Parent Email (Optional - for CC)</Label>
                        <Input
                            id="parentEmail"
                            name="parentEmail"
                            type="email"
                            defaultValue={student.parent_email || ''}
                            placeholder="parent@example.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Time Zone</Label>
                        <Select
                            value={timezone}
                            onValueChange={setTimezone}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="America/Los_Angeles">PT (Pacific Time)</SelectItem>
                                <SelectItem value="America/Denver">MT (Mountain Time)</SelectItem>
                                <SelectItem value="America/Chicago">CT (Central Time)</SelectItem>
                                <SelectItem value="America/New_York">ET (Eastern Time)</SelectItem>
                                <SelectItem value="Europe/London">UK Time</SelectItem>
                                <SelectItem value="Europe/Paris">Central Europe Time</SelectItem>
                                <SelectItem value="Australia/Sydney">AET (Australian Eastern Time)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="credits">Current Credits</Label>
                        <Input
                            id="credits"
                            name="credits"
                            type="number"
                            defaultValue={student.credits}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="lessonDay">Recurring Day</Label>
                            <select
                                id="lessonDay"
                                name="lessonDay"
                                defaultValue={(student as any).lesson_day || ""}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="">None</option>
                                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                    <option key={day} value={day}>{day}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lessonTime">Standard Time</Label>
                            <Input
                                id="lessonTime"
                                type="time"
                                value={lessonTime}
                                onChange={(e) => setLessonTime(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Lesson Duration</Label>
                        <Select
                            value={lessonDuration}
                            onValueChange={setLessonDuration}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="30">30 minutes</SelectItem>
                                <SelectItem value="45">45 minutes</SelectItem>
                                <SelectItem value="60">60 minutes</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            This determines the student&apos;s pricing tier
                        </p>
                    </div>

                    <div className="pt-4">
                        <SubmitButton />
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
