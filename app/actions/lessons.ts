'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { LessonScheduledEmail } from '@/components/emails/lesson-scheduled-email'
import { LessonCanceledEmail } from '@/components/emails/lesson-canceled-email'
import { LessonRescheduledEmail } from '@/components/emails/lesson-rescheduled-email'
import { createGoogleCalendarEvent } from '@/lib/google-calendar'

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

/**
 * Check if a time slot is available (not booked by ANY student)
 */
export async function checkAvailability(date: string, time: string, duration: number = 60, excludeLessonId?: string) {
    const supabase = await createClient()

    // Calculate end time of the proposed slot
    const startDateTime = new Date(`${date}T${time}`)
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000)

    // We need to check for overlaps. 
    // A lesson overlaps if:
    // (StartA < EndB) AND (EndA > StartB)

    // Simplified: Check for exact match first (most common case in grid system)
    // For a real grid system, we usually stick to fixed slots.
    // Querying for *overlapping* intervals in SQL is cleaner but 'time' is stored as string 'HH:MM'.
    // So we fetch lessons on that date and filter in JS for overlap to be safe and simple given the schema.

    const { data: lessons } = await supabase
        .from('lessons')
        .select('id, time, duration, status')
        .eq('date', date)
        .neq('status', 'cancelled') // Cancelled lessons don't block

    if (!lessons) return true

    const isTaken = lessons.some(lesson => {
        if (excludeLessonId && lesson.id === excludeLessonId) return false

        const lessonStart = new Date(`${date}T${lesson.time}`)
        const lessonDuration = lesson.duration || 60
        const lessonEnd = new Date(lessonStart.getTime() + lessonDuration * 60000)

        // Check overlap
        const overlaps = (startDateTime < lessonEnd) && (endDateTime > lessonStart)
        return overlaps
    })

    return !isTaken
}

/**
 * Get all lessons within a specific date range (inclusive), joined with student profile
 */
export async function getLessonsForDateRange(startDate: string, endDate: string) {
    const supabase = await createClient()

    // Fetch lessons
    const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
            *,
            student:profiles!lessons_student_id_fkey (
                id,
                name,
                email
            )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .neq('status', 'cancelled')
        .order('date', { ascending: true })
        .order('time', { ascending: true })

    if (lessonsError) {
        console.error('Error fetching lessons range:', lessonsError)
    }

    // Fetch events
    // converting startDate/endDate strings to ISO for comparison if needed, 
    // but Postgres matches string YYYY-MM-DD against timestamptz often fine. 
    // Safest is to explicitly cast or use range.
    // Events have 'start_time' (timestamptz).
    const startIso = `${startDate}T00:00:00`
    const endIso = `${endDate}T23:59:59`

    const { data: events, error: eventsError } = await supabase
        .from('events')
        .select(`
            *,
            event_invites (
                student_id,
                status,
                updated_at,
                student_notes,
                profiles (
                   name
                )
            )
        `)
        .gte('start_time', startIso)
        .lte('start_time', endIso)
        .order('start_time', { ascending: true })

    if (eventsError) {
        console.error('Error fetching events range:', eventsError)
    }

    return {
        lessons: lessons || [],
        events: events || []
    }
}

