import { StudentSettingsForm } from "@/components/student/settings-form"
import { AutoRefillSettingsCard } from "@/components/student/auto-refill-settings"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getNotificationEmail, getTextSettings } from "@/app/actions/account"
import { getAutoRefillSettings } from "@/app/actions/auto-refill"

export default async function SettingsPage({
    searchParams,
}: {
    searchParams?: Promise<{ refill_checkout?: string | string[] }>
}) {
    // Back from an auto-refill Stripe Checkout (#1477): the card finishes it.
    const returned = (await searchParams)?.refill_checkout
    const returnedSession = typeof returned === "string" && returned.startsWith("cs_") ? returned : null

    const [{ loginEmail, notificationEmail }, texting, autoRefill] = await Promise.all([
        getNotificationEmail(),
        getTextSettings(),
        getAutoRefillSettings(),
    ])

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
                <div>
                    <Link href="/student">
                        <Button variant="ghost" className="gap-2 pl-0 hover:bg-transparent hover:text-primary">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Dashboard
                        </Button>
                    </Link>
                    <h1 className="text-3xl font-serif font-bold mt-2">Account Settings</h1>
                </div>

                {(autoRefill?.plan || returnedSession) && (
                    <AutoRefillSettingsCard
                        settings={autoRefill ?? { plan: null, waiting: null, monthlyEndsAt: null, preview: false }}
                        returnedSession={returnedSession}
                    />
                )}

                <StudentSettingsForm loginEmail={loginEmail} notificationEmail={notificationEmail} texting={texting} />
            </div>
        </div>
    )
}
