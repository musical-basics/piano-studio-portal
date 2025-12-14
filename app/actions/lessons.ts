'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { LessonScheduledEmail } from '@/components/emails/lesson-scheduled-email'

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

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can log lessons' }
    }

    // Verify student exists and get credits
    const { data: student, error: studentError } = await supabase
        .from('profiles')
        .select('name, credits')
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

    console.log(`Lesson ${lessonId} deleted. Refund: ${shouldRefund}`)

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
        .select('student_id')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

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
        .select('id, name')
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

    // Create Zoom meeting (Best Effort)
    let zoomLink = null
    try {
        const { createZoomMeeting } = await import('@/lib/zoom')
        // Format start time for Zoom: "YYYY-MM-DDTHH:MM:SS"
        // Ensure date and time are clean
        const startDateTime = `${date}T${time}:00`
        zoomLink = await createZoomMeeting(
            `${student.name} - Piano Lesson`,
            startDateTime,
            duration
        )
        if (zoomLink) {
            console.log('Zoom meeting created:', zoomLink)
        }
    } catch (zoomError) {
        console.error('Failed to create Zoom meeting, proceeding without:', zoomError)
    }

    // Create the lesson - try with duration first
    let lesson = null
    let lessonError = null

    // Prepare insert payload logic
    const lessonPayload: any = {
        student_id: studentId,
        date,
        time,
        status: 'scheduled',
        zoom_link: zoomLink // Add zoom link
    }

    // We try to insert duration if the column exists (it's in Schema but check robustly)
    // The previous code had a retry block for duration, I will adapt it.

    const { data: lessonData, error: insertError } = await supabase
        .from('lessons')
        .insert({
            ...lessonPayload,
            duration
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
    if (resend && student.email) {
        try {
            // Get Admin Profile for studio name (or use default)
            const { data: adminProfile } = await supabase
                .from('profiles')
                .select('name, studio_name')
                .eq('id', user.id)
                .single()

            const studioName = adminProfile?.studio_name || 'Piano Studio'
            const adminName = adminProfile?.name || 'Teacher'

            // Email to Student
            await resend.emails.send({
                from: `${studioName} <notifications@updates.musicalbasics.com>`,
                to: student.email,
                subject: `Lesson Scheduled: ${date} at ${time}`,
                react: LessonScheduledEmail({
                    studentName: student.name || 'Student',
                    date,
                    time,
                    duration,
                    zoomLink,
                    recipientName: student.name || 'Student',
                    studioName
                })
            })

            // Email to Teacher (Confirmation)
            // We use user.email which is the admin's email since they are the one scheduling
            if (user.email) {
                await resend.emails.send({
                    from: `${studioName} <notifications@updates.musicalbasics.com>`,
                    to: user.email,
                    subject: `Lesson Scheduled: ${student.name} - ${date} ${time}`,
                    react: LessonScheduledEmail({
                        studentName: student.name || 'Student',
                        date,
                        time,
                        duration,
                        zoomLink,
                        recipientName: adminName,
                        studioName
                    })
                })
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

