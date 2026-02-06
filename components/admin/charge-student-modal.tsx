"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, DollarSign } from "lucide-react"
import { addAdHocCharge } from "@/app/actions/billing"
import { useToast } from "@/hooks/use-toast"

interface ChargeStudentModalProps {
    studentId: string
    studentName: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ChargeStudentModal({ studentId, studentName, open, onOpenChange }: ChargeStudentModalProps) {
    const { toast } = useToast()
    const [amount, setAmount] = useState("")
    const [description, setDescription] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!amount || !description) return

        setIsLoading(true)
        const result = await addAdHocCharge(studentId, parseFloat(amount), description)
        setIsLoading(false)

        if (result.error) {
            toast({ variant: "destructive", title: "Error", description: result.error })
        } else {
            toast({ title: "Charge Added", description: result.message })
            onOpenChange(false)
            setAmount("")
            setDescription("")
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Charge {studentName}</DialogTitle>
                    <DialogDescription>
                        Add a manual charge to the student's outstanding balance.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount ($)</Label>
                        <div className="relative">
                            <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="amount"
                                type="number"
                                placeholder="0.00"
                                className="pl-9"
                                step="0.01"
                                min="0.50"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description">Reason</Label>
                        <Input
                            id="description"
                            placeholder="e.g. Sheet Music: Bach Prelude"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Charge"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
