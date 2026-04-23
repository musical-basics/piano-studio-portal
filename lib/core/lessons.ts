import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { LessonScheduledEmail } from '@/components/emails/lesson-scheduled-email'
import { LessonCanceledEmail } from '@/components/emails/lesson-canceled-email'
import { LessonRescheduledEmail } from '@/components/emails/lesson-rescheduled-email'
import { createGoogleCalendarEvent } from '@/lib/google-calendar'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

function formatDateLong(date: string) {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
}

function formatTimePst(time: string) {
    const [h, m] = time.split(':')
    const hn = parseInt(h, 10)
    const ap = hn >= 12 ? 'pm' : 'am'
    const h12 = hn % 12 || 12
    return `${h12}:${m}${ap} PST`
}

export async function checkAvailabilityCore(
    client: DbClient,
    date: string,
    time: string,
    duration: number = 60,
    excludeLessonId?: string,
) {
    const startDateTime = new Date(`${date}T${time}`)
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000)

    const { data: lessons } = await client
        .from('lessons')
        .select('id, time, duration, status')
        .eq('date', date)
        .neq('status', 'cancelled')

    if (!lessons) return true

    const isTaken = lessons.some((lesson) => {
        if (excludeLessonId && lesson.id === excludeLessonId) return false
        const lessonStart = new Date(`${date}T${lesson.time}`)
        const lessonDuration = lesson.duration || 60
        const lessonEnd = new Date(lessonStart.getTime() + lessonDuration * 60000)
        return startDateTime < lessonEnd && endDateTime > lessonStart
    })

    return !isTaken
}

export async function listLessonsCore(
    client: DbClient,
    startDate: string,
    endDate: string,
    studentId?: string,
) {
    let query = client
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

    if (studentId) {
        query = query.eq('student_id', studentId)
    }

    const { data: lessons, error: lessonsError } = await query
    if (lessonsError) console.error('listLessonsCore lessons error:', lessonsError)

    const startIso = `${startDate}T00:00:00`
    const endIso = `${endDate}T23:59:59`

    const { data: events, error: eventsError } = await client
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

    if (eventsError) console.error('listLessonsCore events error:', eventsError)

    return {
        lessons: lessons || [],
        events: events || [],
    }
}

export type ScheduleLessonArgs = {
    client: DbClient
    adminId: string
    studentId: string
    date: string
    time: string
    duration?: number
}

