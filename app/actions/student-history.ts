'use server'

import { createClient } from '@/lib/supabase/server'

export async function getStudentLessonHistory(studentId: string) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    // Fetch the student's completed lessons, most recent first
    const { data: lessons, error } = await supabase
        .from('lessons')
        .select('id, date, time, duration, status, notes, credit_snapshot, credit_snapshot_before, video_url, sheet_music_url')
        .eq('student_id', studentId)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .limit(30)

    if (error) {
        console.error('getStudentLessonHistory error:', error)
        return { error: error.message }
    }

    return { lessons: lessons || [] }
}
