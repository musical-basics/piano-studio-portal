"use client"

import { useState } from "react"
import { Video } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { agreeRecordingConsent } from "@/app/actions/recording-consent"

/**
 * #876: a one-time notice that lessons are recorded, with a tick box. Shown on
 * every visit until the family agrees (closing it just brings it back next
 * time); the date is saved on their profile.
 */
export function RecordingConsentDialog({ consentAt }: { consentAt?: string | null }) {
    const { toast } = useToast()
    const [open, setOpen] = useState(!consentAt)
    const [ticked, setTicked] = useState(false)
    const [saving, setSaving] = useState(false)

    if (consentAt) return null

    const handleOk = async () => {
        setSaving(true)
        const res = await agreeRecordingConsent()
        setSaving(false)
        if ("error" in res) {
            toast({ variant: "destructive", title: "Not saved", description: res.error })
            return
        }
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-serif">
                        <Video className="h-5 w-5 text-primary" />
                        Lessons are recorded
                    </DialogTitle>
                    <DialogDescription className="text-base leading-relaxed pt-2">
                        Lessons are recorded so you can rewatch them. Recordings are private to your family and show up under Past Lessons here.
                    </DialogDescription>
                </DialogHeader>
                <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                    <Checkbox
                        checked={ticked}
                        onCheckedChange={(v) => setTicked(v === true)}
                        className="mt-0.5"
                        aria-label="I agree that lessons may be recorded for our own review"
                    />
                    <span className="text-sm">I agree that lessons may be recorded for our own review.</span>
                </label>
                <DialogFooter>
                    <Button onClick={handleOk} disabled={!ticked || saving} className="w-full sm:w-auto">
                        {saving ? "Saving..." : "OK"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
