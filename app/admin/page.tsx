import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import type { TodayLesson, StudentRoster, LessonWithStudent } from "@/components/admin/admin-dashboard"

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

  // Fetch scheduled lessons (future, including today and recent past to account for timezone)
  // We fetch starting from 7 days ago to cover any timezone offsets and ensuring "Today" is always included.

  const pastDate = new Date()
  pastDate.setDate(pastDate.getDate() - 7)
  const queryDate = pastDate.toISOString().split('T')[0]

  const { data: scheduledLessonsRaw } = await supabase
    .from("lessons")
    .select(`
            *,
            student:profiles!lessons_student_id_fkey(*)
        `)
    .eq("status", "scheduled")
    .gte("date", queryDate)
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

  // Sort students by lesson_day (Sunday -> Saturday, then others)
  const dayOrder: Record<string, number> = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  }

  students.sort((a, b) => {
    const dayA = a.lesson_day ? dayOrder[a.lesson_day] : 99
    const dayB = b.lesson_day ? dayOrder[b.lesson_day] : 99

    if (dayA !== dayB) {
      return dayA - dayB
    }
    // Secondary sort by name
    return (a.name || '').localeCompare(b.name || '')
  })

  // Count unread messages (messages where admin is recipient and is_read is false)
  const totalUnread = 0

  return (
    <AdminDashboard
      admin={profile}
      scheduledLessons={scheduledLessons}
      completedLessons={completedLessons}
      students={students}
      totalUnread={totalUnread}
    />
  )
}
