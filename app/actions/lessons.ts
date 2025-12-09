'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Log a completed lesson - updates status to 'completed' and deducts 1 credit
 */
export async function logLesson(
    lessonId: string,
    notes: string,
    videoUrl?: string,
    sheetMusicUrl?: string
) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can log lessons' }
    }

    // Get the lesson to find the student_id
    const { data: lesson, error: lessonFetchError } = await supabase
        .from('lessons')
        .select('student_id, status')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    if (lesson.status === 'completed') {
        return { error: 'Lesson already completed' }
    }

    // Update the lesson
    const { error: lessonError } = await supabase
        .from('lessons')
        .update({
            status: 'completed',
            notes,
            video_url: videoUrl || null,
            sheet_music_url: sheetMusicUrl || null
        })
        .eq('id', lessonId)

    if (lessonError) {
        return { error: lessonError.message }
    }

    // Deduct 1 credit from the student
    const { data: student } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', lesson.student_id)
        .single()

    if (student && student.credits > 0) {
        await supabase
            .from('profiles')
            .update({ credits: student.credits - 1 })
            .eq('id', lesson.student_id)
    }

    revalidatePath('/admin')
    revalidatePath('/student')
    return { success: true }
}

/**
 * Mark a lesson as no-show - updates status and deducts 1 credit (penalty)
 */
export async function markNoShow(lessonId: string) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can mark no-shows' }
    }

    // Get the lesson to find the student_id
    const { data: lesson, error: lessonFetchError } = await supabase
        .from('lessons')
        .select('student_id, status')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    if (lesson.status !== 'scheduled') {
        return { error: 'Can only mark scheduled lessons as no-show' }
    }

    // Update the lesson status
    const { error: lessonError } = await supabase
        .from('lessons')
        .update({
            status: 'cancelled',
            notes: 'Marked as No-Show by teacher. Credit forfeited.'
        })
        .eq('id', lessonId)

    if (lessonError) {
        return { error: lessonError.message }
    }

    // Deduct 1 credit from the student (penalty - no refund)
    const { data: student } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', lesson.student_id)
        .single()

    if (student && student.credits > 0) {
        await supabase
            .from('profiles')
            .update({ credits: student.credits - 1 })
            .eq('id', lesson.student_id)
    }

    revalidatePath('/admin')
    revalidatePath('/student')
    return { success: true }
}

/**
 * Cancel a lesson - refunds credit only if cancelled >24 hours in advance
 */
export async function cancelLesson(lessonId: string) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Get the lesson
    const { data: lesson, error: lessonFetchError } = await supabase
        .from('lessons')
        .select('student_id, date, time, status')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    // Verify user owns this lesson or is admin
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    const isAdmin = profile?.role === 'admin'
    const isOwner = lesson.student_id === user.id

    if (!isAdmin && !isOwner) {
        return { error: 'You can only cancel your own lessons' }
    }

    if (lesson.status !== 'scheduled') {
        return { error: 'Can only cancel scheduled lessons' }
    }

    // Check if lesson is more than 24 hours away
    const lessonDateTime = new Date(`${lesson.date}T${lesson.time}`)
    const now = new Date()
    const hoursUntilLesson = (lessonDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    const isWithin24Hours = hoursUntilLesson < 24

    // Update the lesson status
    const { error: lessonError } = await supabase
        .from('lessons')
        .update({
            status: 'cancelled',
            notes: isWithin24Hours
                ? 'Cancelled within 24 hours. Credit forfeited per cancellation policy.'
                : 'Cancelled by student. Credit refunded.'
        })
        .eq('id', lessonId)

    if (lessonError) {
        return { error: lessonError.message }
    }

    // Only refund credit if cancelled more than 24 hours in advance
    if (!isWithin24Hours) {
        const { data: student } = await supabase
            .from('profiles')
            .select('credits, credits_total')
            .eq('id', lesson.student_id)
            .single()

        if (student) {
            await supabase
                .from('profiles')
                .update({ credits: student.credits + 1 })
                .eq('id', lesson.student_id)
        }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true,
        refunded: !isWithin24Hours,
        message: isWithin24Hours
            ? 'Lesson cancelled. Credit forfeited due to 24-hour policy.'
            : 'Lesson cancelled. Credit has been refunded.'
    }
}

/**
 * Purchase credits (mock - no Stripe integration for testing)
 */
export async function purchaseCredits(credits: number) {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Get current profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits, credits_total')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
        return { error: 'Profile not found' }
    }

    // Add credits
    const newCredits = profile.credits + credits
    const newTotal = profile.credits_total + credits

    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            credits: newCredits,
            credits_total: newTotal
        })
        .eq('id', user.id)

    if (updateError) {
        return { error: updateError.message }
    }

    revalidatePath('/student')
    revalidatePath('/admin')

    return {
        success: true,
        newCredits,
        message: `Successfully added ${credits} credit${credits > 1 ? 's' : ''} to your account!`
    }
}

/**
 * Schedule a new lesson (admin only)
 */
export async function scheduleLesson(
    studentId: string,
    date: string,
    time: string,
    duration: number = 60
) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can schedule lessons' }
    }

    // Verify student exists
    const { data: student, error: studentError } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('id', studentId)
        .eq('role', 'student')
        .single()

    if (studentError || !student) {
        return { error: 'Student not found' }
    }

    // Create the lesson - try with duration first
    let lesson = null
    let lessonError = null

    const { data: lessonData, error: insertError } = await supabase
        .from('lessons')
        .insert({
            student_id: studentId,
            date,
            time,
            duration,
            status: 'scheduled'
        })
        .select()
        .single()

    if (insertError) {
        // If duration column doesn't exist, try without it
        console.log('Insert with duration failed, trying without:', insertError.message)
        const { data: retryData, error: retryError } = await supabase
            .from('lessons')
            .insert({
                student_id: studentId,
                date,
                time,
                status: 'scheduled'
            })
            .select()
            .single()

        lesson = retryData
        lessonError = retryError
    } else {
        lesson = lessonData
    }

    if (lessonError) {
        console.error('Schedule lesson error:', lessonError)
        return { error: lessonError.message }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true,
        lesson,
        message: `Lesson scheduled for ${student.name} on ${date} at ${time} (${duration} min)`
    }
}

/**
 * Update a lesson (notes, video_url, sheet_music_url)
 */
export async function updateLesson(
    lessonId: string,
    notes: string,
    videoUrl?: string,
    sheetMusicUrl?: string
) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can update lessons' }
    }

    // Update the lesson
    const { error: lessonError } = await supabase
        .from('lessons')
        .update({
            notes,
            video_url: videoUrl || null,
            sheet_music_url: sheetMusicUrl || null
        })
        .eq('id', lessonId)

    if (lessonError) {
        return { error: lessonError.message }
    }

    revalidatePath('/admin')
    revalidatePath('/student')
    return { success: true, message: 'Lesson updated successfully' }
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(formData: FormData) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can upload files' }
    }

    const file = formData.get('file') as File
    if (!file) {
        return { error: 'No file provided' }
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `lesson-materials/${fileName}`

    const { data, error } = await supabase.storage
        .from('lesson-materials')
        .upload(filePath, file)

    if (error) {
        console.error('Upload error:', error)
        return { error: error.message }
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('lesson-materials')
        .getPublicUrl(filePath)

    return { success: true, url: publicUrl, path: data.path }
}

