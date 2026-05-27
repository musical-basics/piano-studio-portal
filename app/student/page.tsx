import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { StudentDashboard } from "@/components/student/student-dashboard"
import { getStudentEvents } from "@/app/actions/events"
import { getStudentResources } from "@/app/actions/resources"
import { getLatestAnnouncement } from "@/app/actions/announcements"
import { getImpersonationTarget } from "@/app/actions/impersonate"
import { ImpersonationBanner } from "@/components/admin/impersonation-banner"

export default async function StudentPage() {
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
