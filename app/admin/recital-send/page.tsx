import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { RecitalSend, type SendPageStudent } from "@/components/admin/recital-send"
import { getRecitalSendLog } from "@/app/actions/recital-send"
import { emptySendLog } from "@/lib/recital-send"

export const dynamic = 'force-dynamic'
// Reminder scheduling sends one Resend call per recipient at ~2/sec, so the
// server actions invoked from this page need more than the default duration.
export const maxDuration = 120

// Day-of recital send console: review and send the Zoom-link emails (every
// family, guest, and audience member individually), edit the program, post the
// studio announcement, and schedule the pre-recital reminder emails.
export default async function RecitalSendPage() {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
    if (profile?.role !== 'admin') redirect("/student")

    // The upcoming (or very recent) recital: same heuristic as recital-review,
    // widened by a day so the page still works the morning after.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: event } = await supabase
        .from("events")
        .select("id, title, start_time, duration_minutes, location_details, zoom_meeting_id")
        .ilike("title", "%recital%")
        .gte("start_time", cutoff)
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle()

    if (!event) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-8 text-center text-muted-foreground">
                No upcoming recital event found. Create one on the Events page first.
            </div>
        )
    }

    const { data: studentsRaw } = await supabase
        .from("profiles")
        .select("id, name, email, preferred_name, parent_email, parent_contact_name, contact_salutation, status, public_id")
        .eq("role", "student")
        .order("name", { ascending: true })
    const active = (studentsRaw || []).filter(s => !s.status || s.status === 'active')

    const adminDb = createAdminClient()
    const { data: invites } = await adminDb
        .from("event_invites")
        .select("student_id, status, student_notes")
        .eq("event_id", event.id)

    const students: SendPageStudent[] = active.map(s => {
        const invite = (invites || []).find(i => i.student_id === s.id)
        return {
            id: s.id,
            name: s.name,
            preferred_name: s.preferred_name,
            email: s.email,
            parent_email: s.parent_email,
            parent_contact_name: s.parent_contact_name,
            contact_salutation: s.contact_salutation,
            public_id: s.public_id,
            rsvpStatus: invite?.status || null,
            rsvpNotes: invite?.student_notes || null,
        }
    })

    const logRes = await getRecitalSendLog(event.id)
    const log = logRes.log ?? emptySendLog()

    return (
        <RecitalSend
            event={{
                id: event.id,
                title: event.title,
                start_time: event.start_time,
                zoomUrl: event.location_details || '',
                zoomMeetingId: event.zoom_meeting_id,
            }}
            students={students}
            initialLog={log}
        />
    )
}
