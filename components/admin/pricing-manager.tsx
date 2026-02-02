"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createPricingPlan, createPricingPoint, updatePricingPoint, deletePricingPoint, PricingPlan, PricingPoint } from "@/app/actions/pricing"
import { Plus, Trash2, Repeat, Pencil } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface PricingManagerProps {
    initialPlans: PricingPlan[]
}

export function PricingManager({ initialPlans }: PricingManagerProps) {
    const [plans, setPlans] = useState(initialPlans)
    const [newPlanName, setNewPlanName] = useState("")
    const { toast } = useToast()
    const router = useRouter()

    useEffect(() => {
        setPlans(initialPlans)
    }, [initialPlans])

    // New/Edit Point State
    const [pointLabel, setPointLabel] = useState("")
    const [pointPrice, setPointPrice] = useState("")
    const [pointCredits, setPointCredits] = useState("1")
    const [pointType, setPointType] = useState<"one_time" | "subscription">("one_time")
    const [stripeId, setStripeId] = useState("")
    const [editingPointId, setEditingPointId] = useState<string | null>(null)

    // Track which plan has the active form
    const [activePlanId, setActivePlanId] = useState<string | null>(null)

    const handleCreatePlan = async () => {
        if (!newPlanName) return
        const res = await createPricingPlan(newPlanName)
        if (res.success && res.plan) {
            setPlans([...plans, res.plan])
            setNewPlanName("")
            toast({ title: "Plan Created", description: `Plan "${res.plan.name}" created.` })
        } else {
            toast({ variant: "destructive", title: "Error", description: res.error })
        }
    }

    const handleEditPoint = (point: PricingPoint) => {
        setActivePlanId(point.plan_id)
        setEditingPointId(point.id)
        setPointLabel(point.label)
        setPointPrice((point.price / 100).toString())
        setPointCredits(point.credits.toString())
        setPointType(point.type)
        setStripeId(point.stripe_price_id || "")
    }

    const handleSavePoint = async (planId: string) => {
        if (!pointLabel || !pointPrice) {
            toast({ variant: "destructive", title: "Error", description: "Label and Price are required" })
            return
        }

        try {
            const priceInCents = Math.round(parseFloat(pointPrice) * 100)
            const credits = parseInt(pointCredits)

            let res
            if (editingPointId) {
                // Update existing
                res = await updatePricingPoint(editingPointId, {
                    label: pointLabel,
                    price: priceInCents,
                    credits: credits,
                    type: pointType,
                    stripe_price_id: stripeId || null
                })
            } else {
                // Create new
                res = await createPricingPoint({
                    plan_id: planId,
                    label: pointLabel,
                    price: priceInCents,
                    credits: credits,
                    type: pointType,
                    stripe_price_id: stripeId || null
                })
            }

            if (res.success) {
                toast({ title: editingPointId ? "Option Updated" : "Option Added", description: "Pricing option saved successfully." })
                // Reset form
                resetForm()
                // Refresh page/data
                router.refresh()
            } else {
                toast({ variant: "destructive", title: "Error", description: res.error })
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Error", description: e.message })
        }
    }

    const resetForm = () => {
        setPointLabel("")
        setPointPrice("")
        setPointCredits("1")
        setStripeId("")
        setPointType("one_time")
        setActivePlanId(null)
        setEditingPointId(null)
    }

    const handleDeletePoint = async (id: string) => {
        if (confirm("Are you sure you want to delete this pricing option?")) {
            const res = await deletePricingPoint(id)
            if (res.success) {
                toast({ title: "Deleted", description: "Pricing option removed." })
                router.refresh()
            } else {
                toast({ variant: "destructive", title: "Error", description: res.error })
            }
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex gap-4 items-end border-b pb-6">
                <div className="grid gap-2 w-full max-w-sm">
                    <Label>New Pricing Plan Name</Label>
                    <Input value={newPlanName} onChange={e => setNewPlanName(e.target.value)} placeholder="e.g. Adult Beginners" />
                </div>
                <Button onClick={handleCreatePlan}>Create Plan</Button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {plans.map(plan => (
                    <Card key={plan.id} className="relative">
                        <CardHeader className="bg-muted/20">
                            <CardTitle>{plan.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            {/* Existing Points */}
                            <div className="space-y-2">
                                {plan.points?.map(point => (
                                    <div key={point.id} className="flex justify-between items-center p-3 border rounded bg-background hover:bg-muted/10 transition-colors">
                                        <div>
                                            <div className="font-medium flex items-center gap-2">
                                                {point.label}
                                                {point.type === 'subscription' && <Repeat className="h-3 w-3 text-muted-foreground" />}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                ${(point.price / 100).toFixed(2)} • {point.credits} Credits • {point.type === 'subscription' ? 'Auto-renew' : 'One-time'}
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleEditPoint(point)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeletePoint(point.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {(!plan.points || plan.points.length === 0) && <p className="text-sm text-muted-foreground italic">No pricing points yet.</p>}
                            </div>

                            {/* Add/Edit Point Form */}
                            <div className="border-t pt-4 mt-4">
                                {activePlanId === plan.id ? (
                                    <div className="space-y-3 bg-muted/20 p-3 rounded-md">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-sm font-semibold">{editingPointId ? "Edit Pricing Option" : "New Pricing Option"}</h4>
                                            <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs">Label</Label>
                                            <Input placeholder="e.g. 4-Pack" value={pointLabel} onChange={e => setPointLabel(e.target.value)} className="bg-background" />
                                        </div>

                                        <div className="flex gap-2">
                                            <div className="w-1/2 space-y-2">
                                                <Label className="text-xs">Price ($)</Label>
                                                <Input type="number" placeholder="50" value={pointPrice} onChange={e => setPointPrice(e.target.value)} className="bg-background" />
                                            </div>
                                            <div className="w-1/2 space-y-2">
                                                <Label className="text-xs">Credits</Label>
                                                <Input type="number" placeholder="1" value={pointCredits} onChange={e => setPointCredits(e.target.value)} className="bg-background" />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs">Type</Label>
                                            <Select value={pointType} onValueChange={(v: any) => setPointType(v)}>
                                                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="one_time">One Time</SelectItem>
                                                    <SelectItem value="subscription">Subscription</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {pointType === 'subscription' && (
                                            <div className="space-y-2">
                                                <Label className="text-xs">Stripe Price ID</Label>
                                                <Input placeholder="price_..." value={stripeId} onChange={e => setStripeId(e.target.value)} className="bg-background" />
                                                <p className="text-[10px] text-muted-foreground">Required for subscriptions.</p>
                                            </div>
                                        )}
                                        <Button size="sm" className="w-full mt-2" onClick={() => handleSavePoint(plan.id)}>
                                            {editingPointId ? "Update Option" : "Save Option"}
                                        </Button>
                                    </div>
                                ) : (
                                    <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => {
                                        resetForm()
                                        setActivePlanId(plan.id)
                                    }}>
                                        <Plus className="h-4 w-4" /> Add Pricing Option
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
