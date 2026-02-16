import { StudentSettingsForm } from "@/components/student/settings-form"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function SettingsPage() {
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

                <StudentSettingsForm />
            </div>
        </div>
    )
}
