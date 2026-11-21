"use client"

/**
 * "Add to my calendar" (#1082): the family's private feed of their lessons,
 * for their own phone calendar. The link is made on the first tap (a server
 * action), then offered three ways: webcal (iPhone, iPad, Mac), Google
 * Calendar's add-by-URL page, and Copy link. Reset link makes a new one and
 * the old one stops working.
 */

import { useState } from "react"
import { CalendarPlus, Copy, Loader2, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { getMyCalendarFeed, resetMyCalendarFeed, type CalendarFeedLinks } from "@/app/actions/calendar-feed"
import { trackRollout } from "@/lib/rollout-track"

export function CalendarFeedCard({ isPreview = false }: { isPreview?: boolean }) {
    const { toast } = useToast()
    const [links, setLinks] = useState<CalendarFeedLinks | null>(null)
    const [loading, setLoading] = useState(false)
    const [confirmReset, setConfirmReset] = useState(false)
    const [resetting, setResetting] = useState(false)

    const open = async () => {
        trackRollout("calendar_feed", "set_up")
        setLoading(true)
        const res = await getMyCalendarFeed()
        setLoading(false)
        if ("error" in res) {
            toast({ title: "Calendar link", description: res.error, variant: "destructive" })
            return
        }
        setLinks(res)
    }

    const copy = async () => {
        if (!links) return
        trackRollout("calendar_feed", "copied")
        try {
            await navigator.clipboard.writeText(links.feedUrl)
            toast({ title: "Link copied", description: "Paste it into your calendar app's \"subscribe\" or \"from URL\" option." })
        } catch {
            const field = document.getElementById("calendar-feed-url") as HTMLInputElement | null
            field?.select()
            toast({ title: "Copy the link below", description: "Your browser did not allow copying. The link is selected for you." })
        }
    }

    const reset = async () => {
        trackRollout("calendar_feed", "reset")
        setResetting(true)
        const res = await resetMyCalendarFeed()
        setResetting(false)
        setConfirmReset(false)
        if ("error" in res) {
            toast({ title: "Calendar link", description: res.error, variant: "destructive" })
            return
        }
        setLinks(res)
        toast({ title: "New link made", description: "The old link stopped working. Add the new one to your calendar again." })
    }

    return (
        <Card className="py-0" data-testid="calendar-feed-card">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <CalendarPlus className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <p className="font-medium">Add to my calendar</p>
                        <p className="text-sm text-muted-foreground">
                            Your lessons in your own phone calendar, shown in your time zone. When a lesson moves or is cancelled, your calendar follows.
                        </p>
                    </div>
                    {!links && (
                        <Button size="sm" variant="outline" onClick={open} disabled={loading || isPreview} className="shrink-0">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set up"}
                        </Button>
                    )}
                </div>

                {isPreview && !links && (
                    <p className="text-xs text-muted-foreground">Preview: the family makes their own private link here.</p>
                )}

                {links && (
                    <div className="space-y-3" data-testid="calendar-feed-links">
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" asChild>
                                <a href={links.webcalUrl} onClick={() => trackRollout("calendar_feed", "apple")}>iPhone, iPad or Mac</a>
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                                <a href={links.googleUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackRollout("calendar_feed", "google")}>Google Calendar</a>
                            </Button>
                            <Button size="sm" variant="outline" onClick={copy}>
                                <Copy className="h-3.5 w-3.5 mr-1.5" />
                                Copy link
                            </Button>
                        </div>
                        <input
                            id="calendar-feed-url"
                            readOnly
                            value={links.feedUrl}
                            onFocus={e => e.currentTarget.select()}
                            className="w-full rounded border bg-muted/50 px-2 py-1 font-mono text-xs text-muted-foreground"
                            aria-label="Your private calendar link"
                        />
                        <p className="text-xs text-muted-foreground">
                            Apple calendars check for changes about every hour; Google Calendar can take up to a day.
                            On Android, add it with the Google Calendar button (if your phone cannot, open it on a computer once and it shows on your phone too).
                            Keep this link to your family: anyone with it can see your lesson times.
                        </p>
                        {!confirmReset ? (
                            <button
                                type="button"
                                onClick={() => setConfirmReset(true)}
                                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            >
                                Reset link
                            </button>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Make a new link? Calendars using this one stop updating.</span>
                                <Button size="sm" variant="destructive" className="h-7" onClick={reset} disabled={resetting}>
                                    {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Yes, reset</>}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmReset(false)} disabled={resetting}>
                                    Keep it
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