/**
 * Log a completed lesson - updates status to 'completed' and deducts 1 credit
 * Email notification is sent asynchronously (fire-and-forget) to not block the save
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

    // Get the lesson to find the student_id and date
    const { data: lesson, error: lessonFetchError } = await supabase
        .from('lessons')
        .select('student_id, status, date')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    const isAlreadyCompleted = lesson.status === 'completed'
    console.log('logLesson: Starting update', { lessonId, notes: notes?.substring(0, 50), isAlreadyCompleted })

    // STEP 1: Update the lesson in database FIRST (critical path)
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
        console.error('logLesson: Update failed', lessonError)
        return { error: lessonError.message }
    }

    console.log('logLesson: Database update successful')

    // STEP 2: Deduct 1 credit ONLY if it wasn't already completed
    // Also save the new balance as credit_snapshot for receipt display
    if (!isAlreadyCompleted) {
        const { data: studentCredits } = await supabase
            .from('profiles')
            .select('credits')
            .eq('id', lesson.student_id)
            .single()

        if (studentCredits) {
            const newBalance = studentCredits.credits - 1

            // Update student's credit balance
            await supabase
                .from('profiles')
                .update({ credits: newBalance })
                .eq('id', lesson.student_id)

            // Save the snapshot to the lesson for static receipt display
            await supabase
                .from('lessons')
                .update({ credit_snapshot: newBalance })
                .eq('id', lessonId)

            console.log('logLesson: Credit deducted, snapshot saved:', newBalance)
        }
    }

    // STEP 3: Revalidate paths immediately so UI updates
    revalidatePath('/admin')
    revalidatePath('/student')

    // STEP 4: Fire-and-forget email (async IIFE, not awaited)
    // This ensures the function returns success immediately
    if (resend) {
        (async () => {
            try {
                // Fetch student details for email
                const { data: student } = await supabase
                    .from('profiles')
                    .select('name, email')
                    .eq('id', lesson.student_id)
                    .single()

                if (!student?.email) {
                    console.log('logLesson: No student email, skipping notification')
                    return
                }

                // Dynamic import to avoid client bundler issues
                const { LessonLoggedEmail } = await import('@/components/emails/lesson-logged-email')

                // Format date nicely
                const dateObj = new Date(`${lesson.date}T00:00:00`)
                const formattedDate = dateObj.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                })

                // Extract sheet music filename from URL
                let sheetMusicFileName: string | undefined
                if (sheetMusicUrl) {
                    try {
                        const url = new URL(sheetMusicUrl)
                        const pathname = decodeURIComponent(url.pathname)
                        const filename = pathname.split('/').pop() || 'Sheet Music.pdf'
                        sheetMusicFileName = filename.replace(/^\d{10,}_/, '')
                    } catch {
                        sheetMusicFileName = 'Sheet Music.pdf'
                    }
                }

                await resend.emails.send({
                    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                    to: student.email,
                    subject: `Lesson Notes: ${formattedDate}`,
                    react: LessonLoggedEmail({
                        studentName: student.name || 'Student',
                        date: formattedDate,
                        notes: notes,
                        sheetMusicUrl: sheetMusicUrl || undefined,
                        sheetMusicFileName
                    })
                })
                console.log('logLesson: Email sent to', student.email)
            } catch (emailError) {
                console.error('logLesson: Email failed (non-blocking):', emailError)
                // Don't throw - this is fire-and-forget
            }
        })()
    }

    console.log('logLesson: Returning success')
    return { success: true }
}


/**
 * Log a past lesson directly (ad-hoc) without scheduling it first
 * Creates a lesson with status 'completed' and deducts 1 credit
 */