export async function scheduleLessonCore({
    client,
    adminId,
    studentId,
    date,
    time,
    duration = 60,
}: ScheduleLessonArgs) {
    const { data: student, error: studentError } = await client
        .from('profiles')
        .select('id, name, email, parent_email')
        .eq('id', studentId)
        .eq('role', 'student')
        .single()

    if (studentError || !student) {
        return { error: 'Student not found' }
    }

    const isAvailable = await checkAvailabilityCore(client, date, time, duration)
    if (!isAvailable) {
        return { error: 'This time slot is already booked by another student.' }
    }

    let zoomLink: string | null = null
    let zoomMeetingId: string | null = null

    try {
        const { createZoomMeeting } = await import('@/lib/zoom')
        const startDateTime = `${date}T${time}:00`
        const inviteeEmails = [student.email, (student as any).parent_email].filter(Boolean) as string[]
        const zoomData = await createZoomMeeting(
            `${student.name} - Piano Lesson`,
            startDateTime,
            duration,
            inviteeEmails,
        )
        if (zoomData) {
            zoomLink = zoomData.join_url
            zoomMeetingId = zoomData.id
        }
    } catch (zoomError) {
        console.error('scheduleLessonCore: Zoom creation failed:', zoomError)
    }

    if (!zoomLink) {
        const { data: adminProfile } = await client
            .from('profiles')
            .select('zoom_link')
            .eq('id', adminId)
            .single()
        if ((adminProfile as any)?.zoom_link) {
            zoomLink = (adminProfile as any).zoom_link
        }
    }

    let googleEventId: string | null = null
    try {
        googleEventId = (await createGoogleCalendarEvent(student.name || 'Student', date, time, duration)) ?? null
    } catch (e) {
        console.error('scheduleLessonCore: Google Calendar failed (non-blocking):', e)
    }

    const lessonPayload: any = {
        student_id: studentId,
        date,
        time,
        status: 'scheduled',
        zoom_link: zoomLink,
        zoom_meeting_id: zoomMeetingId,
        google_event_id: googleEventId,
    }

    let lesson: any = null
    const { data: lessonData, error: insertError } = await client
        .from('lessons')
        .insert({ ...lessonPayload, duration })
        .select()
        .single()

    if (insertError) {
        console.log('scheduleLessonCore: insert with duration failed, retrying without:', insertError.message)
        const { data: retryData, error: retryError } = await client
            .from('lessons')
            .insert(lessonPayload)
            .select()
            .single()
        if (retryError) {
            console.error('scheduleLessonCore: insert failed:', retryError)
            return { error: retryError.message }
        }
        lesson = retryData
    } else {
        lesson = lessonData
    }

    if (resend && student.email) {
        try {
            const { data: adminProfile } = await client
                .from('profiles')
                .select('name, email, studio_name')
                .eq('id', adminId)
                .single()

            const studioName = adminProfile?.studio_name || 'Lionel Yu Piano Studio'
            const rawName = adminProfile?.name || 'Teacher'
            const adminName = rawName === 'Professor Lionel' ? 'Professor Lionel Yu' : rawName

            const formattedDate = formatDateLong(date)
            const formattedTime = formatTimePst(time)
            const emailSubject = `Lesson Scheduled for ${student.name} on ${formattedDate} at ${formattedTime}`

            await resend.emails.send({
                from: `${studioName} <notifications@updates.musicalbasics.com>`,
                to: student.email,
                subject: emailSubject,
                react: LessonScheduledEmail({
                    studentName: student.name || 'Student',
                    date: formattedDate,
                    time: formattedTime,
                    duration,
                    zoomLink,
                    recipientName: student.name || 'Student',
                    studioName,
                }),
            })

            if (adminProfile?.email) {
                await resend.emails.send({
                    from: `${studioName} <notifications@updates.musicalbasics.com>`,
                    to: adminProfile.email,
                    subject: emailSubject,
                    react: LessonScheduledEmail({
                        studentName: student.name || 'Student',
                        date: formattedDate,
                        time: formattedTime,
                        duration,
                        zoomLink,
                        recipientName: adminName,
                        studioName,
                    }),
                })
            }
        } catch (emailError) {
            console.error('scheduleLessonCore: email notifications failed (non-blocking):', emailError)
        }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true as const,
        lesson,
        message: `Lesson scheduled for ${student.name} on ${date} at ${time} (${duration} min)${zoomLink ? '. Zoom link created.' : '.'}`,
    }
}

export type RescheduleLessonArgs = {
    client: DbClient
    adminId: string
    lessonId: string
    newDate: string
    newTime: string
    newDuration?: number
}

