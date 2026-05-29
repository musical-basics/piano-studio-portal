'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type CreateFlagPayload = {
    studentId: string
    targetDate: string
    intent: 'skip_requested' | 'cancel_requested' | 'reschedule_requested' | 'schedule_requested' | 'other'
    sourceMessageId?: string | null
    note?: string
}

export async function createLessonIntentFlagAction(payload: CreateFlagPayload) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Verify admin
    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can create lesson intent flags' }
    }

    const { data, error } = await supabase
        .from('lesson_intent_flags')
        .insert({
            student_id: payload.studentId,
            target_date: payload.targetDate,
            intent: payload.intent,
            source_message_id: payload.sourceMessageId || null,
            source: 'admin',
            note: payload.note || null,
            status: 'active',
        })
        .select()
        .single()

    if (error) {
        console.error('createLessonIntentFlagAction error:', error)
        return { error: error.message }
    }

    revalidatePath('/admin')
    return { success: true, flag: data }
}

export async function getLessonIntentFlagsAction(studentId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin' && user.id !== studentId) {
        return { error: 'Unauthorized' }
    }

    const { data, error } = await supabase
        .from('lesson_intent_flags')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('getLessonIntentFlagsAction error:', error)
        return { error: error.message }
    }

    return { success: true, flags: data || [] }
}

export async function updateLessonIntentFlagStatusAction(
    flagId: string,
    status: 'active' | 'resolved' | 'dismissed',
    note?: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Verify admin
    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can update lesson intent flags' }
    }

    const updateFields: any = {
        status,
        updated_at: new Date().toISOString()
    }

    if (note !== undefined) {
        updateFields.note = note
    }

    if (status === 'resolved') {
        updateFields.resolved_at = new Date().toISOString()
        updateFields.resolved_by = user.id
    } else if (status === 'dismissed') {
        updateFields.dismissed_at = new Date().toISOString()
        updateFields.dismissed_by = user.id
    }

    const { data, error } = await supabase
        .from('lesson_intent_flags')
        .update(updateFields)
        .eq('id', flagId)
        .select()
        .single()

    if (error) {
        console.error('updateLessonIntentFlagStatusAction error:', error)
        return { error: error.message }
    }

    revalidatePath('/admin')
    return { success: true, flag: data }
}
