import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { addDays, format } from 'date-fns'
import { studioNow } from '@/lib/studio-timezone'
import { LessonScheduledEmail } from '@/components/emails/lesson-scheduled-email'
import { LessonCanceledEmail } from '@/components/emails/lesson-canceled-email'
import { LessonCanceledAdminEmail } from '@/components/emails/lesson-canceled-admin-email'
import { LessonRescheduledEmail } from '@/components/emails/lesson-rescheduled-email'
import { LessonLoggedEmail } from '@/components/emails/lesson-logged-email'
import { createGoogleCalendarEvent } from '@/lib/google-calendar'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { sendMessageCore } from '@/lib/core/messages'
import { LATE_CANCEL_FEE, isLateCancellation } from '@/lib/billing-policy'

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

function formatDateWithWeekday(date: string) {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
}

function sheetMusicFileName(sheetMusicUrl?: string | null) {
    if (!sheetMusicUrl) return undefined

    try {
        const url = new URL(sheetMusicUrl)
        const pathname = decodeURIComponent(url.pathname)
        const filename = pathname.split('/').pop() || 'Sheet Music.pdf'
        return filename.replace(/^\d{10,}_/, '')
    } catch {
        return 'Sheet Music.pdf'
    }
}

async function sendAutoScheduledLessonEmail({
    client,
    adminId,
    studentId,
    date,
    time,
    duration,
    zoomLink,
}: {
    client: DbClient
    adminId: string
    studentId: string
    date: string
    time: string
    duration: number
    zoomLink?: string | null
}) {
    if (!resend) return

    try {
        const { data: student } = await client
            .from('profiles')
            .select('name, email')
            .eq('id', studentId)
            .single()

        if (!student?.email) return

        const { data: adminData } = await client
            .from('profiles')
            .select('name, email, studio_name')
            .eq('id', adminId)
            .single()

        const studioName = adminData?.studio_name || 'Lionel Yu Piano Studio'
        const adminName = adminData?.name === 'Professor Lionel'
            ? 'Professor Lionel Yu'
            : (adminData?.name || 'Teacher')

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
                zoomLink: zoomLink || null,
                recipientName: student.name || 'Student',
                studioName,
            }),
        })

        if (adminData?.email) {
            await resend.emails.send({
                from: `${studioName} <notifications@updates.musicalbasics.com>`,
                to: adminData.email,
                subject: emailSubject,
                react: LessonScheduledEmail({
                    studentName: student.name || 'Student',
                    date: formattedDate,
                    time: formattedTime,
                    duration,
                    zoomLink: zoomLink || null,
                    recipientName: adminName,
                    studioName,
                }),
            })
        }
    } catch (emailErr) {
        console.error('sendAutoScheduledLessonEmail failed (non-blocking):', emailErr)
    }
}

