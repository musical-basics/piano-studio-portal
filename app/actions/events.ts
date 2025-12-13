'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createZoomMeeting } from '@/lib/zoom'

// ==========================================
// Types matching v0 UI expectations
// ==========================================

export type EventInvite = {
    student_id: string
    student_name: string
    status: "pending" | "going" | "declined"
    responded_at?: string
    student_notes?: string | null // Added to support notes
}

export type AdminEvent = {
    id: string
    title: string
    description: string
    date: string
    start_time: string
    duration_minutes: number
    location_type: "virtual" | "physical"
    location_address?: string
    zoom_link?: string
    rsvp_deadline: string
    invites: EventInvite[]
    created_at: string
}

export type CreateEventInput = {
    title: string
    description: string
    date: string
    start_time: string
    duration_minutes: number
    location_type: "virtual" | "physical"
    location_address?: string
    rsvp_deadline: string
    invited_student_ids: string[]
}

// Type for Student Dashboard (superset or compatible)
export interface StudentEvent extends Omit<AdminEvent, 'invites'> {
    invite_status: 'pending' | 'going' | 'not_going'
    student_notes: string | null
}

// ==========================================
// Server Actions
// ==========================================

/**
 * getAdminEvents
 * Fetches all events with invite details.
 * Returns a flat array of AdminEvent.
 */
export async function getAdminEvents(): Promise<AdminEvent[]> {
    const supabase = await createClient()

    // Fetch events with invites and student profiles
    const { data: events, error } = await supabase
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
        .order('start_time', { ascending: false })

    if (error) {
        console.error('Error fetching admin events:', error)
        return []
    }

    // Transform to AdminEvent shape
    return events.map((event: any) => {
        const invites: EventInvite[] = event.event_invites.map((invite: any) => ({
            student_id: invite.student_id,
            student_name: invite.profiles?.name || 'Unknown',
            status: invite.status,
            responded_at: invite.updated_at, // Mapping updated_at to responded_at
            student_notes: invite.student_notes
        }))

        // Extract date and time from ISO start_time if needed, 
        // BUT the DB stores 'start_time' as ISO timestamp (presumably).
        // The UI expects 'date' (YYYY-MM-DD) and 'start_time' (HH:MM) separately.
        // We need to parse the DB's start_time.

        const startDateTime = new Date(event.start_time)
        // Adjust for timezone if necessary? standard ISO behavior usually fine if converted on client,
        // but here we are returning strings.
        // Assuming event.start_time is stored as ISO UTC. 
        // To safe-guard, let's keep the date string logic simple.

        // NOTE: The v0 UI expects 'date' and 'start_time' properties.
        // If the DB has `start_time` as a full timestamptz, we split it.
        // If the DB has separate columns, we use them.
        // Based on my previous `createEvent`, I stored it as `start_time` (ISO).

        const dateStr = startDateTime.toISOString().split('T')[0]
        // HH:MM format
        const timeStr = startDateTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })

        // HACK: For now, I'll return the DB values if they exist, or parse them.
        // The previous implementation stored ISO string in `start_time`.

        return {
            id: event.id,
            title: event.title,
            description: event.description || '',
            date: dateStr,
            start_time: timeStr,
            duration_minutes: event.duration,
            location_type: event.location_type,
            location_address: event.location_details, // Mapping location_details -> location_address/zoom_link
            zoom_link: event.location_type === 'virtual' ? event.location_details : undefined,
            rsvp_deadline: event.rsvp_deadline?.split('T')[0] || '', // Extract YYYY-MM-DD
            invites: invites,
            created_at: event.created_at
        }
    })
}

/**
 * getActiveStudents
 * Fetches all students for invitation selection.
 */
export async function getActiveStudents(): Promise<{ id: string; name: string; email: string }[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('role', 'student')
        .order('name')

    if (error) {
        console.error('Error fetching students:', error)
        return []
    }

    return data as { id: string; name: string; email: string }[]
}

/**
 * createEvent
 * Creates a new event and invites students.
 */
