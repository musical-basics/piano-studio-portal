'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { feedPath, getOrCreateFeedToken, resetFeedToken } from '@/lib/core/calendar-feed'

/**
 * "Add to my calendar" (#1082) for the signed-in family. The token is read and
 * written with the service key, so the caller is checked here: a signed-in
 * student, for their own feed only. An admin previewing a student gets no
 * link (it would be the admin's own session, not the family's).
 */

export type CalendarFeedLinks = {
    /** https://.../api/calendar/<token>.ics, for Copy link and Outlook. */
    feedUrl: string
    /** webcal://..., which iPhone, iPad and Mac open as a subscription. */
    webcalUrl: string
    /** Google Calendar's "add by URL" page for this feed. */
    googleUrl: string
}

async function origin(): Promise<string> {
    const h = await headers()
    const host = h.get('x-forwarded-host') || h.get('host')
    if (host) {
        const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
        return `${proto}://${host}`
    }
    return (process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com').replace(/\/$/, '')
}

async function linksFor(token: string): Promise<CalendarFeedLinks> {
    const feedUrl = `${await origin()}${feedPath(token)}`
    const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://')
    const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`
    return { feedUrl, webcalUrl, googleUrl }
}

async function signedInStudent(): Promise<{ id: string } | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in again.' }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role === 'admin') return { error: 'This is a preview: the calendar link is made by the family from their own portal.' }
    if (me?.role !== 'student') return { error: 'The calendar link is for enrolled students.' }
    return { id: user.id }
}

/** The family's feed links, making the private link the first time. */
export async function getMyCalendarFeed(): Promise<CalendarFeedLinks | { error: string }> {
    const me = await signedInStudent()
    if ('error' in me) return me
    try {
        return await linksFor(await getOrCreateFeedToken(createAdminClient(), me.id))
    } catch (e) {
        console.error('[calendar feed] get failed:', e instanceof Error ? e.message : e)
        return { error: 'Could not make your calendar link. Please try again.' }
    }
}

/** A new private link; calendars using the old one stop updating. */
export async function resetMyCalendarFeed(): Promise<CalendarFeedLinks | { error: string }> {
    const me = await signedInStudent()
    if ('error' in me) return me
    try {
        return await linksFor(await resetFeedToken(createAdminClient(), me.id))
    } catch (e) {
        console.error('[calendar feed] reset failed:', e instanceof Error ? e.message : e)
        return { error: 'Could not reset your calendar link. Please try again.' }
    }
}
