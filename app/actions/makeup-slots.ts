'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
        return { error: 'Slot not available' }
    }

    // Extract date and time from the slot's start_time
    const startTime = new Date(slot.start_time)
    const newDate = startTime.toISOString().split('T')[0]
    const newTime = startTime.toTimeString().split(' ')[0].slice(0, 5) // HH:MM format

    // Update the lesson with new date/time
    const { error: updateLessonError } = await supabase
        .from('lessons')
        .update({
            date: newDate,
            time: newTime,
            status: 'scheduled',
            updated_at: new Date().toISOString()
        })
        .eq('id', lessonId)

    if (updateLessonError) {
        console.error('Update lesson error:', updateLessonError)
        return { error: 'Failed to reschedule lesson' }
    }

    // Mark the slot as taken
    const { error: updateSlotError } = await supabase
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
