import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getResources } from "@/app/actions/resources"
import { LibraryManager } from "@/components/admin/library-manager"

export default async function LibraryPage() {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        redirect("/login")
    }

    // Verify admin role
    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

    if (profile?.role !== "admin") {
        redirect("/student")
    }

    // Fetch resources
    const { resources, error } = await getResources()

    if (error) {
        console.error("Error fetching resources:", error)
    }

    // Fetch all students for assignment dropdown
    const { data: students } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("role", "student")
        .order("name")

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto py-8 px-4">
                <LibraryManager
                    initialResources={resources || []}
                    students={students || []}
                />
            </div>
        </div>
    )
}