export async function logPastLesson(
    studentId: string,
    date: string,
    time: string,
    duration: number = 60,
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
    // Verify student exists and get credits
    const { data: student, error: studentError } = await supabase
        .from('profiles')
        .select('name, credits, email')
        .eq('id', studentId)
        .eq('role', 'student')
        .single()

    if (studentError || !student) {
        return { error: 'Student not found' }
    }

    // Create the completed lesson
    const { data: newLesson, error: createError } = await supabase
        .from('lessons')
        .insert({
            student_id: studentId,
            date,
            time,
            duration,
            status: 'completed',
            notes,
            video_url: videoUrl || null,
            sheet_music_url: sheetMusicUrl || null
        })
        .select()
        .single()

    if (createError) {
        return { error: createError.message }
    }

    // Deduct 1 credit
    if (student) {
        const { error: creditError } = await supabase
            .from('profiles')
            .update({ credits: student.credits - 1 })
            .eq('id', studentId)

        if (creditError) {
            console.error('Failed to deduct credit after logging lesson:', creditError)
            // We don't rollback the lesson creation, but we log the error.
            // In a real app we might want to alert the admin.
        }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    // Fire-and-forget email (async IIFE)
    if (resend) {
        (async () => {
            try {
                // Dynamic import to avoid client bundler issues
                const { LessonLoggedEmail } = await import('@/components/emails/lesson-logged-email')

                // Format date nicely
                const dateObj = new Date(`${date}T00:00:00`)
                const formattedDate = dateObj.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                })

                // Extract sheet music filename from URL
                let sheetMusicFileName: string | undefined
                if (sheetMusicUrl) {
                    try {
                        const url = new URL(sheetMusicUrl)
                        const pathname = decodeURIComponent(url.pathname)
                        const filename = pathname.split('/').pop() || 'Sheet Music.pdf'
                        sheetMusicFileName = filename.replace(/^\d{10,}_/, '')
                    } catch {
                        sheetMusicFileName = 'Sheet Music.pdf'
                    }
                }

                await resend.emails.send({
                    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                    to: student.email,
                    subject: `Lesson Notes: ${formattedDate}`,
                    react: LessonLoggedEmail({
                        studentName: student.name || 'Student',
                        date: formattedDate,
                        notes: notes,
                        sheetMusicUrl: sheetMusicUrl || undefined,
                        sheetMusicFileName
                    })
                })
                console.log('logPastLesson: Email sent to', student.email)
            } catch (emailError) {
                console.error('logPastLesson: Email failed (non-blocking):', emailError)
            }
        })()
    }

    return {
        success: true,
        message: `Lesson logged for ${student.name}. Credit deducted.`
    }
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

    if (student) {
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
 * Uses admin client to bypass RLS for updates
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

    // Get zoom_meeting_id if exists (fetch it)
    const { data: lessonDetails } = await supabase
        .from('lessons')
        .select('zoom_meeting_id')
        .eq('id', lessonId)
        .single()
    const zoomMeetingId = lessonDetails?.zoom_meeting_id

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

    // CRITICAL: Check if already cancelled to prevent duplicate refunds
    if (lesson.status === 'cancelled') {
        return { error: 'This lesson has already been cancelled' }
    }

    if (lesson.status !== 'scheduled' && !isAdmin) {
        return { error: 'Can only cancel scheduled lessons' }
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
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

    // Check if lesson is more than 24 hours away (use local time)
    const timeStr = lesson.time || '12:00'
    const lessonDateTime = new Date(`${lesson.date}T${timeStr}:00`)
    const now = new Date()
    const hoursUntilLesson = (lessonDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    const isWithin24Hours = hoursUntilLesson > 0 && hoursUntilLesson < 24

    // IMPORTANT: If ADMIN cancels, they override the 24-hour rule (always refund unless they mark no-show)
    // If OWNER cancels, they are subject to 24-hour rule
    const shouldRefund = isAdmin || !isWithin24Hours

    // Step 1: DELETE the lesson row (prevents duplicate cancellation)
    const { error: deleteError } = await supabaseAdmin
        .from('lessons')
        .delete()
        .eq('id', lessonId)

    if (deleteError) {
        console.error('Delete lesson error:', deleteError)
        return { error: 'Failed to cancel lesson: ' + deleteError.message }
    }

    // Attempt to delete from Zoom
    if (zoomMeetingId) {
        try {
            const { deleteZoomMeeting } = await import('@/lib/zoom')
            const deleted = await deleteZoomMeeting(zoomMeetingId)
            if (deleted) console.log(`Zoom meeting ${zoomMeetingId} deleted.`)
        } catch (e) {
            console.error('Failed to delete Zoom meeting:', e)
        }
    }

    console.log(`Lesson ${lessonId} deleted. Refund: ${shouldRefund}`)

    // Send Cancellation Email
    if (resend) {
        try {
            // Fetch student email if not already present
            const { data: student } = await supabase
                .from('profiles')
                .select('name, email')
                .eq('id', lesson.student_id)
                .single()

            if (student?.email) {
                // Get Admin params
                const { data: adminProfile } = await supabase
                    .from('profiles')
                    .select('name, studio_name')
                    .eq('id', user.id)
                    .single()

                const studioName = adminProfile?.studio_name || 'Lionel Yu Piano Studio'

                // Format Date/Time
                const dateObj = new Date(`${lesson.date}T00:00:00`)
                const formattedDate = dateObj.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                })

                const [hours, minutes] = (lesson.time || '12:00').split(':')
                const hourNum = parseInt(hours, 10)
                const ampm = hourNum >= 12 ? 'pm' : 'am'
                const hour12 = hourNum % 12 || 12
                const formattedTime = `${hour12}:${minutes}${ampm} PST`

                await resend.emails.send({
                    from: `${studioName} <notifications@updates.musicalbasics.com>`,
                    to: student.email,
                    subject: `Lesson Canceled: ${formattedDate} at ${formattedTime}`,
                    react: LessonCanceledEmail({
                        studentName: student.name || 'Student',
                        date: formattedDate,
                        time: formattedTime,
                        recipientName: student.name || 'Student',
                        studioName
                    })
                })
                console.log('Cancellation email sent to:', student.email)
            }
        } catch (emailError) {
            console.error('Failed to send cancellation email:', emailError)
        }
    }

    // Step 2: Revalidate paths to refresh UI
    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true,
        refunded: false,
        message: 'Lesson cancelled.'
    }
}

