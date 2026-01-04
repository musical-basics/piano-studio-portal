import type { Profile, Lesson } from "@/lib/supabase/database.types"

// Extends Lesson type to safely handle zoom_link until types are regenerated
export type LessonWithZoom = Lesson & { zoom_link?: string | null }

export type LessonWithStudent = LessonWithZoom & {
    student: Profile
}

export type TodayLesson = LessonWithZoom & {
    student: Profile
}

export type StudentRoster = Profile & {
    last_lesson_date?: string
    lesson_day?: string | null
    balance_due?: number
}

export type Inquiry = {
    id: string
    name: string
    email: string
    phone: string | null
    experience: string
    goals: string
    status: 'new' | 'contacted' | 'student' | 'archived'
    created_at: string
}
