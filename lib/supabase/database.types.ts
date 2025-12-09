// Database types generated from schema.sql
// Run Supabase CLI for auto-generation: npx supabase gen types typescript

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    name: string | null
                    email: string | null
                    phone: string | null
                    role: 'student' | 'admin'
                    credits: number
                    credits_total: number
                    balance_due: number
                    zoom_link: string | null
                    stripe_customer_id: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    name?: string | null
                    email?: string | null
                    phone?: string | null
                    role?: 'student' | 'admin'
                    credits?: number
                    credits_total?: number
                    balance_due?: number
                    zoom_link?: string | null
                    stripe_customer_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string | null
                    email?: string | null
                    phone?: string | null
                    role?: 'student' | 'admin'
                    credits?: number
                    credits_total?: number
                    balance_due?: number
                    zoom_link?: string | null
                    stripe_customer_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            lessons: {
                Row: {
                    id: string
                    student_id: string
                    date: string
                    time: string
                    status: 'scheduled' | 'completed' | 'cancelled'
                    notes: string | null
                    video_url: string | null
                    sheet_music_url: string | null
                    duration: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    student_id: string
                    date: string
                    time: string
                    status?: 'scheduled' | 'completed' | 'cancelled'
                    notes?: string | null
                    video_url?: string | null
                    sheet_music_url?: string | null
                    duration?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    student_id?: string
                    date?: string
                    time?: string
                    status?: 'scheduled' | 'completed' | 'cancelled'
                    notes?: string | null
                    video_url?: string | null
                    sheet_music_url?: string | null
                    duration?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            messages: {
                Row: {
                    id: string
                    sender_id: string
                    recipient_id: string
                    content: string
                    is_read: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    sender_id: string
                    recipient_id: string
                    content: string
                    is_read?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    sender_id?: string
                    recipient_id?: string
                    content?: string
                    is_read?: boolean
                    created_at?: string
                }
            }
        }
    }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Lesson = Database['public']['Tables']['lessons']['Row']
export type Message = Database['public']['Tables']['messages']['Row']

// Extended types for UI components (matching mock-data structure)
export type StudentProfile = Profile & {
    next_lesson?: {
        date: string
        time: string
        duration: number
    }
}

export type LessonWithDetails = Lesson & {
    duration?: number
    teacher_notes?: string
    homework?: string
}
