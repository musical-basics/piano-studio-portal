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
    const { toast } = useToast()
    const router = useRouter()

    async function handleSubmit(formData: FormData) {
        // Add lesson duration from state (since Select doesn't work with native form)
        formData.set('lessonDuration', lessonDuration)

        const result = await updateStudent(formData)

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
