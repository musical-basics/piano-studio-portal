import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: Request) {
    const secret = req.headers.get('x-webhook-secret')

    // Simple security check
    if (secret !== process.env.PIANO_STUDIO_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { studentId, recordingUrl, recordedAt } = await req.json()

    // 1. Find the Scheduled Lesson for TODAY
    // We look for a lesson that started within the last 24 hours
    // and belongs to this student.
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // NOTE: You might need to adjust this query based on your exact schema
    const { data: lesson, error } = await supabase
        .from('lessons')
        .select('id, status')
        .eq('student_id', studentId)
        .gte('start_time', today.toISOString())
        .limit(1)
        .single()

    if (error) {
        console.log(`[Webhook] Query error (may just mean no lesson found): ${error.message}`)
    }

    if (lesson) {
        // 2a. Found a lesson! Attach the URL.
        await supabase
            .from('lessons')
            .update({
                recording_url: recordingUrl,
                // Optional: If you want to auto-mark it as "Needs Logging"
                // status: lesson.status === 'scheduled' ? 'needs_log' : lesson.status
            })
            .eq('id', lesson.id)

        console.log(`[Webhook] Attached recording to lesson ${lesson.id}`)
    } else {
        // 2b. No lesson scheduled?
        // Create a "Draft" or "Unmatched Recording" record so you don't lose it.
        await supabase.from('unmatched_recordings').insert({
            student_id: studentId,
            url: recordingUrl,
            created_at: recordedAt
        })
        console.log(`[Webhook] No lesson found for ${studentId}, saved to unmatched queue.`)
    }

    return NextResponse.json({ success: true })
}
