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
        .select('student_id')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
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
    const { error: creditError } = await supabase.rpc('deduct_credit', {
        student_id: lesson.student_id
    })

    // If RPC doesn't exist, try direct update
    if (creditError) {
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
    }

    revalidatePath('/admin')
    return { success: true }
}

/**
 * Mark a lesson as no-show - updates status and deducts 1 credit without refund
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
        .select('student_id')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    // Update the lesson status to cancelled (treating no-show as cancelled)
    const { error: lessonError } = await supabase
        .from('lessons')
        .update({
            status: 'cancelled',
            notes: 'Marked as No-Show by teacher'
        })
        .eq('id', lessonId)

    if (lessonError) {
        return { error: lessonError.message }
    }

    // Deduct 1 credit from the student (no refund for no-show)
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
    return { success: true }
}
