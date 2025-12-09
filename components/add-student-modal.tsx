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
import { UserPlus, Loader2 } from "lucide-react"
import { createStudent } from "@/app/actions/users"
import { useToast } from "@/hooks/use-toast"

function SubmitButton() {
    const { pending } = useFormStatus()

    return (
        <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
                <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                </>
            ) : (
                <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Student
                </>
            )}
        </Button>
    )
}

export function AddStudentModal() {
    const [open, setOpen] = useState(false)
    const { toast } = useToast()
    const router = useRouter()

    async function handleSubmit(formData: FormData) {
        const result = await createStudent(formData)

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error
            })
        } else if (result.success) {
            toast({
                title: "Student Created!",
                description: `${result.message} Temporary password: ${result.tempPassword}`
            })
            setOpen(false)
            router.refresh()
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Student
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-serif">Add New Student</DialogTitle>
                    <DialogDescription>
                        Create a new student account. They can log in with the temporary password.
                    </DialogDescription>
                </DialogHeader>

                <form action={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Full Name *</Label>
                        <Input
                            id="name"
                            name="name"
                            type="text"
                            placeholder="Emily Chen"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="emily@example.com"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone (optional)</Label>
                        <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            placeholder="(555) 123-4567"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="credits">Initial Credits</Label>
                        <Input
                            id="credits"
                            name="credits"
                            type="number"
                            min="0"
                            defaultValue="0"
                            placeholder="0"
                        />
                    </div>

                    <input type="hidden" name="password" value="piano123" />

                    <div className="pt-4">
                        <SubmitButton />
                    </div>

                    <p className="text-xs text-muted-foreground text-center">
                        Default password: <span className="font-mono">piano123</span>
                    </p>
                </form>
            </DialogContent>
        </Dialog>
    )
}
