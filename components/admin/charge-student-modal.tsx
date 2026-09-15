"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, DollarSign } from "lucide-react"
import { addAdHocCharge, issueAccountCredit } from "@/app/actions/billing"
import { useToast } from "@/hooks/use-toast"

interface ChargeStudentModalProps {
    studentId: string
    studentName: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

type Mode = "charge" | "credit"

export function ChargeStudentModal({ studentId, studentName, open, onOpenChange }: ChargeStudentModalProps) {
    const { toast } = useToast()
    const [mode, setMode] = useState<Mode>("charge")
    const [amount, setAmount] = useState("")
    const [description, setDescription] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    const reset = () => {
        setAmount("")
        setDescription("")
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!amount || !description) return

        setIsLoading(true)
        const result = mode === "charge"
            ? await addAdHocCharge(studentId, parseFloat(amount), description)
            : await issueAccountCredit(studentId, parseFloat(amount), description)
        setIsLoading(false)

        if (result.error) {
            toast({ variant: "destructive", title: "Error", description: result.error })
        } else {
            toast({ title: mode === "charge" ? "Charge Added" : "Credit Applied", description: result.message })
            onOpenChange(false)
            reset()
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle>Billing for {studentName}</DialogTitle>
                    <DialogDescription>
                        {mode === "charge"
                            ? "Add a manual charge to the student's outstanding balance. They pay it separately from their subscription."
                            : "Give a dollar credit that comes off their next subscription payment automatically."}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); reset() }}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="charge">Add Charge</TabsTrigger>
                        <TabsTrigger value="credit">Give Credit</TabsTrigger>
                    </TabsList>

                    {/* One form for both modes: the fields are identical and only the
                        wording and the server action differ. */}
                    <TabsContent value={mode} forceMount>
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
                                    placeholder={mode === "charge" ? "e.g. Sheet Music: Bach Prelude" : "e.g. Tournament prize"}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-muted-foreground">
                                    Shown to the family in their portal, so write it for them to read.
                                </p>
                            </div>

                            {mode === "credit" && (
                                <p className="text-xs text-muted-foreground bg-muted rounded-md p-2.5">
                                    This does not add lesson credits. It reduces the next
                                    subscription invoice by this dollar amount, and messages
                                    the family to tell them.
                                </p>
                            )}

                            <div className="flex justify-end pt-2">
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : mode === "charge" ? "Confirm Charge" : "Apply Credit"}
                                </Button>
                            </div>
                        </form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
