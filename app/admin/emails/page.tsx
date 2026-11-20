import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { FamilyEmailsView } from "@/components/admin/family-emails-view"

export const dynamic = "force-dynamic"

// Every email the portal sends families, with a filled-in sample of each
// (Lionel's #1003). Admin only, like /admin/jobs; the page itself is
// components/admin/family-emails-view.tsx.
export default async function FamilyEmailsPage() {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
    if (profile?.role !== "admin") redirect("/student")

    return <FamilyEmailsView />
}