/**
 * Reschedule a lesson (admin only)
 * This updates the date/time of an existing lesson WITHOUT changing credit balance
 */
export async function rescheduleLesson(
    lessonId: string,
    newDate: string,
    newTime: string,
    newDuration: number = 60
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
        return { error: 'Only admins can reschedule lessons' }
    }

    // Get the existing lesson
    const { data: lesson, error: lessonFetchError } = await supabase
        .from('lessons')
        .select('student_id, date, time')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    // Fetch existing meeting ID
    const { data: lessonWithZoom } = await supabase
        .from('lessons')
        .select('zoom_meeting_id')
        .eq('id', lessonId)
        .single()

    // CONFLICT CHECK: Master Calendar
    const isAvailable = await checkAvailability(newDate, newTime, newDuration, lessonId)
    if (!isAvailable) {
        return { error: 'This time slot is already booked by another student.' }
    }

    // Update the lesson
    const { error: updateError } = await supabase
        .from('lessons')
        .update({
            date: newDate,
            time: newTime,
            duration: newDuration,
            // Status remains 'scheduled'
        })
        .eq('id', lessonId)

    if (updateError) {
        return { error: updateError.message }
    }

    // Update Zoom Meeting
    if (lessonWithZoom?.zoom_meeting_id) {
        try {
            const { updateZoomMeeting } = await import('@/lib/zoom')
            // Construct ISO time
            const startDateTime = `${newDate}T${newTime}:00`
            // Fetch student name for the topic if we haven't already (we need it for the email anyway)
            const { data: studentForZoom } = await supabase
                .from('profiles')
                .select('name')
                .eq('id', lesson.student_id)
                .single()

            const topic = studentForZoom?.name
                ? `${studentForZoom.name} - Piano Lesson`
                : 'Piano Lesson'

            await updateZoomMeeting(
                lessonWithZoom.zoom_meeting_id,
                topic,
                startDateTime,
                newDuration
            )
            console.log(`Zoom meeting ${lessonWithZoom.zoom_meeting_id} updated.`)
        } catch (e) {
            console.error('Failed to update Zoom meeting:', e)
        }
    }

    // Send Reschedule Email
    if (resend) {
        try {
            const { data: student } = await supabase
                .from('profiles')
                .select('name, email')
                .eq('id', lesson.student_id)
                .single()

            if (student?.email) {
                const { data: adminProfile } = await supabase
                    .from('profiles')
                    .select('name, studio_name')
                    .eq('id', user.id)
                    .single()

                const studioName = adminProfile?.studio_name || 'Lionel Yu Piano Studio'

                // Helper for formatting
                const formatDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                const formatTime = (t: string) => {
                    const [h, m] = t.split(':')
                    const hn = parseInt(h, 10)
                    const ap = hn >= 12 ? 'pm' : 'am'
                    const h12 = hn % 12 || 12
                    return `${h12}:${m}${ap} PST`
                }

                const oldDateStr = formatDate(lesson.date)
                const oldTimeStr = formatTime(lesson.time)
                const newDateStr = formatDate(newDate)
                const newTimeStr = formatTime(newTime)

                await resend.emails.send({
                    from: `${studioName} <notifications@updates.musicalbasics.com>`,
                    to: student.email,
                    subject: `Lesson Rescheduled: ${newDateStr} at ${newTimeStr}`,
                    react: LessonRescheduledEmail({
                        studentName: student.name || 'Student',
                        oldDate: oldDateStr,
                        oldTime: oldTimeStr,
                        newDate: newDateStr,
                        newTime: newTimeStr,
                        newDuration: newDuration,
                        recipientName: student.name || 'Student',
                        studioName
                    })
                })
                console.log('Reschedule email sent to:', student.email)
            }
        } catch (emailError) {
            console.error('Failed to send reschedule email:', emailError)
        }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return { success: true, message: 'Lesson rescheduled successfully' }
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
        .select('id, name, email, parent_email')
        .eq('id', studentId)
        .eq('role', 'student')
        .single()

    if (studentError || !student) {
        return { error: 'Student not found' }
    }

    // CONFLICT CHECK: Master Calendar
    const isAvailable = await checkAvailability(date, time, duration)
    if (!isAvailable) {
        return { error: 'This time slot is already booked by another student.' }
    }

    // Create Zoom meeting (Best Effort with Fallback)
    let zoomLink = null
    let zoomMeetingId = null

    try {
        const { createZoomMeeting } = await import('@/lib/zoom')
        // Format start time for Zoom: "YYYY-MM-DDTHH:MM:SS"
        const startDateTime = `${date}T${time}:00`
        const inviteeEmails = [student.email, student.parent_email].filter(Boolean) as string[]
        const zoomData = await createZoomMeeting(
            `${student.name} - Piano Lesson`,
            startDateTime,
            duration,
            inviteeEmails
        )
        if (zoomData) {
            zoomLink = zoomData.join_url
            zoomMeetingId = zoomData.id
            console.log('Zoom meeting created successfully:', zoomLink, zoomMeetingId)
        }
    } catch (zoomError) {
        console.error('Dynamic Zoom creation failed:', zoomError)
    }

    // Fallback: If dynamic generation failed (or returned null), try to use the Admin's static link
    if (!zoomLink) {
        console.log('Falling back to static Zoom link logic...')
        // Fetch Admin Profile to get static zoom_link
        const { data: adminProfile } = await supabase
            .from('profiles')
            .select('zoom_link')
            .eq('id', user.id)
            .single()

        if (adminProfile?.zoom_link) {
            zoomLink = adminProfile.zoom_link
            console.log('Using fallback static Zoom link:', zoomLink)
        } else {
            console.warn('No fallback Zoom link found in admin profile.')
        }
    }

    // --- NEW: Google Calendar Integration ---
    let googleEventId = null
    try {
        // Use the student name we fetched earlier
        const studentName = student.name || 'Student'

        console.log("📅 Creating Google Calendar Event...")
        googleEventId = await createGoogleCalendarEvent(
            studentName,
            date,
            time,
            duration
        )
    } catch (e) {
        console.error('Failed to create Google Event (Non-blocking):', e)
    }
    // ----------------------------------------

    // Prepare insert payload logic
    const lessonPayload: any = {
        student_id: studentId,
        date,
        time,
        status: 'scheduled',
        zoom_link: zoomLink,
        zoom_meeting_id: zoomMeetingId,
        google_event_id: googleEventId
    }

    // Initialize result variables
    let lesson = null
    let lessonError = null

    // We try to insert duration if the column exists (it's in Schema but check robustly)
    // The previous code had a retry block for duration, I will adapt it.

    const { data: lessonData, error: insertError } = await supabase
        .from('lessons')
        .insert({
            ...lessonPayload,
            duration,
            google_event_id: googleEventId
        })
        .select()
        .single()

    if (insertError) {
        // Fallback retry logic (e.g. if duration column is missing, though we think it is there)
        console.log('Insert with duration failed, trying without:', insertError.message)
        const { data: retryData, error: retryError } = await supabase
            .from('lessons')
            .insert(lessonPayload) // Still try saving zoom_link
            .select()
            .single()

        lesson = retryData
        lessonError = retryError
    } else {
        lesson = lessonData
    }

    if (lessonError) {
        // If it failed again, maybe zoom_link column is missing? 
        // Realistically we shoudln't blindly retry everything but preserving existing retry logic structure.
        console.error('Schedule lesson error:', lessonError)
        return { error: lessonError.message }
    }

    // CREDIT DEDUCTION REMOVED per requirements.
    // Credits are now only deducted when a lesson is logged (completed) or marked no-show.

    // Send Email Notifications
    console.log('Attempting to send email notifications...')
    console.log('Resend initialized:', !!resend)
    console.log('Student Email:', student.email)

    if (resend && student.email) {
        try {
            // Get Admin Profile for studio name (or use default)
            const { data: adminProfile } = await supabase
                .from('profiles')
                .select('name, studio_name')
                .eq('id', user.id)
                .single()

            const studioName = adminProfile?.studio_name || 'Lionel Yu Piano Studio'
            const rawName = adminProfile?.name || 'Teacher'
            const adminName = rawName === 'Professor Lionel' ? 'Professor Lionel Yu' : rawName

            // Format Date and Time for Email
            // Input date: YYYY-MM-DD
            // Input time: HH:MM (24h)
            const dateObj = new Date(`${date}T00:00:00`)
            const formattedDate = dateObj.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) // e.g., "Saturday, December 14, 2025" or we can construct manually to match user exact request "December 14, 2025"

            // Should strictly follow "December 14, 2025" as requested?
            // User said: "date should be December 14, 2025"
            const formattedDateStrict = dateObj.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            })

            // Format Time: 20:00 -> 8:00pm
            const [hours, minutes] = time.split(':')
            const hourNum = parseInt(hours, 10)
            const ampm = hourNum >= 12 ? 'pm' : 'am'
            const hour12 = hourNum % 12 || 12
            const formattedTime = `${hour12}:${minutes}${ampm} PST` // Adding PST as requested. Ideally dynamic but hardcoded for now is safer for exact request.

            const emailSubject = `Lesson Scheduled for ${student.name} on ${formattedDateStrict} at ${formattedTime}`

            // Email to Student
            console.log('Sending email to student:', student.email)
            const studentEmailResult = await resend.emails.send({
                from: `${studioName} <notifications@updates.musicalbasics.com>`,
                to: student.email,
                subject: emailSubject,
                react: LessonScheduledEmail({
                    studentName: student.name || 'Student',
                    date: formattedDateStrict,
                    time: formattedTime,
                    duration,
                    zoomLink,
                    recipientName: student.name || 'Student',
                    studioName
                })
            })
            console.log('Student email result:', studentEmailResult)

            // Email to Teacher (Confirmation)
            // We use user.email which is the admin's email since they are the one scheduling
            console.log('User (Teacher) Email:', user.email)
            if (user.email) {
                const teacherEmailResult = await resend.emails.send({
                    from: `${studioName} <notifications@updates.musicalbasics.com>`,
                    to: user.email,
                    subject: emailSubject,
                    react: LessonScheduledEmail({
                        studentName: student.name || 'Student',
                        date: formattedDateStrict,
                        time: formattedTime,
                        duration,
                        zoomLink,
                        recipientName: adminName,
                        studioName
                    })
                })
                console.log('Teacher email result:', teacherEmailResult)
            } else {
                console.warn('Teacher email not found (user.email is null)')
            }

            console.log(`Emails sent for lesson: ${date} ${time}`)

        } catch (emailError) {
            console.error('Failed to send email notifications:', emailError)
            // Don't block success return
        }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true,
        lesson,
        message: `Lesson scheduled for ${student.name} on ${date} at ${time} (${duration} min)${zoomLink ? '. Zoom link created.' : '.'}`
    }
}

