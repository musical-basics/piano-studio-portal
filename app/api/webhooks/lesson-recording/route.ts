import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import RecordingReadyEmail from '@/components/emails/recording-ready-email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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
        .select('id, date, time, video_url')
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

        // Only notify on the FIRST time a recording is attached to this lesson.
        // A re-fired webhook (e.g. after MP4 conversion swaps the URL) won't re-email.
        const isFirstAttach = !lesson.video_url

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

        // 4. Notify the student that the recording is ready (fire-and-forget so a
        // mailer hiccup never fails the webhook or blocks the classroom app).
        if (isFirstAttach && resend) {
            void notifyRecordingReady(supabase, studentId, lesson.date)
        }

        return NextResponse.json({ success: true, lessonId: lesson.id })
    } else {
        console.log('[Webhook] No matching scheduled lesson found.')
        return NextResponse.json({ message: 'No lesson found' }, { status: 200 })
    }
}

// Email the student that their recording is available on the homepage.
// Mirrors the sender conventions used by the new-recordings cron and lesson emails.
async function notifyRecordingReady(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    studentId: string,
    lessonDate: string | null
) {
    try {
        if (!resend) return

        const { data: student } = await supabase
            .from('profiles')
            .select('name, email')
            .eq('id', studentId)
            .single()

        if (!student?.email) {
            console.log(`[Webhook] Student ${studentId} has no email; skipping notification.`)
            return
        }

        const { data: admin } = await supabase
            .from('profiles')
            .select('studio_name, email')
            .eq('role', 'admin')
            .limit(1)
            .single()

        const studioName = (admin?.studio_name as string) || 'Lionel Yu Piano Studio'
        const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/student`
            : 'https://studio.musicalbasics.com/student'

        const formattedDate = lessonDate
            ? new Date(`${lessonDate}T00:00:00`).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
              })
            : undefined

        const { error: emailError } = await resend.emails.send({
            from: `${studioName} <notifications@updates.musicalbasics.com>`,
            to: student.email as string,
            ...(admin?.email ? { replyTo: admin.email as string } : {}),
            subject: 'Your lesson recording is ready 🎹',
            react: RecordingReadyEmail({
                studentName: (student.name as string) || 'Student',
                lessonDate: formattedDate,
                dashboardUrl,
                studioName,
            }),
        })

        if (emailError) {
            console.error('[Webhook] Recording-ready email failed:', emailError)
        } else {
            console.log(`[Webhook] Recording-ready email sent to ${student.email}`)
        }
    } catch (err) {
        console.error('[Webhook] Recording-ready notification error (non-blocking):', err)
    }
}