export async function createEvent(
    input: CreateEventInput,
): Promise<{ success: boolean; event?: AdminEvent; error?: string }> {
    const supabase = await createClient()

    // 1. Zoom Logic
    let locationDetails = input.location_address || ''
    if (input.location_type === 'virtual') {
        // Construct full ISO string for Zoom
        const isoDateTime = new Date(`${input.date}T${input.start_time}`).toISOString()
        const zoomLink = await createZoomMeeting(
            input.title,
            isoDateTime,
            input.duration_minutes
        )
        if (zoomLink) {
            locationDetails = zoomLink
        }
    }

    // 2. Insert Event
    // Combine date and time into ISO string for DB storage
    // We assume DB `start_time` column is TIMESTAMPTZ
    const fullStartTime = new Date(`${input.date}T${input.start_time}`).toISOString()
    // RSVP deadline typically needs a time too, default to end of day? 
    // Input is just a date string.
    const fullRsvpDeadline = new Date(`${input.rsvp_deadline}T23:59:59`).toISOString()

    const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert({
            title: input.title,
            description: input.description,
            start_time: fullStartTime,
            duration: input.duration_minutes,
            location_type: input.location_type,
            location_details: locationDetails,
            rsvp_deadline: fullRsvpDeadline,
        })
        .select()
        .single()

    if (eventError || !eventData) {
        console.error('Error creating event:', eventError)
        return { success: false, error: 'Failed to create event in database' }
    }

    // 3. Invite Students
    if (input.invited_student_ids.length > 0) {
        const invites = input.invited_student_ids.map((studentId) => ({
            event_id: eventData.id,
            student_id: studentId,
            status: 'pending',
        }))

        const { error: inviteError } = await supabase
            .from('event_invites')
            .insert(invites)

        if (inviteError) {
            console.error('Error creating invites:', inviteError)
            // Non-fatal, return success with warning if possible, or just success
        }
    }

    revalidatePath('/admin/events')
    revalidatePath('/student/events')

    // Return partial AdminEvent (enough for the UI to update optimistically or refresh)
    // We'll call getAdminEvents usually to refresh, but returning the obj is good practice
    return { success: true }
}

/**
 * deleteEvent
 */
export async function deleteEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    // Explicitly delete invites first (in case cascade is missing on older data)
    const { error: inviteError } = await supabase
        .from('event_invites')
        .delete()
        .eq('event_id', eventId)

    if (inviteError) {
        console.error('Delete invites error:', inviteError)
        // We continue? No, if we can't delete invites, we probably can't delete event if FK restricts.
        // But if invites are deleted, we proceed.
        return { success: false, error: 'Failed to clear event invites: ' + inviteError.message }
    }

    const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)

    if (error) {
        console.error('Delete event error:', error)
        return { success: false, error: 'Failed to delete event: ' + error.message }
    }

    revalidatePath('/admin/events')
    revalidatePath('/student/events')
    return { success: true }
}

/**
 * getStudentEvents
 * Fetches events where the current student is invited.
 */
export async function getStudentEvents(): Promise<{ upcoming: StudentEvent[], past: StudentEvent[] }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { upcoming: [], past: [] }

    // Fetch invites joined with events
    const { data: invites, error } = await supabase
        .from('event_invites')
        .select(`
        status,
        student_notes,
        events (
          *
        )
      `)
        .eq('student_id', user.id)

    if (error) {
        console.error('Error fetching student events:', error)
        return { upcoming: [], past: [] }
    }

    const now = new Date()
    const upcoming: StudentEvent[] = []
    const past: StudentEvent[] = []

    invites?.forEach((invite: any) => {
        if (!invite.events) return

        const event = invite.events
        const startDateTime = new Date(event.start_time)
        const dateStr = startDateTime.toISOString().split('T')[0]
        const timeStr = startDateTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })

        const studentEvent: StudentEvent = {
            id: event.id,
            title: event.title,
            description: event.description || '',
            date: dateStr,
            start_time: timeStr,
            duration_minutes: event.duration,
            location_type: event.location_type,
            location_address: event.location_details,
            zoom_link: event.location_type === 'virtual' ? event.location_details : undefined,
            rsvp_deadline: event.rsvp_deadline?.split('T')[0] || '',
            created_at: event.created_at,
            invite_status: invite.status,
            student_notes: invite.student_notes
        }

        if (startDateTime > now) {
            upcoming.push(studentEvent)
        } else {
            past.push(studentEvent)
        }
    })

    // Sort
    upcoming.sort((a, b) => new Date(a.date + 'T' + a.start_time).getTime() - new Date(b.date + 'T' + b.start_time).getTime())
    past.sort((a, b) => new Date(b.date + 'T' + b.start_time).getTime() - new Date(a.date + 'T' + a.start_time).getTime())

    return { upcoming, past }
}

