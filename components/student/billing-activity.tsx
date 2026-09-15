"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Receipt, Gift, CircleDollarSign, Undo2 } from "lucide-react"
import type { BillingSummary, BillingTransaction } from "@/lib/core/billing"

const INITIAL_ROWS = 5

/**
 * How each kind of money movement is presented to a parent.
 *
 * The labels deliberately avoid internal vocabulary: "account credit" rather than
 * "Stripe customer balance", and nothing here says "credits", which in this app
 * means lessons and would be read as a lesson count.
 */
const PRESENTATION: Record<
    BillingTransaction["kind"],
    { label: string; icon: typeof Receipt; tone: string }
> = {
    fee: { label: "Charge", icon: Receipt, tone: "text-foreground" },
    fee_waived: { label: "Waived", icon: Undo2, tone: "text-success" },
    balance_payment: { label: "Payment", icon: CircleDollarSign, tone: "text-success" },
    account_credit: { label: "Credit", icon: Gift, tone: "text-success" },
}

function formatAmount(cents: number) {
    const sign = cents < 0 ? "-" : "+"
    return `${sign}$${Math.abs(cents / 100).toFixed(2)}`
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}

export function BillingActivity({ summary }: { summary: BillingSummary | undefined }) {
    const [expanded, setExpanded] = useState(false)

    // Nothing to show while the lookup is in flight, and nothing to show for a
    // family that has never been charged or credited. Rendering an empty card in
    // either case would put a permanent "Billing" section with no content on the
    // dashboard of every student who only ever pays by subscription.
    if (!summary || summary.history.length === 0) return null

    const rows = expanded ? summary.history : summary.history.slice(0, INITIAL_ROWS)
    const hidden = summary.history.length - rows.length

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-serif">Billing Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
                {rows.map(row => {
                    const { label, icon: Icon, tone } = PRESENTATION[row.kind]
                    return (
                        <div
                            key={row.id}
                            className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0"
                        >
                            <div className="flex items-start gap-3 min-w-0">
                                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{row.description}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {label} &middot; {formatDate(row.created_at)}
                                        {row.applies_to === "subscription" && " · applied to your subscription payment"}
                                    </p>
                                </div>
                            </div>
                            <p className={`text-sm font-semibold shrink-0 tabular-nums ${tone}`}>
                                {formatAmount(row.amount_cents)}
                            </p>
                        </div>
                    )
                })}

                {hidden > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => setExpanded(true)}
                    >
                        Show {hidden} more
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}