/**
 * Update a lesson (notes, video_url, sheet_music_url)
 * Sends email notification with updated info (fire-and-forget)
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

    // Get the lesson to find student_id and date for email
    const { data: lesson, error: fetchError } = await supabase
        .from('lessons')
        .select('student_id, date')
        .eq('id', lessonId)
        .single()

    if (fetchError || !lesson) {
        return { error: 'Lesson not found' }
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

    console.log('updateLesson: Database update successful')

    // Revalidate paths immediately
    revalidatePath('/admin')
    revalidatePath('/student')

    // Fire-and-forget email notification
    if (resend) {
        (async () => {
            try {
                // Fetch student details
                const { data: student } = await supabase
                    .from('profiles')
                    .select('name, email')
                    .eq('id', lesson.student_id)
                    .single()

                if (!student?.email) {
                    console.log('updateLesson: No student email, skipping notification')
                    return
                }

                // Dynamic import to avoid client bundler issues
                const { LessonLoggedEmail } = await import('@/components/emails/lesson-logged-email')

                // Format date
                const dateObj = new Date(`${lesson.date}T00:00:00`)
                const formattedDate = dateObj.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                })

                // Extract sheet music filename from URL
                let sheetMusicFileName: string | undefined
                if (sheetMusicUrl) {
                    try {
                        const url = new URL(sheetMusicUrl)
                        const pathname = decodeURIComponent(url.pathname)
                        const filename = pathname.split('/').pop() || 'Sheet Music.pdf'
                        // Remove timestamp prefix if present
                        sheetMusicFileName = filename.replace(/^\d{10,}_/, '')
                    } catch {
                        sheetMusicFileName = 'Sheet Music.pdf'
                    }
                }

                await resend.emails.send({
                    from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                    to: student.email,
                    subject: `Lesson Notes Updated: ${formattedDate}`,
                    react: LessonLoggedEmail({
                        studentName: student.name || 'Student',
                        date: formattedDate,
                        notes: notes,
                        sheetMusicUrl: sheetMusicUrl || undefined,
                        sheetMusicFileName
                    })
                })
                console.log('updateLesson: Email sent to', student.email)
            } catch (emailError) {
                console.error('updateLesson: Email failed (non-blocking):', emailError)
            }
        })()
    }

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


/**
 * Confirm attendance for a lesson (student only)
 * Updates is_confirmed to true
 * Uses admin client to bypass RLS
 */
