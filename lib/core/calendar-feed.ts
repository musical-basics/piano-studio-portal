/**
 * "Add to my calendar" (#1082), the database side. Tokens live in
 * calendar_feeds (service key only, see the migration); every function here
 * takes the service-role client and acts for exactly one student id that the
 * caller has already checked (the signed-in family) or found by token.
 */

import { randomBytes } from 'crypto'
import type { DbClient } from '@/lib/supabase/admin'
import { shiftDateStr, studioToday } from '@/lib/studio-timezone'
import { buildLessonFeed, FEED_PAST_DAYS, FEED_TOKEN_RE, type FeedLesson } from '@/lib/calendar-feed'

function newToken(): string {
    return randomBytes(24).toString('base64url') // 32 characters, 192 random bits
}

/** The feed path for a token; the route accepts it with or without ".ics". */
export function feedPath(token: string): string {
    return `/api/calendar/${token}.ics`
}

/** The student's token, made on first use. */
export async function getOrCreateFeedToken(admin: DbClient, studentId: string): Promise<string> {
    const { data: existing, error } = await admin
        .from('calendar_feeds')
        .select('token')
        .eq('student_id', studentId)
        .maybeSingle()
    if (error) throw new Error(`calendar_feeds read failed: ${error.message}`)
    if (existing?.token) return existing.token as string

    const token = newToken()
    const { error: insertError } = await admin
        .from('calendar_feeds')
        .insert({ student_id: studentId, token })
    if (insertError) {
        // Two tabs asking at once: the other one won, use its token.
        const { data: again } = await admin.from('calendar_feeds').select('token').eq('student_id', studentId).maybeSingle()
        if (again?.token) return again.token as string
        throw new Error(`calendar_feeds insert failed: ${insertError.message}`)
    }
    return token
}

/** A new token for the student; the old URL stops working at once. */
export async function resetFeedToken(admin: DbClient, studentId: string): Promise<string> {
    const token = newToken()
    const { error } = await admin
        .from('calendar_feeds')
        .upsert({ student_id: studentId, token, reset_at: new Date().toISOString() }, { onConflict: 'student_id' })
    if (error) throw new Error(`calendar_feeds reset failed: ${error.message}`)
    return token
}

/**
 * The .ics text for a token, or null when no student has that token (wrong,
 * reset, or the student is gone). Only that one student's lessons are read.
 */
export async function feedForToken(admin: DbClient, token: string, portalUrl: string, now: Date = new Date()): Promise<string | null> {
    if (!FEED_TOKEN_RE.test(token)) return null

    const { data: feed } = await admin
        .from('calendar_feeds')
        .select('student_id, last_fetched_at')
        .eq('token', token)
        .maybeSingle()
    if (!feed?.student_id) return null
    const studentId = feed.student_id as string

    const { data: profile } = await admin
        .from('profiles')
        .select('name, role, lesson_venue, public_id, zoom_link')
        .eq('id', studentId)
        .maybeSingle()
    if (!profile || profile.role === 'admin') return null

    const since = shiftDateStr(studioToday(), -FEED_PAST_DAYS)
    const [{ data: lessons, error: lessonsError }, { data: teacher }] = await Promise.all([
        admin
            .from('lessons')
            .select('id, date, time, duration, status, zoom_link, updated_at, created_at')
            .eq('student_id', studentId)
            .gte('date', since)
            .in('status', ['scheduled', 'completed'])
            .order('date', { ascending: true })
            .limit(500),
        admin
            .from('profiles')
            .select('name, zoom_link')
            .eq('role', 'admin')
            .limit(1)
            .maybeSingle(),
    ])
    if (lessonsError) throw new Error(`lessons read failed: ${lessonsError.message}`)

    // When a calendar last asked (so Lionel can tell a family's feed is live),
    // written at most every 10 minutes.
    const last = feed.last_fetched_at ? Date.parse(feed.last_fetched_at as string) : 0
    if (now.getTime() - last > 10 * 60_000) {
        await admin.from('calendar_feeds').update({ last_fetched_at: now.toISOString() }).eq('student_id', studentId)
    }

    const teacherFirstName = ((teacher?.name as string | null) || '').trim().split(/\s+/)[0] || null
    return buildLessonFeed({
        lessons: (lessons || []) as FeedLesson[],
        profile,
        studioZoomLink: (teacher?.zoom_link as string | null) || null,
        teacherFirstName,
        portalUrl,
        now,
    })
}
