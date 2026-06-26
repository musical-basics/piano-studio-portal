import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getStudentEvents } from "@/app/actions/events"
import { ProspectDashboard } from "@/components/prospect/prospect-dashboard"

export default async function ProspectPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect("/login")
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    redirect("/login")
  }

  // Route everyone else to their own home.
  if (profile.role === "admin") redirect("/admin")
  if (profile.role === "student") redirect("/student")

  // Teacher/admin profile for chat + studio name.
  const { data: teacher } = await supabase
    .from("profiles")
    .select("studio_name, name")
    .eq("role", "admin")
    .limit(1)
    .single()

  // Audition meeting times reuse the events system (event_invites).
  const { upcoming: upcomingEvents } = await getStudentEvents()

  return (
    <ProspectDashboard
      profile={profile}
      events={upcomingEvents}
      studioName={teacher?.studio_name || "Piano Studio"}
      teacherName={teacher?.name || "Lionel Yu"}
    />
  )
}
