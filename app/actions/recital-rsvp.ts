'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

// Token-based RSVP for recital events. Reached from email links, so there is no
// auth session: the student is identified by their profiles.public_id (the same
// token the classroom links use), scoped to a specific event id. Writes go to
// event_invites (status + student_notes), the same table the in-portal event
// signup uses, so the admin Events page shows the roster with no extra UI.

export type RecitalRsvpInput = {
    eventId: string
    publicId: string
    attending: boolean
    name?: string
    email?: string
    piece?: string
    guestEmails?: string
    note?: string
}

function parseGuestEmails(raw: string | undefined): string[] {
    if (!raw) return []
    return raw
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
        .slice(0, 20)
}

export async function getRecitalRsvpContext(eventId: string, publicId: string) {
    const supabase = createAdminClient()

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, email, preferred_name')
        .eq('public_id', publicId)
        .maybeSingle()
    if (!profile) return { error: 'Invalid link' }

    const { data: event } = await supabase
        .from('events')
        .select('id, title, start_time, rsvp_deadline')
        .eq('id', eventId)
        .maybeSingle()
    if (!event) return { error: 'Event not found' }

    const { data: invite } = await supabase
        .from('event_invites')
        .select('status, student_notes')
        .eq('event_id', eventId)
        .eq('student_id', profile.id)
        .maybeSingle()

    return {
        student: { name: profile.name || '', email: profile.email || '' },
        event: { title: event.title, start_time: event.start_time },
        existingStatus: invite?.status || null,
    }
}

export async function submitRecitalRsvp(input: RecitalRsvpInput) {
    const supabase = createAdminClient()

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('public_id', input.publicId)
        .maybeSingle()
    if (!profile) return { error: 'Invalid link' }

    const { data: event } = await supabase
        .from('events')
        .select('id, title, start_time')
        .eq('id', input.eventId)
        .maybeSingle()
    if (!event) return { error: 'Event not found' }

    if (new Date() > new Date(event.start_time)) {
        return { error: 'This event has already taken place.' }
    }

    const guests = parseGuestEmails(input.guestEmails)
    const noteParts: string[] = []
    if (input.attending) {
        noteParts.push(`Piece: ${input.piece?.trim() || 'TBD'}`)
        if (guests.length > 0) noteParts.push(`Guests: ${guests.join(', ')}`)
        if (input.name?.trim() && input.name.trim() !== (profile.name || '')) {
            noteParts.push(`Performer name: ${input.name.trim()}`)
        }
        if (input.email?.trim() && input.email.trim() !== (profile.email || '')) {
            noteParts.push(`Contact: ${input.email.trim()}`)
        }
    } else if (input.note?.trim()) {
        noteParts.push(`Note: ${input.note.trim()}`)
    }
    const studentNotes = noteParts.join(' | ') || null
    const status = input.attending ? 'going' : 'not_going'

    const { data: existing } = await supabase
        .from('event_invites')
        .select('id')
        .eq('event_id', event.id)
        .eq('student_id', profile.id)
        .maybeSingle()

    if (existing) {
        const { error } = await supabase
            .from('event_invites')
            .update({ status, student_notes: studentNotes, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
        if (error) return { error: 'Failed to save your RSVP. Please try again.' }
    } else {
        const { error } = await supabase
            .from('event_invites')
            .insert({ event_id: event.id, student_id: profile.id, status, student_notes: studentNotes })
        if (error) return { error: 'Failed to save your RSVP. Please try again.' }
    }

    // Notify the studio inbox (non-blocking)
    if (process.env.RESEND_API_KEY) {
        try {
            const { data: adminProfile } = await supabase
                .from('profiles')
                .select('email')
                .eq('role', 'admin')
                .limit(1)
                .single()
            const resend = new Resend(process.env.RESEND_API_KEY)
            const who = input.name?.trim() || profile.name || profile.email || 'A student'
            const detail = studentNotes ? `<p>${studentNotes.replaceAll(' | ', '<br>')}</p>` : ''
            await resend.emails.send({
                from: 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>',
                to: adminProfile?.email || 'support@musicalbasics.com',
                subject: input.attending
                    ? `🎹 Recital RSVP: ${who} is attending`
                    : `Recital RSVP: ${who} can't make it`,
                html: `<p><strong>${who}</strong> responded to "${event.title}": <strong>${input.attending ? 'ATTENDING' : 'NOT ATTENDING'}</strong></p>${detail}`,
            })
        } catch (notifyError) {
            console.error('submitRecitalRsvp: admin notification failed (non-blocking):', notifyError)
        }
    }

    return { success: true }
}
