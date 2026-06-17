'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Additional recurring weekly lesson days for a student (beyond the primary slot
// in profiles.lesson_day). All operations are admin-only and use the service-role
// client, matching the pattern in app/actions/users.ts.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function admin() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

export async function getRecurringSlots(studentId: string) {
    if (!studentId) return { slots: [] }
    const { data, error } = await admin()
        .from('recurring_lesson_slots')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true })
    if (error) return { error: error.message, slots: [] }
    return { slots: data || [] }
}

export async function addRecurringSlot(studentId: string, dayOfWeek: string, time: string, duration: number) {
    if (!studentId) return { error: 'Missing student' }
    if (!DAYS.includes(dayOfWeek)) return { error: 'Invalid day of week' }
    if (!/^\d{2}:\d{2}$/.test(time)) return { error: 'Invalid time (expected HH:MM)' }
    if (![30, 45, 60].includes(duration)) return { error: 'Invalid duration' }

    const supabase = admin()
    // Avoid an exact duplicate of an existing additional slot.
    const { data: existing } = await supabase
        .from('recurring_lesson_slots')
        .select('id')
        .eq('student_id', studentId)
        .eq('day_of_week', dayOfWeek)
        .eq('time', time)
        .maybeSingle()
    if (existing) return { error: 'That recurring day/time already exists for this student.' }

    const { error } = await supabase
        .from('recurring_lesson_slots')
        .insert({ student_id: studentId, day_of_week: dayOfWeek, time, duration })
    if (error) return { error: error.message }

    revalidatePath('/admin')
    return { success: true }
}

export async function deleteRecurringSlot(slotId: string) {
    if (!slotId) return { error: 'Missing slot id' }
    const { error } = await admin().from('recurring_lesson_slots').delete().eq('id', slotId)
    if (error) return { error: error.message }
    revalidatePath('/admin')
    return { success: true }
}
