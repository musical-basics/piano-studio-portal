import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { RecitalReview, type StudentEngagement } from "@/components/admin/recital-review"

export const dynamic = 'force-dynamic'

// Review how each active student's recital email will be addressed (parent vs
// adult student), with the contact info on file editable inline.
export default async function RecitalReviewPage() {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
    if (profile?.role !== 'admin') redirect("/student")

    const { data: studentsRaw } = await supabase
        .from("profiles")
        .select("id, name, email, phone, credits, status, lesson_day, lesson_time, lesson_duration, preferred_name, parent_email, parent_contact_name, contact_salutation, primary_contact_role, public_id")
        .eq("role", "student")
        .order("name", { ascending: true })

    const students = (studentsRaw || []).filter(s => !s.status || s.status === 'active')

    // Upcoming recital event, so each row can link to that family's RSVP page
    const { data: recitalEvent } = await supabase
        .from("events")
        .select("id")
        .ilike("title", "%recital%")
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle()

    // Per-student engagement: RSVP status (event_invites) + email opens/clicks
    // (recital_email_events). Both tables are RLS-restricted, so read them with
    // the service-role client (we are past the admin gate).
    const engagement: Record<string, StudentEngagement> = {}
    if (recitalEvent?.id) {
        const adminDb = createAdminClient()
        const [{ data: invites }, { data: trackingRows }] = await Promise.all([
            adminDb.from("event_invites")
                .select("student_id, status, student_notes")
                .eq("event_id", recitalEvent.id),
            adminDb.from("recital_email_events")
                .select("student_id, kind")
                .eq("event_id", recitalEvent.id),
        ])
        for (const s of students) {
            const invite = (invites || []).find(i => i.student_id === s.id)
            engagement[s.id] = {
                rsvpStatus: invite?.status || null,
                rsvpNotes: invite?.student_notes || null,
                opened: (trackingRows || []).some(t => t.student_id === s.id && t.kind === "open"),
                clicked: (trackingRows || []).some(t => t.student_id === s.id && t.kind === "click"),
            }
        }
    }

    return <RecitalReview students={students} recitalEventId={recitalEvent?.id || null} engagement={engagement} />
}