export async function rescheduleLessonCore({
    client,
    adminId,
    lessonId,
    newDate,
    newTime,
    newDuration = 60,
}: RescheduleLessonArgs) {
    const { data: lesson, error: lessonFetchError } = await client
        .from('lessons')
        .select('student_id, date, time, zoom_meeting_id')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    const isAvailable = await checkAvailabilityCore(client, newDate, newTime, newDuration, lessonId)
    if (!isAvailable) {
        return { error: 'This time slot is already booked by another student.' }
    }

    const { error: updateError } = await client
        .from('lessons')
        .update({
            date: newDate,
            time: newTime,
            duration: newDuration,
        })
        .eq('id', lessonId)

    if (updateError) {
        return { error: updateError.message }
    }

    const zoomMeetingId = (lesson as any).zoom_meeting_id
    if (zoomMeetingId) {
        try {
            const { updateZoomMeeting } = await import('@/lib/zoom')
            const startDateTime = `${newDate}T${newTime}:00`
            const { data: studentForZoom } = await client
                .from('profiles')
                .select('name')
                .eq('id', lesson.student_id)
                .single()
            const topic = studentForZoom?.name ? `${studentForZoom.name} - Piano Lesson` : 'Piano Lesson'
            await updateZoomMeeting(zoomMeetingId, topic, startDateTime, newDuration)
        } catch (e) {
            console.error('rescheduleLessonCore: Zoom update failed (non-blocking):', e)
        }
    }

    if (resend) {
        try {
            const { data: student } = await client
                .from('profiles')
                .select('name, email')
                .eq('id', lesson.student_id)
                .single()

            if (student?.email) {
                const { data: adminProfile } = await client
                    .from('profiles')
                    .select('name, studio_name')
                    .eq('id', adminId)
                    .single()

                const studioName = adminProfile?.studio_name || 'Lionel Yu Piano Studio'
                const oldDateStr = formatDateLong(lesson.date)
                const oldTimeStr = formatTimePst(lesson.time)
                const newDateStr = formatDateLong(newDate)
                const newTimeStr = formatTimePst(newTime)

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
                        newDuration,
                        recipientName: student.name || 'Student',
                        studioName,
                    }),
                })
            }
        } catch (emailError) {
            console.error('rescheduleLessonCore: email failed (non-blocking):', emailError)
        }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return { success: true as const, message: 'Lesson rescheduled successfully' }
}

export type CancelLessonArgs = {
    client: DbClient
    actorId: string
    actorRole: 'admin' | 'student'
    lessonId: string
}

export async function cancelLessonCore({ client, actorId, actorRole, lessonId }: CancelLessonArgs) {
    const { data: lesson, error: lessonFetchError } = await client
        .from('lessons')
        .select('student_id, date, time, status, zoom_meeting_id')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    const isAdmin = actorRole === 'admin'
    const isOwner = lesson.student_id === actorId

    if (!isAdmin && !isOwner) {
        return { error: 'You can only cancel your own lessons' }
    }

    if (lesson.status === 'cancelled') {
        return { error: 'This lesson has already been cancelled' }
    }

    if (lesson.status !== 'scheduled' && !isAdmin) {
        return { error: 'Can only cancel scheduled lessons' }
    }

    const supabaseAdmin = createAdminClient()

    const { error: deleteError } = await supabaseAdmin
        .from('lessons')
        .delete()
        .eq('id', lessonId)

    if (deleteError) {
        console.error('cancelLessonCore: delete error:', deleteError)
        return { error: 'Failed to cancel lesson: ' + deleteError.message }
    }

    const zoomMeetingId = (lesson as any).zoom_meeting_id
    if (zoomMeetingId) {
        try {
            const { deleteZoomMeeting } = await import('@/lib/zoom')
            await deleteZoomMeeting(zoomMeetingId)
        } catch (e) {
            console.error('cancelLessonCore: Zoom delete failed (non-blocking):', e)
        }
    }

    if (resend) {
        try {
            const { data: student } = await client
                .from('profiles')
                .select('name, email')
                .eq('id', lesson.student_id)
                .single()

            if (student?.email) {
                const { data: adminProfile } = await client
                    .from('profiles')
                    .select('name, studio_name')
                    .eq('id', actorId)
                    .single()

                const studioName = adminProfile?.studio_name || 'Lionel Yu Piano Studio'
                const formattedDate = formatDateLong(lesson.date)
                const formattedTime = formatTimePst(lesson.time)

                await resend.emails.send({
                    from: `${studioName} <notifications@updates.musicalbasics.com>`,
                    to: student.email,
                    subject: `Lesson Canceled: ${formattedDate} at ${formattedTime}`,
                    react: LessonCanceledEmail({
                        studentName: student.name || 'Student',
                        date: formattedDate,
                        time: formattedTime,
                        recipientName: student.name || 'Student',
                        studioName,
                    }),
                })
            }
        } catch (emailError) {
            console.error('cancelLessonCore: email failed (non-blocking):', emailError)
        }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true as const,
        refunded: false,
        message: 'Lesson cancelled.',
    }
}
