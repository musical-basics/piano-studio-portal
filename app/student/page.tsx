import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { StudentDashboard } from "@/components/student-dashboard"

export default async function StudentPage() {
  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/login")
  }

  // Fetch profile data
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    console.error("Profile fetch error:", profileError)
    redirect("/login")
  }

  // Fetch teacher/admin profile for default Zoom link
  const { data: teacher } = await supabase
    .from("profiles")
    .select("zoom_link")
    .eq("role", "admin")
    .limit(1)
    .single()

  // Fetch lessons for this student
  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("*")
    .eq("student_id", user.id)
    .order("date", { ascending: false })

  if (lessonsError) {
    console.error("Lessons fetch error:", lessonsError)
  }

  // Find next scheduled lesson
  const today = new Date().toISOString().split('T')[0]
  const upcomingLessons = (lessons || [])
    .filter(l => l.status === 'scheduled' && l.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const nextScheduledLesson = upcomingLessons[0]

  // Format next lesson for UI
  const nextLesson = nextScheduledLesson ? {
    id: nextScheduledLesson.id,
    date: nextScheduledLesson.date,
    time: formatTimeForDisplay(nextScheduledLesson.time),
    duration: nextScheduledLesson.duration || 60,
    rawTime: nextScheduledLesson.time
  } : null

  // Determine Zoom link: lesson-specific > student's profile > teacher's default
  const zoomLink = nextScheduledLesson?.zoom_link || profile.zoom_link || teacher?.zoom_link || null

  // Format today's date for display
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <StudentDashboard
      profile={profile}
      lessons={lessons || []}
      nextLesson={nextLesson}
      zoomLink={zoomLink}
      todayDate={todayFormatted}
    />
  )
}

// Helper to format time (HH:MM:SS -> h:mm AM/PM)
function formatTimeForDisplay(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

