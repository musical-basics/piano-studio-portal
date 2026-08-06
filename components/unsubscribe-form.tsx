"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2 } from "lucide-react"
import { setAnnouncementOptOut } from "@/app/actions/unsubscribe"

interface UnsubscribeFormProps {
    publicId: string
    name: string
    initialOptedOut: boolean
}

export function UnsubscribeForm({ publicId, name, initialOptedOut }: UnsubscribeFormProps) {
    const [optedOut, setOptedOut] = useState(initialOptedOut)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const toggle = async (next: boolean) => {
        setSubmitting(true)
        setError(null)
        const res = await setAnnouncementOptOut(publicId, next)
        setSubmitting(false)
        if (res.error) setError(res.error)
        else setOptedOut(next)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl font-serif">Announcement emails</CardTitle>
                <CardDescription>
                    For {name}. This only affects studio announcements (recitals, events).
                    Lesson reminders and account emails continue as usual.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {optedOut ? (
                    <div className="text-center space-y-4 py-2">
                        <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
                        <p className="text-sm">You&apos;re unsubscribed from announcement emails.</p>
                        <Button variant="outline" onClick={() => toggle(false)} disabled={submitting}>
                            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Resubscribe
                        </Button>
                    </div>
                ) : (
                    <Button className="w-full" onClick={() => toggle(true)} disabled={submitting}>
                        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Unsubscribe from announcement emails
                    </Button>
                )}
                {error && <p className="text-sm text-destructive text-center">{error}</p>}
            </CardContent>
        </Card>
    )
}
