// Database types generated from schema.sql
// Run Supabase CLI for auto-generation: npx supabase gen types typescript

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

// Message attachment type for chat attachments
export type MessageAttachment = {
    type: 'image' | 'file'
    url: string
    name: string
    size: number
}

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
                    available_hours: Json | null
                    timezone: string | null
                    studio_name: string | null
                    parent_email: string | null
                    public_id: string | null
                    status: 'active' | 'inactive' | null
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
                    available_hours?: Json | null
                    timezone?: string | null
                    studio_name?: string | null
                    public_id?: string | null
                    status?: 'active' | 'inactive' | null
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
                    available_hours?: Json | null
                    timezone?: string | null
                    studio_name?: string | null
                    public_id?: string | null
                    status?: 'active' | 'inactive' | null
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
                    is_confirmed: boolean
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
                    is_confirmed?: boolean
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
                    is_confirmed?: boolean
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
                    attachments: MessageAttachment[] | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    sender_id: string
                    recipient_id: string
                    content: string
                    is_read?: boolean
                    attachments?: MessageAttachment[] | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    sender_id?: string
                    recipient_id?: string
                    content?: string
                    is_read?: boolean
                    attachments?: MessageAttachment[] | null
                    created_at?: string
                }
            }
            pricing_tiers: {
                Row: {
                    duration: number
                    single_price: number
                    pack_price: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    duration: number
                    single_price: number
                    pack_price: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    duration?: number
                    single_price?: number
                    pack_price?: number
                    created_at?: string
                    updated_at?: string
                }
            }
        }
    }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row'] & {
    lesson_duration?: number
}
export type Lesson = Database['public']['Tables']['lessons']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type PricingTier = Database['public']['Tables']['pricing_tiers']['Row']

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

