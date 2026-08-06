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
    lesson_time?: string | null
    balance_due?: number
}

// Calendar event (consultation, recital, ...) surfaced on the admin Today view.
export type AdminTodayEvent = {
    id: string
    title: string
    description: string | null
    start_time: string
    duration: number | null
    duration_minutes: number | null
    location_type: 'virtual' | 'physical' | null
    location_details: string | null
}

export type Inquiry = {
    id: string
    name: string
    email: string
    phone: string | null
    experience: string
    goals: string
    // CRM lead status, e.g. 'Lead' | 'Contacted' | 'Prospect' | 'Student' | 'Archived'
    status: string
    created_at: string
}
