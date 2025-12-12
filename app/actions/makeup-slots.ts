'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { checkAvailability } from '@/app/actions/lessons'

export type MakeupSlot = {
    id: string
    start_time: string
    end_time: string
    available: boolean
    // Formatted for UI
    day?: string
    date?: string
    time?: string
}

/**
 * Get available makeup slots dynamically based on teacher's master calendar
 */
export async function getAvailableMakeupSlots(limit: number = 5) {
    const supabase = await createClient()

    // 1. Get the admin profile to find available_hours
    // Assuming single admin for now or we just pick the first one with role 'admin'
    // In a multi-teacher app, we'd need to know WHICH teacher.
    // For this prototype, we'll fetch the first admin profile.

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('available_hours, timezone')
        .eq('role', 'admin')
        .limit(1)
        .single()

    if (!adminProfile || !adminProfile.available_hours) {
        // Fallback or empty if no admin/config found
        return { slots: [] }
    }

    const availabilityConfig = adminProfile.available_hours as any[]
    const slots: MakeupSlot[] = []

    // 2. Generate candidates for the next 14 days
    const today = new Date()
    const daysToCheck = 14
    let count = 0

    // Loop through days
    for (let i = 1; i <= daysToCheck; i++) {
        if (slots.length >= limit) break

        const currentDay = new Date(today)
        currentDay.setDate(today.getDate() + i)

        const dayName = currentDay.toLocaleDateString('en-US', { weekday: 'long' })
        const config = availabilityConfig.find(c => c.day === dayName && c.enabled)

        if (config) {
            // Day is enabled, generating fixed slots (e.g. every 60 mins)
            // Using simple logic: Start at config.start, increment by 60 mins until config.end
            const [startHour, startMin] = config.start.split(':').map(Number)
            const [endHour, endMin] = config.end.split(':').map(Number)

            let timeDate = new Date(currentDay)
            timeDate.setHours(startHour, startMin, 0, 0)

            const endTimeDate = new Date(currentDay)
            endTimeDate.setHours(endHour, endMin, 0, 0)

            while (timeDate < endTimeDate) {
                if (slots.length >= limit) break

                // Format "YYYY-MM-DD" and "HH:MM"
                const dateStr = timeDate.toISOString().split('T')[0] // Careful with timezone, using simplified
                // For proper timezone handling, we should construct strings carefully.
                // Assuming server time / simple date math for prototype:
                const year = timeDate.getFullYear()
                const month = String(timeDate.getMonth() + 1).padStart(2, '0')
                const day = String(timeDate.getDate()).padStart(2, '0')
                const dateParam = `${year}-${month}-${day}`

                const hour = String(timeDate.getHours()).padStart(2, '0')
                const minute = String(timeDate.getMinutes()).padStart(2, '0')
                const timeParam = `${hour}:${minute}`

                // 3. CHECK MASTER CALENDAR availability
                const isFree = await checkAvailability(dateParam, timeParam, 60) // assuming 60m slots

                if (isFree) {
                    // Create synthetic ID: "YYYY-MM-DD_HH:MM"
                    const slotId = `${dateParam}_${timeParam}`

                    slots.push({
                        id: slotId,
                        start_time: timeDate.toISOString(), // ISO string for sorting/parsing
                        end_time: new Date(timeDate.getTime() + 60 * 60000).toISOString(),
                        available: true,
                        day: dayName,
                        date: timeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        time: timeDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    })
                }

                // Increment by 60 mins
                timeDate.setHours(timeDate.getHours() + 1)
            }
        }
    }

    return { slots }
}

/**
 * Claim a makeup slot and reschedule a lesson
 * Expects slotId to be "YYYY-MM-DD_HH:MM"
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

    // Parse the synthetic ID
    // Format: "YYYY-MM-DD_HH:MM"
    const [date, time] = slotId.split('_')
    if (!date || !time) {
        return { error: 'Invalid slot ID' }
    }

    // Verify availability one last time (Race Condition check)
    const isFree = await checkAvailability(date, time, 60, lessonId) // exclude current lesson (though usually we are MOVING it to a NEW time)
    // Actually, if we are rescheduling, we are moving the pointer.
    // checkAvailability excludes 'cancelled' lessons.
    // The current lesson status is 'scheduled' or 'cancelled'.
    // If it's 'scheduled', we technically check if `date` and `time` are taken.
    // If we are moving to a NEW time, we just check that NEW time.
    // ExcludeLessonId helps if we are keeping the SAME time (which is not rescheduling).

    if (!isFree) {
        return { error: 'This slot is no longer available. Please choose another.' }
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

    console.log(`Rescheduling lesson ${lessonId} to ${date} at ${time}`)

    // Update the lesson with new date/time
    const { data: updatedLesson, error: updateLessonError } = await supabaseAdmin
        .from('lessons')
        .update({
            date: date,
            time: time,
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

    // Revalidate paths to refresh UI
    revalidatePath('/student')
    revalidatePath('/admin')

    const dateObj = new Date(`${date}T${time}:00`)
    const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    })
    const formattedTime = dateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    })

    return {
        success: true,
        message: `Lesson rescheduled to ${formattedDate} at ${formattedTime}`
    }
}

// Deprecated: createMakeupSlot, deleteMakeupSlot
// These are no longer needed with the dynamic system but kept empty to avoid breaking imports if any.
export async function createMakeupSlot(startTime: string, endTime: string) {
    return { error: 'Deprecated: Slots are now generated dynamically.' }
}
export async function deleteMakeupSlot(slotId: string) {
    return { error: 'Deprecated: Slots are now generated dynamically.' }
}