async function sendLessonLoggedEmail({
    client,
    studentId,
    date,
    notes,
    sheetMusicUrl,
}: {
    client: DbClient
    studentId: string
    date: string
    notes: string
    sheetMusicUrl?: string | null
}) {
    if (!resend) return

    try {
        const { data: student } = await client
            .from('profiles')
            .select('name, email')
            .eq('id', studentId)
            .single()

        if (!student?.email) {
            console.log('sendLessonLoggedEmail: No student email, skipping notification')
            return
        }

        const formattedDate = formatDateWithWeekday(date)

        await resend.emails.send({
            from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
            to: student.email,
            subject: `Lesson Notes: ${formattedDate}`,
            react: LessonLoggedEmail({
                studentName: student.name || 'Student',
                date: formattedDate,
                notes,
                sheetMusicUrl: sheetMusicUrl || undefined,
                sheetMusicFileName: sheetMusicFileName(sheetMusicUrl),
            }),
        })
    } catch (emailError) {
        console.error('sendLessonLoggedEmail failed (non-blocking):', emailError)
    }
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

export type LogLessonArgs = {
    client: DbClient
    adminId: string
    lessonId: string
    notes: string
    videoUrl?: string
    sheetMusicUrl?: string
    awaitNotifications?: boolean
    completedSource?: 'agent_log' | 'zoom_webhook' | 'admin_ui' | 'system'
}

export async function logLessonCore({
    client,
    adminId,
    lessonId,
    notes,
    videoUrl,
    sheetMusicUrl,
    awaitNotifications = false,
    completedSource = 'agent_log',
}: LogLessonArgs) {
    const { data: lesson, error: lessonFetchError } = await client
        .from('lessons')
        .select('student_id, status, date, time, duration, zoom_link, credit_snapshot_before, credit_snapshot')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    // Three possible states:
    //   1. status = 'scheduled'                              → normal flow, deduct + snapshot
    //   2. status = 'completed' AND snapshots are present    → true no-op, already charged
    //   3. status = 'completed' AND snapshots are null       → Zoom webhook completed it
    //      without going through the credit path; repair needed
    const isAlreadyCompleted = lesson.status === 'completed'
    const hasSnapshots =
        lesson.credit_snapshot_before !== null ||
        lesson.credit_snapshot !== null
    const needsCredit = !isAlreadyCompleted || (isAlreadyCompleted && !hasSnapshots)

    const { data: loggedLesson, error: lessonError } = await client
        .from('lessons')
        .update({
            status: 'completed',
            notes,
            video_url: videoUrl || null,
            sheet_music_url: sheetMusicUrl || null,
            completed_source: completedSource,
        })
        .eq('id', lessonId)
        .select()
        .single()

    if (lessonError) {
        console.error('logLessonCore: update failed', lessonError)
        return { error: lessonError.message }
    }

    let previousCredits: number | null = null
    let newCredits: number | null = null
    let creditDeducted = false

    const creditRepaired = isAlreadyCompleted && !hasSnapshots

    if (needsCredit) {
        const { data: studentCredits, error: studentCreditsError } = await client
            .from('profiles')
            .select('credits')
            .eq('id', lesson.student_id)
            .single()

        if (studentCreditsError || !studentCredits) {
            console.error('logLessonCore: failed to fetch credits:', studentCreditsError)
            return { error: 'Failed to fetch student credits' }
        }

        const startingCredits = Number(studentCredits.credits ?? 0)
        previousCredits = startingCredits
        newCredits = startingCredits - 1

        const { error: creditError } = await client
            .from('profiles')
            .update({ credits: newCredits })
            .eq('id', lesson.student_id)

        if (creditError) {
            console.error('logLessonCore: failed to deduct credit:', creditError)
            return { error: 'Failed to deduct student credit: ' + creditError.message }
        }

        creditDeducted = true

        const { error: snapshotError } = await client
            .from('lessons')
            .update({
                credit_snapshot_before: previousCredits,
                credit_snapshot: newCredits,
            })
            .eq('id', lessonId)

        if (snapshotError) {
            console.error('logLessonCore: failed to save credit snapshot:', snapshotError)
        }

        if (loggedLesson) {
            loggedLesson.credit_snapshot_before = previousCredits
            loggedLesson.credit_snapshot = newCredits
        }
    }

    let nextLesson: any = null
    const notificationTasks: Promise<void>[] = []

    if (!isAlreadyCompleted && !creditRepaired && lesson.date && lesson.time) {
        try {
            const currentLessonDate = new Date(`${lesson.date}T00:00:00`)
            const nextWeekDate = addDays(currentLessonDate, 7)
            const nextWeekDateStr = format(nextWeekDate, 'yyyy-MM-dd')

            const { data: existingLesson } = await client
                .from('lessons')
                .select('id')
                .eq('student_id', lesson.student_id)
                .eq('date', nextWeekDateStr)
                .neq('status', 'cancelled')
                .maybeSingle()

            if (!existingLesson) {
                const { data: createdLesson, error: createError } = await client
                    .from('lessons')
                    .insert({
                        student_id: lesson.student_id,
                        date: nextWeekDateStr,
                        time: lesson.time,
                        duration: lesson.duration || 60,
                        status: 'scheduled',
                        zoom_link: lesson.zoom_link || null,
                    })
                    .select()
                    .single()

                if (createError) {
                    console.error('logLessonCore: Auto-create next lesson failed:', createError)
                } else {
                    nextLesson = createdLesson
                    notificationTasks.push(sendAutoScheduledLessonEmail({
                        client,
                        adminId,
                        studentId: lesson.student_id,
                        date: nextWeekDateStr,
                        time: lesson.time,
                        duration: lesson.duration || 60,
                        zoomLink: lesson.zoom_link || null,
                    }))
                }
            }
        } catch (autoCreateError) {
            console.error('logLessonCore: Auto-create next lesson error:', autoCreateError)
        }
    }

    notificationTasks.push(sendLessonLoggedEmail({
        client,
        studentId: lesson.student_id,
        date: lesson.date,
        notes,
        sheetMusicUrl: sheetMusicUrl || null,
    }))

    if (awaitNotifications) {
        await Promise.all(notificationTasks)
    } else {
        notificationTasks.forEach((task) => void task)
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true as const,
        lesson: loggedLesson,
        next_lesson: nextLesson,
        credit_deducted: creditDeducted,
        credit_repaired: creditRepaired,
        previous_credits: previousCredits,
        new_credits: newCredits,
        message: creditRepaired
            ? `Lesson was already completed (via Zoom) but had no credit snapshot. Credit repaired (${previousCredits} -> ${newCredits}).`
            : creditDeducted
            ? `Lesson logged. Credit deducted (${previousCredits} -> ${newCredits}).`
            : 'Lesson logged. No credit deducted (already completed and charged).',
    }
}

export type ScheduleLessonArgs = {
    client: DbClient
    adminId: string
    studentId: string
    date: string
    time: string
    duration?: number
    confirmOverride?: boolean
}

export async function scheduleLessonCore({
    client,
    adminId,
    studentId,
    date,
    time,
    duration = 60,
    confirmOverride = false,
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

    // Check active lesson intent flags for conflicts
    const { data: conflicts } = await client
        .from('lesson_intent_flags')
        .select('*')
        .eq('student_id', studentId)
        .eq('target_date', date)
        .eq('status', 'active')
        .in('intent', ['skip_requested', 'cancel_requested', 'reschedule_requested'])

    const hasConflict = conflicts && conflicts.length > 0
    if (hasConflict && !confirmOverride) {
        return { error: 'lesson_intent_conflict', conflicts }
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

    try {
        revalidatePath('/admin')
        revalidatePath('/student')
    } catch (e) {
        // Safe to ignore in non-Next environments
    }

    return {
        success: true as const,
        lesson,
        warning: hasConflict ? `Warning: this student has an active skip/cancel/reschedule request for this date.` : undefined,
        conflicts: hasConflict ? conflicts : undefined,
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
    confirmOverride?: boolean
}

export async function rescheduleLessonCore({
    client,
    adminId,
    lessonId,
    newDate,
    newTime,
    newDuration = 60,
    confirmOverride = false,
}: RescheduleLessonArgs) {
    const { data: lesson, error: lessonFetchError } = await client
        .from('lessons')
        .select('student_id, date, time, zoom_meeting_id')
        .eq('id', lessonId)
        .single()

    if (lessonFetchError || !lesson) {
        return { error: 'Lesson not found' }
    }

    // Check active lesson intent flags for conflicts
    const { data: conflicts } = await client
        .from('lesson_intent_flags')
        .select('*')
        .eq('student_id', lesson.student_id)
        .eq('target_date', newDate)
        .eq('status', 'active')
        .in('intent', ['skip_requested', 'cancel_requested', 'reschedule_requested'])

    const hasConflict = conflicts && conflicts.length > 0
    if (hasConflict && !confirmOverride) {
        return { error: 'lesson_intent_conflict', conflicts }
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

    try {
        revalidatePath('/admin')
        revalidatePath('/student')
    } catch (e) {
        // Safe to ignore in non-Next environments
    }

    return {
        success: true as const,
        message: 'Lesson rescheduled successfully',
        warning: hasConflict ? `Warning: this student has an active skip/cancel/reschedule request for this date.` : undefined,
        conflicts: hasConflict ? conflicts : undefined
    }
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

    // Whether this cancel lands inside the 24h late-cancel window. Computed up
    // front (before the row is deleted) so it can feed the audit log and the
    // admin notification regardless of whether a fee is actually charged below.
    const wasLate = isLateCancellation(lesson.date, lesson.time, studioNow())

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

    // Late-cancellation fee: charged only when a STUDENT cancels their own
    // lesson inside the 24h window. Admin-initiated cancellations never charge
    // the student. The fee is added to balance_due and the student is notified;
    // an admin can reverse it per case via waiveLateCancelFee().
    let lateCancelFee = 0
    if (actorRole === 'student' && wasLate) {
        try {
            const { data: studentProfile } = await supabaseAdmin
                .from('profiles')
                .select('balance_due')
                .eq('id', lesson.student_id)
                .single()

            const currentBalance = Number(studentProfile?.balance_due ?? 0)
            const newBalance = currentBalance + LATE_CANCEL_FEE

            const { error: balanceError } = await supabaseAdmin
                .from('profiles')
                .update({ balance_due: newBalance })
                .eq('id', lesson.student_id)

            if (balanceError) {
                console.error('cancelLessonCore: late-cancel fee balance update failed (non-blocking):', balanceError)
            } else {
                lateCancelFee = LATE_CANCEL_FEE

                // Notify the student in-app, sent from the studio admin account so it
                // lands in their normal message thread (mirrors addAdHocCharge).
                try {
                    const { data: admin } = await supabaseAdmin
                        .from('profiles')
                        .select('id')
                        .eq('role', 'admin')
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single()

                    if (admin?.id) {
                        const formattedDate = formatDateLong(lesson.date)
                        const formattedTime = formatTimePst(lesson.time)
                        await sendMessageCore({
                            client: supabaseAdmin,
                            senderId: admin.id,
                            recipientId: lesson.student_id,
                            content:
                                `Late cancellation fee: $${LATE_CANCEL_FEE.toFixed(2)} has been added for canceling your ${formattedDate} at ${formattedTime} lesson with less than 24 hours notice.\n` +
                                `Current Balance Due: $${newBalance.toFixed(2)}.`,
                        })
                    }
                } catch (notifyError) {
                    console.error('cancelLessonCore: late-cancel fee notification failed (non-blocking):', notifyError)
                }
            }
        } catch (feeError) {
            console.error('cancelLessonCore: late-cancel fee failed (non-blocking):', feeError)
        }
    }

    // Audit log: the lessons row is now deleted, so this is the only durable
    // record that the cancellation happened. Non-blocking: a log failure must not
    // fail the cancellation itself.
    try {
        const { error: logError } = await supabaseAdmin
            .from('cancellation_log')
            .insert({
                student_id: lesson.student_id,
                lesson_id: lessonId,
                lesson_date: lesson.date,
                lesson_time: lesson.time,
                cancelled_by: actorRole,
                actor_id: actorId,
                was_late: wasLate,
                fee_charged: lateCancelFee,
            })
        if (logError) {
            console.error('cancelLessonCore: cancellation_log insert failed (non-blocking):', logError)
        }
    } catch (logErr) {
        console.error('cancelLessonCore: cancellation_log insert threw (non-blocking):', logErr)
    }

    // Notify the studio admin by email that a cancellation happened. Non-blocking.
    if (resend) {
        try {
            const { data: student } = await client
                .from('profiles')
                .select('name')
                .eq('id', lesson.student_id)
                .single()

            const { data: adminProfile } = await supabaseAdmin
                .from('profiles')
                .select('email, studio_name')
                .eq('role', 'admin')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (adminProfile?.email) {
                const studioName = adminProfile.studio_name || 'Lionel Yu Piano Studio'
                const formattedDate = formatDateLong(lesson.date)
                const formattedTime = formatTimePst(lesson.time)

                await resend.emails.send({
                    from: `${studioName} <notifications@updates.musicalbasics.com>`,
                    to: adminProfile.email,
                    subject: `Cancellation: ${student?.name || 'Student'} — ${formattedDate} at ${formattedTime}`,
                    react: LessonCanceledAdminEmail({
                        studentName: student?.name || 'Student',
                        date: formattedDate,
                        time: formattedTime,
                        cancelledBy: actorRole,
                        wasLate,
                        feeCharged: lateCancelFee,
                        studioName,
                    }),
                })
            }
        } catch (adminEmailError) {
            console.error('cancelLessonCore: admin notification email failed (non-blocking):', adminEmailError)
        }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true as const,
        refunded: false,
        lateCancelFee,
        message: lateCancelFee > 0
            ? `Lesson cancelled. $${lateCancelFee.toFixed(2)} late-cancellation fee added to balance.`
            : 'Lesson cancelled.',
    }
}