/**
 * rsvpToEvent
 * Updates RSVP status for the student.
 */
export async function rsvpToEvent(
    eventId: string,
    status: 'going' | 'not_going',
    notes: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }

    // 1. Check Event & Deadline
    const { data: event, error: eventError } = await supabase
        .from('events')
        .select('rsvp_deadline')
        .eq('id', eventId)
        .single()

    if (eventError || !event) {
        return { error: 'Event not found' }
    }

    if (new Date() > new Date(event.rsvp_deadline)) {
        return { error: 'RSVP deadline has passed' }
    }

    // 2. Update Invite
    const { error: updateError } = await supabase
        .from('event_invites')
        .update({
            status,
            student_notes: notes,
            updated_at: new Date().toISOString()
        })
        .eq('event_id', eventId)
        .eq('student_id', user.id)

    if (updateError) {
        console.error('Error updating RSVP:', updateError)
        return { error: 'Failed to update RSVP' }
    }

    revalidatePath('/student/events')
    revalidatePath('/admin/events')

    return { success: true }
}

/**
 * updateEvent
 * Updates an existing event and its invites.
 */
export async function updateEvent(
    eventId: string,
    input: CreateEventInput
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    // 1. Zoom Logic (if changed to virtual, or updating details)
    let locationDetails = input.location_address || ''
    if (input.location_type === 'virtual') {
        // Construct full ISO string for Zoom
        // Note: Ideally we update the existing meeting rather than creating new, but for now this ensures link is valid.
        const isoDateTime = new Date(`${input.date}T${input.start_time}`).toISOString()
        const zoomLink = await createZoomMeeting(
            input.title,
            isoDateTime,
            input.duration_minutes
        )
        if (zoomLink) {
            locationDetails = zoomLink
        } else if (!locationDetails) {
            // Keep existing if we didn't get a new one and have none? 
            // Actually input.location_address likely contains the existing link if we prefilled it.
        }
    }

    // 2. Update Event
    const fullStartTime = new Date(`${input.date}T${input.start_time}`).toISOString()
    const fullRsvpDeadline = new Date(`${input.rsvp_deadline}T23:59:59`).toISOString()

    const { error: eventError } = await supabase
        .from('events')
        .update({
            title: input.title,
            description: input.description,
            start_time: fullStartTime,
            duration: input.duration_minutes,
            location_type: input.location_type,
            location_details: locationDetails,
            rsvp_deadline: fullRsvpDeadline,
        })
        .eq('id', eventId)

    if (eventError) {
        console.error('Error updating event:', eventError)
        return { success: false, error: 'Failed to update event' }
    }

    // 3. Update Invites (Sync logic)
    if (input.invited_student_ids) {
        // Get existing invites
        const { data: existingInvites } = await supabase
            .from('event_invites')
            .select('student_id')
            .eq('event_id', eventId)

        const existingIds = existingInvites?.map(i => i.student_id) || []

        // To Add
        const toAdd = input.invited_student_ids.filter(id => !existingIds.includes(id))
        // To Remove
        const toRemove = existingIds.filter(id => !input.invited_student_ids.includes(id))

        if (toAdd.length > 0) {
            const newInvites = toAdd.map(sid => ({
                event_id: eventId,
                student_id: sid,
                status: 'pending' // Default status for new invites
            }))
            await supabase.from('event_invites').insert(newInvites)
        }

        if (toRemove.length > 0) {
            await supabase
                .from('event_invites')
                .delete()
                .eq('event_id', eventId)
                .in('student_id', toRemove)
        }
    }

    revalidatePath('/admin/events')
    revalidatePath('/student/events')

    return { success: true }
}
