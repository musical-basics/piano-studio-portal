import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AdminDashboard } from "@/components/admin-dashboard"
import type { TodayLesson, StudentRoster, LessonWithStudent } from "@/components/admin-dashboard"

export default async function AdminPage() {
  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/login")
  }

  // Fetch admin profile and verify role
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    console.error("Profile fetch error:", profileError)
    redirect("/login")
  }

  // Role check: Only admins can access this page
  if (profile.role !== 'admin') {
    redirect("/student")
  }

  // Fetch today's lessons with student profiles
  const today = new Date().toISOString().split('T')[0]

  const { data: todaysLessonsRaw, error: lessonsError } = await supabase
    .from("lessons")
    .select(`
            *,
            student:profiles!lessons_student_id_fkey(*)
        `)
    .eq("date", today)
    .eq("status", "scheduled")
    .order("time", { ascending: true })

  if (lessonsError) {
    console.error("Lessons fetch error:", lessonsError)
  }

  // Transform lessons data for the component
  const todaysLessons: TodayLesson[] = (todaysLessonsRaw || []).map(lesson => ({
    ...lesson,
    student: lesson.student
  }))

  // Fetch all scheduled lessons (future, including today)
  const { data: scheduledLessonsRaw } = await supabase
    .from("lessons")
    .select(`
            *,
            student:profiles!lessons_student_id_fkey(*)
        `)
    .eq("status", "scheduled")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("time", { ascending: true })

  const scheduledLessons: LessonWithStudent[] = (scheduledLessonsRaw || []).map(lesson => ({
    ...lesson,
    student: lesson.student
  }))

  // Fetch all completed lessons
  const { data: completedLessonsRaw } = await supabase
    .from("lessons")
    .select(`
            *,
            student:profiles!lessons_student_id_fkey(*)
        `)
    .eq("status", "completed")
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .limit(50)

  const completedLessons: LessonWithStudent[] = (completedLessonsRaw || []).map(lesson => ({
    ...lesson,
    student: lesson.student
  }))

  // Fetch all students (profiles with role = 'student')
  const { data: studentsRaw, error: studentsError } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "student")
    .order("name", { ascending: true })

  if (studentsError) {
    console.error("Students fetch error:", studentsError)
  }

  const students: StudentRoster[] = studentsRaw || []

  // Count unread messages (messages where admin is recipient and is_read is false)
  const totalUnread = 0

  return (
    <AdminDashboard
      admin={profile}
      todaysLessons={todaysLessons}
      scheduledLessons={scheduledLessons}
      completedLessons={completedLessons}
      students={students}
      totalUnread={totalUnread}
    />
  )
}
