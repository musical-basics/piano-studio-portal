'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export type MakeupSlot = {
    id: string
    start_time: string
    end_time: string
    is_taken: boolean
    taken_by_student_id: string | null
    taken_by_lesson_id: string | null
    // Formatted for UI
    day?: string
    date?: string
    time?: string
}

/**
 * Get available makeup slots
 */
export async function getAvailableMakeupSlots(limit: number = 5) {
    const supabase = await createClient()

    const now = new Date().toISOString()

    const { data, error } = await supabase
        .from('makeup_slots')
        .select('*')
        .eq('is_taken', false)
        .gt('start_time', now)
        .order('start_time', { ascending: true })
        .limit(limit)

    if (error) {
        console.error('Get makeup slots error:', error)
        return { slots: [] }
    }

    // Format slots for UI
    const formattedSlots: MakeupSlot[] = (data || []).map(slot => {
        const startDate = new Date(slot.start_time)
        return {
            ...slot,
            day: startDate.toLocaleDateString('en-US', { weekday: 'long' }),
            date: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            time: startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        }
    })

    return { slots: formattedSlots }
}

/**
 * Claim a makeup slot and reschedule a lesson
 * Uses admin client to bypass RLS for lesson update
 */
export async function claimMakeupSlot(slotId: string, lessonId: string) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Verify the lesson belongs to this student
    const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .eq('student_id', user.id)
        .single()

    if (lessonError || !lesson) {
        console.error('Lesson verification error:', lessonError)
        return { error: 'Lesson not found or unauthorized' }
    }

    // Get the makeup slot
    const { data: slot, error: slotError } = await supabase
        .from('makeup_slots')
        .select('*')
        .eq('id', slotId)
        .eq('is_taken', false)
        .single()

    if (slotError || !slot) {
        console.error('Slot fetch error:', slotError)
        return { error: 'Slot not available' }
    }

    // Create admin client to bypass RLS for updates
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    // Extract date and time from the slot's start_time (use local time, not UTC)
    const startTime = new Date(slot.start_time)

    // Format date as YYYY-MM-DD in local timezone
    const year = startTime.getFullYear()
    const month = String(startTime.getMonth() + 1).padStart(2, '0')
    const day = String(startTime.getDate()).padStart(2, '0')
    const newDate = `${year}-${month}-${day}`

    // Format time as HH:MM in local timezone
    const hours = String(startTime.getHours()).padStart(2, '0')
    const minutes = String(startTime.getMinutes()).padStart(2, '0')
    const newTime = `${hours}:${minutes}`

    console.log(`Rescheduling lesson ${lessonId} to ${newDate} at ${newTime}`)

    // Step 1: Update the lesson with new date/time (using admin client)
    const { data: updatedLesson, error: updateLessonError } = await supabaseAdmin
        .from('lessons')
        .update({
            date: newDate,
            time: newTime,
            status: 'scheduled',
            updated_at: new Date().toISOString()
        })
        .eq('id', lessonId)
        .select()
        .single()

    if (updateLessonError) {
        console.error('Update lesson error:', updateLessonError)
        return { error: 'Failed to reschedule lesson: ' + updateLessonError.message }
    }

    console.log('Lesson updated successfully:', updatedLesson)

    // Step 2: Mark the slot as taken (using admin client)
    const { error: updateSlotError } = await supabaseAdmin
        .from('makeup_slots')
        .update({
            is_taken: true,
            taken_by_student_id: user.id,
            taken_by_lesson_id: lessonId,
            updated_at: new Date().toISOString()
        })
        .eq('id', slotId)

    if (updateSlotError) {
        console.error('Update slot error:', updateSlotError)
        // Don't fail - lesson was already rescheduled
    }

    // Step 3: Revalidate paths to refresh UI
    revalidatePath('/student')
    revalidatePath('/admin')

    const formattedDate = startTime.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    })
    const formattedTime = startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    })

    return {
        success: true,
        message: `Lesson rescheduled to ${formattedDate} at ${formattedTime}`
    }
}

/**
 * Create a makeup slot (Admin only)
 */
export async function createMakeupSlot(startTime: string, endTime: string) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        return { error: 'Admin access required' }
    }

    const { error } = await supabase
        .from('makeup_slots')
        .insert({
            start_time: startTime,
            end_time: endTime
        })

    if (error) {
        console.error('Create slot error:', error)
        return { error: error.message }
    }

    revalidatePath('/admin')
    return { success: true }
}

/**
 * Delete a makeup slot (Admin only)
 */
export async function deleteMakeupSlot(slotId: string) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        return { error: 'Admin access required' }
    }

    const { error } = await supabase
        .from('makeup_slots')
        .delete()
        .eq('id', slotId)
        .eq('is_taken', false) // Can only delete unclaimed slots

    if (error) {
        console.error('Delete slot error:', error)
        return { error: error.message }
    }

    revalidatePath('/admin')
    return { success: true }
}
