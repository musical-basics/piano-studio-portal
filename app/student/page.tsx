import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { StudentDashboard } from "@/components/student/student-dashboard"
import { getStudentEvents } from "@/app/actions/events"
import { getStudentResources } from "@/app/actions/resources"
import { getLatestAnnouncement } from "@/app/actions/announcements"
import { getImpersonationTarget } from "@/app/actions/impersonate"
import { ImpersonationBanner } from "@/components/admin/impersonation-banner"
import { buildLessonHistory } from "@/lib/lesson-history"
import { getMarkersForLessons } from "@/lib/recording-markers"
import { createAdminClient } from "@/lib/supabase/admin"
import { familyMoveStatesCore, type FamilyMoveState } from "@/lib/core/move-requests"
import { studioStartMs } from "@/lib/move-requests"
import { homeworkTicksFor } from "@/lib/core/homework"
import type { HomeworkTick } from "@/lib/homework"

export default async function StudentPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[] }>
}) {
  // ?tab=history opens the History tab (the monthly statement email links there, #936).
  const askedTab = (await searchParams)?.tab
  const initialTab = askedTab === "history" ? "history" : undefined

  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/login")
  }

  // Check if admin is impersonating a student
  const { studentId: impersonatingId, adminId } = await getImpersonationTarget()

  // The effective user ID: impersonated student (if admin is previewing) or the real user
  const effectiveUserId = impersonatingId ?? user.id

  // Fetch profile data (the student's profile, or the admin's own if not impersonating)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", effectiveUserId)
    .single()

  if (profileError || !profile) {
    console.error("Profile fetch error:", profileError)
    redirect("/login")
  }

  // If this is a real student (not an admin preview), block admins from seeing the student view normally
  if (!impersonatingId && profile.role === 'admin') {
    redirect("/admin")
  }

  // Prospects get a restricted dashboard, never the full student view (which exposes
  // recordings, library, and credits). Admin impersonation can still preview it.
  if (!impersonatingId && profile.role === 'prospect') {
    redirect("/prospect")
  }

  // Fetch teacher/admin profile for default Zoom link
  const { data: teacher } = await supabase
    .from("profiles")
    .select("zoom_link, studio_name, name")
    .eq("role", "admin")
    .limit(1)
    .single()

  // Fetch lessons for this student
  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("*")
    .eq("student_id", effectiveUserId)
    .order("date", { ascending: false })

  if (lessonsError) {
    console.error("Lessons fetch error:", lessonsError)
  }

  // The Lesson history tab (#737), from the same rows. This read uses the
  // signed-in family's own session, so row security limits it to their lessons.
  // Balance changes that are not lessons (#939: purchases, renewals, adjustments
  // with Lionel's reason). The ledger is service-role only; this reads only the
  // effective student's rows (the signed-in family, or the admin's preview).
  const { data: ledger } = await createAdminClient()
    .from("credit_transactions")
    .select("id, changed_at, delta, new_credits, source, note")
    .eq("student_id", effectiveUserId)
    .order("changed_at", { ascending: false })
    .limit(200)
  const history = buildLessonHistory(lessons || [], profile.credits ?? null, new Date(), profile.timezone, ledger || [])

  // Moments Lionel marked in classroom recordings (#874), for the lessons above
  // (already limited to this family by their own session).
  const markersByLesson = await getMarkersForLessons(lessons || [])

  // Homework items this family ticked (#945). Row security limits this read to
  // their own ticks (or, for an admin preview, the admin's read-all).
  let homeworkTicks: HomeworkTick[] = []
  try {
    homeworkTicks = await homeworkTicksFor(supabase as any, effectiveUserId)
  } catch (e) {
    console.error("Homework ticks fetch error:", e)
  }

  // Find next scheduled lesson
  const now = new Date()
  const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000))
  const queryDate = yesterday.toISOString().split('T')[0]

  const upcomingLessons = (lessons || [])
    .filter(l => l.status === 'scheduled' && l.date >= queryDate)
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      return a.time.localeCompare(b.time)
    })

  const nextScheduledLesson = upcomingLessons[0]

  // Lessons the family can ask to move (#878): scheduled and not started yet,
  // each with its latest request worth showing. Service-role read of this
  // student's own requests only (it also closes ones that can no longer happen).
  const nowMs = Date.now()
  const movableLessons = upcomingLessons
    .filter(l => studioStartMs(l.date, String(l.time)) > nowMs)
    .map(l => ({ id: l.id as string, date: l.date as string, time: String(l.time).slice(0, 5), duration: (l.duration as number) || 60 }))
  let moveStates: Record<string, FamilyMoveState> = {}
  try {
    moveStates = await familyMoveStatesCore(createAdminClient(), effectiveUserId, movableLessons)
  } catch (e) {
    console.error("Move requests fetch error:", e)
  }

  // Format next lesson for UI
  const nextLesson = nextScheduledLesson ? {
    id: nextScheduledLesson.id,
    date: nextScheduledLesson.date,
    time: formatTimeForDisplay(nextScheduledLesson.time),
    duration: nextScheduledLesson.duration || 60,
    rawTime: nextScheduledLesson.time,
    isConfirmed: nextScheduledLesson.is_confirmed || false
  } : null

  // Determine Zoom link: lesson-specific > student's profile > teacher's default
  const zoomLink = nextScheduledLesson?.zoom_link || profile.zoom_link || teacher?.zoom_link || null

  // Unread messages addressed to this student. The dashboard used to hardcode
  // this to 1, so the Messages tab always claimed a notification.
  const { count: unreadCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", effectiveUserId)
    .eq("is_read", false)
    .is("deleted_at", null)

  // Fetch events & resources scoped to the effective user
  const { upcoming: upcomingEvents } = await getStudentEvents()
  const { resources } = await getStudentResources()
  const latestAnnouncement = await getLatestAnnouncement(effectiveUserId)

  return (
    <>
      {/* Admin impersonation banner — only shown when previewing as a student */}
      {impersonatingId && (
        <ImpersonationBanner studentName={profile.name || 'Student'} />
      )}
      <StudentDashboard
        profile={profile}
        lessons={lessons || []}
        nextLesson={nextLesson}
        zoomLink={zoomLink}
        studioName={teacher?.studio_name || "Piano Studio"}
        teacherName={teacher?.name || "Professor"}
        events={upcomingEvents}
        resources={resources}
        latestAnnouncement={latestAnnouncement}
        unreadCount={unreadCount || 0}
        history={history}
        markersByLesson={markersByLesson}
        homeworkTicks={homeworkTicks}
        movableLessons={movableLessons}
        moveStates={moveStates}
        isAdminPreview={Boolean(impersonatingId)}
        initialTab={initialTab}
      />
    </>
  )
}

// Helper to format time (HH:MM:SS -> h:mm AM/PM)
function formatTimeForDisplay(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
}
