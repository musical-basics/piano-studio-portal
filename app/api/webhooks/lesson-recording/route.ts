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

    // 1. Find the next active lesson for this student
    // "Loose" logic: grab the earliest scheduled/logging lesson regardless of exact hour/day
    const { data: lesson } = await supabase
        .from('lessons')
        .select('id')
        .eq('student_id', studentId)
        .in('status', ['scheduled', 'logging'])
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(1)
        .single()

    if (lesson) {
        // 2a. Found it! Update the correct column 'video_url'
        await supabase
            .from('lessons')
            .update({
                video_url: recordingUrl,
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