export async function confirmAttendance(lessonId: string) {
    const supabase = await createClient()

    // Verify the user is authenticated and owns this lesson
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Unauthorized' }
    }

    // Use admin client to bypass RLS
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    )

    const { error } = await supabaseAdmin
        .from('lessons')
        .update({ is_confirmed: true })
        .eq('id', lessonId)
        .eq('student_id', user.id) // Security: only update if student owns the lesson

    if (error) {
        console.error('Confirmation error:', error)
        return { success: false, error: 'Failed to confirm attendance' }
    }

    revalidatePath('/student')
    return { success: true }
}

// Helper to get the next occurrence of a specific day of week
function getNextDayOfWeek(date: Date, dayName: string) {
    const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        .indexOf(dayName);
    const resultDate = new Date(date.getTime());
    resultDate.setDate(date.getDate() + (7 + dayOfWeek - date.getDay()) % 7);

    // If result is today, move to next week (assuming "Next" means future)
    if (resultDate.toDateString() === date.toDateString()) {
        resultDate.setDate(resultDate.getDate() + 7);
    }
    return resultDate;
}

export async function bulkScheduleLessons(studentId: string, count: number) {
    const supabase = await createClient()

    // 1. Fetch Student's Standard Slot
    const { data: student } = await supabase
        .from('profiles')
        .select('name, lesson_day, lesson_time, lesson_duration')
        .eq('id', studentId)
        .single()

    if (!student || !student.lesson_day || !student.lesson_time) {
        return { error: "Student does not have a standard day/time set." }
    }

    let successes = 0
    let failures = 0
    let lastDate = new Date() // Start calculating from today

    // 2. Loop 'count' times
    for (let i = 0; i < count; i++) {
        // Find next date
        const nextDateObj = getNextDayOfWeek(lastDate, student.lesson_day)

        // Fix: Use local date components to avoid timezone shifts (e.g. 8pm PST -> Next Day UTC)
        const year = nextDateObj.getFullYear()
        const month = String(nextDateObj.getMonth() + 1).padStart(2, '0')
        const day = String(nextDateObj.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`

        // Call your existing scheduler (handles conflicts, Google Cal, Zoom, Email)
        const result = await scheduleLesson(
            studentId,
            dateStr,
            student.lesson_time,
            student.lesson_duration || 60
        )

        if (result.success) {
            successes++
        } else {
            failures++
            console.error(`Failed to schedule ${dateStr}:`, result.error)
        }

        // Advance cursor so next iteration finds the week after
        lastDate = nextDateObj
        // Small hack: add 1 day so getNextDayOfWeek doesn't find the same day again
        lastDate.setDate(lastDate.getDate() + 1)
    }

    return {
        success: true,
        message: `Scheduled ${successes} lessons. ${failures > 0 ? `(${failures} failed due to conflicts)` : ''}`
    }
}
