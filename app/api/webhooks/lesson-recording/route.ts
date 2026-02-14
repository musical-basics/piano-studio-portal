import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
    // 1. Initialize "God Mode" Client — bypasses all RLS policies
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    const secret = req.headers.get('x-webhook-secret')

    if (secret !== process.env.PIANO_STUDIO_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { studentId, recordingUrl } = await req.json()

    console.log(`[Webhook] Searching for lesson for student: ${studentId}`)

    // 2. Find the lesson — filter to yesterday+ so we don't match stale old lessons
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const { data: lesson, error } = await supabase
        .from('lessons')
        .select('id, date, time')
        .eq('student_id', studentId)
        .in('status', ['scheduled', 'logging'])
        .gte('date', yesterday.toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(1)
        .single()

    if (error) {
        console.error('[Webhook] Database error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (lesson) {
        console.log(`[Webhook] Found lesson ${lesson.id} on ${lesson.date}. Attaching video...`)

        // 3. Update the Video URL
        const { error: updateError } = await supabase
            .from('lessons')
            .update({
                video_url: recordingUrl
            })
            .eq('id', lesson.id)

        if (updateError) {
            console.error('[Webhook] Update failed:', updateError)
            return NextResponse.json({ error: 'Update failed' }, { status: 500 })
        }

        return NextResponse.json({ success: true, lessonId: lesson.id })
    } else {
        console.log('[Webhook] No matching scheduled lesson found.')
        return NextResponse.json({ message: 'No lesson found' }, { status: 200 })
    }
}
