"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Lock, Mail } from "lucide-react"
import { updatePassword, updateNotificationEmail } from "@/app/actions/account"

interface StudentSettingsFormProps {
    /** The auth identity. Shown read-only: changing it would change how you sign in. */
    loginEmail: string | null
    /** Current delivery override, or null when notifications go to the login email. */
    notificationEmail: string | null
}

export function StudentSettingsForm({ loginEmail, notificationEmail }: StudentSettingsFormProps) {
    return (
        <>
            <NotificationEmailCard loginEmail={loginEmail} notificationEmail={notificationEmail} />
            <PasswordCard />
        </>
    )
}

/**
 * Lets a student redirect notifications to their own inbox.
 *
 * Accounts set up by a parent carry the parent's address as the login identity,
 * so every message and lesson notification lands in the parent's mail. This is a
 * delivery-only override: the login email is untouched.
 */
function NotificationEmailCard({ loginEmail, notificationEmail }: StudentSettingsFormProps) {
    const [value, setValue] = useState(notificationEmail || "")
    const [current, setCurrent] = useState(notificationEmail)
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        const result = await updateNotificationEmail(formData)
        setIsLoading(false)

        if (result.error) {
            toast({ variant: "destructive", title: "Error", description: result.error })
            return
        }

        setCurrent(value.trim() || null)
        toast({ title: "Saved", description: result.message })
    }

    const deliveringTo = current || loginEmail

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Where we email you
                </CardTitle>
                <CardDescription>
                    Message and lesson notifications currently go to{" "}
                    <span className="font-medium text-foreground">{deliveringTo || "no address on file"}</span>.
                    Put your own address here to have them sent to you instead.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form action={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="notificationEmail">Notification email</Label>
                        <Input
                            id="notificationEmail"
                            name="notificationEmail"
                            type="email"
                            placeholder={loginEmail || "you@example.com"}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Leave this blank to go back to your sign-in email
                            {loginEmail ? ` (${loginEmail})` : ""}.
                        </p>
                    </div>

                    <div className="rounded-md border bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                            You still sign in with{" "}
                            <span className="font-medium text-foreground">{loginEmail || "your existing email"}</span>.
                            Changing the address above only changes where notifications are sent.
                        </p>
                    </div>

                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Save Email"
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}

function PasswordCard() {
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        const result = await updatePassword(formData)
        setIsLoading(false)

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error
            })
        } else {
            toast({
                title: "Success",
                description: result.message
            })
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Change Password
                </CardTitle>
                <CardDescription>
                    Update your login password here.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form action={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">New Password</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input
                            id="confirmPassword"
                            name="confirmPassword"
                            type="password"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Updating...
                            </>
                        ) : (
                            "Update Password"
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
