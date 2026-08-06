"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, CheckCircle2 } from "lucide-react"
import { submitRecitalRsvp } from "@/app/actions/recital-rsvp"

interface RecitalRsvpFormProps {
    eventId: string
    publicId: string
    eventTitle: string
    eventStartTime: string
    defaultName: string
    defaultEmail: string
    initialAttending: boolean
    existingStatus: string | null
}

export function RecitalRsvpForm({
    eventId,
    publicId,
    eventTitle,
    eventStartTime,
    defaultName,
    defaultEmail,
    initialAttending,
    existingStatus,
}: RecitalRsvpFormProps) {
    const [attending, setAttending] = useState(initialAttending)
    const [name, setName] = useState(defaultName)
    const [email, setEmail] = useState(defaultEmail)
    const [piece, setPiece] = useState("")
    const [guestEmails, setGuestEmails] = useState("")
    const [note, setNote] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const when = new Date(eventStartTime).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "long", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit",
    })

    const handleSubmit = async () => {
        setSubmitting(true)
        setError(null)
        const res = await submitRecitalRsvp({
            eventId, publicId, attending,
            name, email, piece, guestEmails, note,
        })
        setSubmitting(false)
        if (res.error) setError(res.error)
        else setDone(true)
    }

    if (done) {
        return (
            <Card>
                <CardContent className="py-12 text-center space-y-3">
                    <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
                    <p className="text-lg font-serif">
                        {attending ? "You're on the program!" : "Thanks for letting us know."}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {attending
                            ? "Zoom joining instructions will be sent out closer to the date."
                            : "We'll miss you this time. See you at a future recital!"}
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl font-serif">{eventTitle}</CardTitle>
                <CardDescription>{when} PST · Group Zoom call</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {existingStatus && (
                    <p className="text-sm text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
                        You previously responded "{existingStatus === "going" ? "attending" : "not attending"}".
                        Submitting again will update your RSVP.
                    </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant={attending ? "default" : "outline"}
                        onClick={() => setAttending(true)}
                    >
                        I can attend
                    </Button>
                    <Button
                        variant={!attending ? "default" : "outline"}
                        onClick={() => setAttending(false)}
                    >
                        Not able to make it
                    </Button>
                </div>

                {attending ? (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="rsvp-name">Performer name</Label>
                            <Input id="rsvp-name" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rsvp-email">Contact email</Label>
                            <Input id="rsvp-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rsvp-piece">Which piece would you like to perform?</Label>
                            <Input
                                id="rsvp-piece"
                                placeholder='e.g. Chopin Nocturne in C# minor (or "not sure yet")'
                                value={piece}
                                onChange={e => setPiece(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rsvp-guests">Guest emails to invite to the Zoom call</Label>
                            <Textarea
                                id="rsvp-guests"
                                placeholder={"grandma@example.com\nuncle@example.com"}
                                value={guestEmails}
                                onChange={e => setGuestEmails(e.target.value)}
                                rows={3}
                            />
                            <p className="text-xs text-muted-foreground">
                                One per line or comma separated. They&apos;ll receive the Zoom invitation
                                when instructions go out.
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="space-y-2">
                        <Label htmlFor="rsvp-note">Anything you&apos;d like Lionel to know? (optional)</Label>
                        <Textarea id="rsvp-note" value={note} onChange={e => setNote(e.target.value)} rows={2} />
                    </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {attending ? "Confirm: I can attend" : "Confirm: not able to make it"}
                </Button>
            </CardContent>
        </Card>
    )
}
