/**
 * Families owed a make-up lesson (#1092), on the admin Today tab until one is
 * booked, so none is forgotten. Rules in lib/owed-makeups.ts.
 *
 * Every read first syncs: each new "I missed this" or cancel by Lionel in
 * lesson_events (since OWED_LIST_STARTS_AT) becomes one owed_makeups row
 * (event_id is unique, so a second read adds nothing). Open rows ('ask' and
 * 'owed') then close by themselves only when the cancelled lesson is back at
 * its own time. Everything else is Lionel's tap:
 *   - Book a make-up: one of his free times (lib/core/free-slots.ts: his
 *     hours, minus lessons, events and his Google Calendar), booked the usual
 *     way (scheduleLessonCore: Zoom, calendar, the usual "Lesson Scheduled"
 *     email to that family). The row is claimed first, so a double tap can't
 *     book twice.
 *   - "That was it": a lesson booked for that family since then (shown on the
 *     row) was the make-up. Lessons are never counted on their own, because
 *     most families' regular lessons are booked by hand too.
 *   - Settled (handled some other way), Owed / Not owed (for a cancel).
 *
 * Every function here uses the service key: callers check that an admin asks.
 */

import type { DbClient } from '@/lib/supabase/admin'
import { scheduleLessonCore } from '@/lib/core/lessons'
import { findFreeSlotsCore, type FreeSlot } from '@/lib/core/free-slots'
import { shiftDateStr, studioToday } from '@/lib/studio-timezone'
import { studioSlotLabel } from '@/lib/move-requests'
import {
    OWED_LIST_STARTS_AT,
    owedRowFromEvent,
    owedWhatLabel,
    type OwedLessonEvent,
    type OwedSource,
    type OwedStatus,
} from '@/lib/owed-makeups'

/** How far ahead "Book a make-up" offers free times. */
export const OWED_MAKEUP_DAYS = 14

/** How far back the sync looks at lesson events each time. */
const SYNC_LOOKBACK_DAYS = 60

const COLUMNS = 'id, student_id, event_id, source, lesson_id, lesson_date, lesson_time, duration, via, status, outcome, makeup_lesson_id, makeup_date, makeup_time, created_at, decided_at'

type OwedRow = {
    id: string
    student_id: string
    event_id: string | null
    source: OwedSource
    lesson_id: string | null
    lesson_date: string
    lesson_time: string
    duration: number
    via: string | null
    status: OwedStatus
    outcome: string | null
    makeup_lesson_id: string | null
    makeup_date: string | null
    makeup_time: string | null
    created_at: string
    decided_at: string | null
}

export type OwedMakeup = {
    id: string
    studentId: string
    studentName: string
    source: OwedSource
    /** 'ask': a cancel of his, waiting for Owed / Not owed. */
    status: 'ask' | 'owed'
    lessonDate: string
    lessonTime: string
    /** "Tue, Nov 18 at 4:30pm EST: you cancelled it (by your agent)" */
    what: string
    duration: number
    /** When the miss or cancel happened. */
    createdAt: string
    /** A lesson booked for this family since then (not by the portal on its own): maybe the make-up. */
    bookedSince: { lessonId: string; label: string } | null
}

const hhmm = (t: string) => String(t).slice(0, 5)

/** Adds a row for each new miss or cancel of Lionel's. Never throws. */
export async function syncOwedMakeups(client: DbClient): Promise<void> {
    try {
        const lookback = new Date(Date.now() - SYNC_LOOKBACK_DAYS * 86_400_000).toISOString()
        const since = lookback > OWED_LIST_STARTS_AT ? lookback : OWED_LIST_STARTS_AT
        const { data: events, error } = await client
            .from('lesson_events')
            .select('id, kind, actor, student_id, lesson_id, lesson_date, lesson_time, detail, created_at')
            .in('kind', ['missed', 'cancelled'])
            .eq('actor', 'admin')
            .gte('created_at', since)
            .order('created_at', { ascending: true })
        if (error) throw new Error(`lesson_events: ${error.message}`)
        if (!events || events.length === 0) return

        const { data: known, error: knownError } = await client
            .from('owed_makeups')
            .select('event_id')
            .in('event_id', events.map(e => e.id))
        if (knownError) throw new Error(`owed_makeups: ${knownError.message}`)
        const seen = new Set((known || []).map(k => k.event_id as string))

        const fresh = (events as OwedLessonEvent[])
            .filter(e => !seen.has(e.id))
            .map(e => ({ e, row: owedRowFromEvent(e) }))
            .filter((x): x is { e: OwedLessonEvent; row: NonNullable<ReturnType<typeof owedRowFromEvent>> } => x.row !== null)
        if (fresh.length === 0) return

        const durations = await lessonLengths(client, fresh.map(x => x.e))
        const rows = fresh.map(({ e, row }) => ({
            student_id: e.student_id,
            event_id: e.id,
            source: row.source,
            lesson_id: e.lesson_id,
            lesson_date: e.lesson_date,
            lesson_time: hhmm(e.lesson_time!),
            duration: durations.get(e.id) ?? 60,
            via: row.via,
            status: row.status,
            outcome: row.outcome ?? null,
            makeup_date: row.makeup_date ?? null,
            makeup_time: row.makeup_time ?? null,
            created_at: e.created_at,
            decided_at: row.status === 'settled' ? e.created_at : null,
        }))
        const { error: insertError } = await client
            .from('owed_makeups')
            .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true })
        if (insertError) throw new Error(`owed_makeups insert: ${insertError.message}`)
        console.log(`[owed-makeups] ${rows.length} new row(s) from lesson events`)
    } catch (err: any) {
        console.error('[owed-makeups] sync failed (the list shows what it had):', err?.message ?? err)
    }
}

/**
 * The missed or cancelled lesson's length: from its "booked" event when it
 * has one, else the family's latest lesson, else 60.
 */
async function lessonLengths(client: DbClient, events: OwedLessonEvent[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    const lessonIds = events.map(e => e.lesson_id).filter((x): x is string => !!x)
    if (lessonIds.length > 0) {
        const { data: booked } = await client
            .from('lesson_events')
            .select('lesson_id, detail')
            .eq('kind', 'booked')
            .in('lesson_id', lessonIds)
        for (const b of booked || []) {
            const d = Number((b.detail as any)?.duration)
            if (d > 0) for (const e of events) if (e.lesson_id === b.lesson_id) out.set(e.id, d)
        }
    }
    const students = [...new Set(events.filter(e => !out.has(e.id)).map(e => e.student_id))]
    if (students.length > 0) {
        const { data: lessons } = await client
            .from('lessons')
            .select('student_id, duration, date')
            .in('student_id', students)
            .order('date', { ascending: false })
            .limit(200)
        for (const e of events) {
            if (out.has(e.id)) continue
            const latest = (lessons || []).find(l => l.student_id === e.student_id && Number(l.duration) > 0)
            if (latest) out.set(e.id, Number(latest.duration))
        }
    }
    return out
}

/** Open rows, oldest first, after the sync, with "booked since" hints. */
export async function listOwedMakeupsCore(client: DbClient): Promise<OwedMakeup[]> {
    await syncOwedMakeups(client)
    const { data, error } = await client
        .from('owed_makeups')
        .select(COLUMNS)
        .in('status', ['ask', 'owed'])
        .order('created_at', { ascending: true })
    if (error) throw new Error(`owed_makeups query failed: ${error.message}`)
    const open = (data || []) as OwedRow[]
    if (open.length === 0) return []

    const studentIds = [...new Set(open.map(r => r.student_id))]
    const oldest = open[0].created_at
    const [{ data: students }, { data: lessons }] = await Promise.all([
        client.from('profiles').select('id, name').in('id', studentIds),
        client
            .from('lessons')
            .select('id, student_id, date, time, status, created_at')
            .in('student_id', studentIds)
            .gte('created_at', oldest)
            .neq('status', 'cancelled')
            .order('date', { ascending: true })
            .order('time', { ascending: true }),
    ])
    const names = new Map((students || []).map(s => [s.id as string, (s.name as string) || 'Student']))
    const recent = (lessons || []) as Array<{ id: string; student_id: string; date: string; time: string; status: string; created_at: string }>

    // Lessons the portal booked on its own (the next week after a log, standing
    // slots) are regular lessons, never offered as the make-up; nor is one
    // already counted as another row's make-up.
    let autoBooked = new Set<string>()
    let usedElsewhere = new Set<string>()
    if (recent.length > 0) {
        const ids = recent.map(l => l.id)
        const [{ data: auto }, { data: used }] = await Promise.all([
            client.from('lesson_events').select('lesson_id').eq('kind', 'booked').eq('actor', 'auto').in('lesson_id', ids),
            client.from('owed_makeups').select('makeup_lesson_id').in('makeup_lesson_id', ids),
        ])
        autoBooked = new Set((auto || []).map(a => a.lesson_id as string))
        usedElsewhere = new Set((used || []).map(u => u.makeup_lesson_id as string))
    }

    const result: OwedMakeup[] = []
    for (const r of open) {
        const after = Date.parse(r.created_at)
        const mine = recent.filter(l => l.student_id === r.student_id && Date.parse(l.created_at) > after)
        // The cancelled lesson is back at its own time: nothing is owed.
        const back = mine.find(l => l.date === r.lesson_date && hhmm(l.time) === r.lesson_time)
        if (back) {
            await closeRow(client, r.id, ['ask', 'owed'], { status: 'dismissed', outcome: 'the lesson is back at its time', makeup_lesson_id: back.id })
            continue
        }
        const since = mine.find(l => !autoBooked.has(l.id) && !usedElsewhere.has(l.id))
        result.push({
            id: r.id,
            studentId: r.student_id,
            studentName: names.get(r.student_id) || 'Student',
            source: r.source,
            status: r.status as 'ask' | 'owed',
            lessonDate: r.lesson_date,
            lessonTime: r.lesson_time,
            what: owedWhatLabel(r),
            duration: r.duration || 60,
            createdAt: r.created_at,
            bookedSince: since ? { lessonId: since.id, label: studioSlotLabel(since.date, String(since.time)) } : null,
        })
    }
    return result
}

/** Changes a row only while it is in one of `from`; true when it did. */
async function closeRow(client: DbClient, id: string, from: OwedStatus[], set: Record<string, unknown>): Promise<boolean> {
    const { data, error } = await client
        .from('owed_makeups')
        .update({ decided_at: new Date().toISOString(), ...set })
        .eq('id', id)
        .in('status', from)
        .select('id')
    if (error) {
        console.error(`[owed-makeups] could not update ${id}:`, error.message)
        return false
    }
    return Boolean(data && data.length > 0)
}

async function loadRow(client: DbClient, id: string): Promise<OwedRow | { error: string }> {
    const { data, error } = await client.from('owed_makeups').select(COLUMNS).eq('id', id).maybeSingle()
    if (error) return { error: `The list could not be read just now (${error.message}). Nothing changed.` }
    if (!data) return { error: 'This row is gone. Refresh the page.' }
    return data as OwedRow
}

const STALE = 'This one was already handled (booked, settled or dismissed). Refresh the page. Nothing changed.'

export type OwedDecision = { success: true; summary: string } | { error: string }

/**
 * Lionel's call on one row:
 *   owed     - a cancel of his was on him: it stays, as owed
 *   not_owed - off the list
 *   settled  - handled; with `lessonId`, that lesson (booked for the family
 *              since) was the make-up
 * Nothing is sent to anyone.
 */
export async function decideOwedMakeupCore(
    client: DbClient,
    { id, decision, lessonId }: { id: string; decision: 'owed' | 'not_owed' | 'settled'; lessonId?: string | null },
): Promise<OwedDecision> {
    const row = await loadRow(client, id)
    if ('error' in row) return row
    if (decision === 'owed') {
        const ok = await closeRow(client, id, ['ask'], { status: 'owed', decided_at: null })
        return ok ? { success: true, summary: 'Marked as owed. It stays on the list until a make-up is booked.' } : { error: STALE }
    }
    if (decision === 'not_owed') {
        const ok = await closeRow(client, id, ['ask', 'owed'], { status: 'dismissed', outcome: 'not owed' })
        return ok ? { success: true, summary: 'Off the list (not owed). Nothing was sent.' } : { error: STALE }
    }
    if (lessonId) {
        const { data: lesson } = await client.from('lessons').select('id, student_id, date, time').eq('id', lessonId).maybeSingle()
        if (!lesson || lesson.student_id !== row.student_id) return { error: 'That lesson was not found for this family. Refresh the page. Nothing changed.' }
        const ok = await closeRow(client, id, ['ask', 'owed'], {
            status: 'settled',
            outcome: 'that lesson was the make-up',
            makeup_lesson_id: lesson.id,
            makeup_date: lesson.date,
            makeup_time: hhmm(String(lesson.time)),
        })
        return ok ? { success: true, summary: `Settled: the lesson on ${studioSlotLabel(lesson.date, String(lesson.time))} was the make-up. Nothing was sent.` } : { error: STALE }
    }
    const ok = await closeRow(client, id, ['ask', 'owed'], { status: 'settled', outcome: 'settled by hand' })
    return ok ? { success: true, summary: 'Settled. Off the list; nothing was sent.' } : { error: STALE }
}

export type OwedSlots = { slots: FreeSlot[]; duration: number; studentName: string; what: string }

/** Free times for this row's make-up in the next OWED_MAKEUP_DAYS days. Changes nothing. */
export async function owedMakeupSlotsCore(client: DbClient, { id, duration }: { id: string; duration?: number }): Promise<OwedSlots | { error: string }> {
    const row = await loadRow(client, id)
    if ('error' in row) return row
    if (row.status !== 'ask' && row.status !== 'owed') return { error: STALE }
    const length = duration && duration > 0 ? duration : row.duration || 60
    const found = await findFreeSlotsCore({ client, duration: length, days: OWED_MAKEUP_DAYS })
    if ('error' in found) return found
    const { data: student } = await client.from('profiles').select('name').eq('id', row.student_id).maybeSingle()
    return { slots: found.slots, duration: length, studentName: (student?.name as string) || 'Student', what: owedWhatLabel(row) }
}

/**
 * Books the make-up at a free time, the usual way (scheduleLessonCore: Zoom,
 * calendar, the usual "Lesson Scheduled" email to the family), and settles
 * the row with it. The row is claimed first; a booking that fails puts it back.
 */
export async function bookOwedMakeupCore(
    client: DbClient,
    { adminId, id, date, time, duration }: { adminId: string; id: string; date: string; time: string; duration: number },
): Promise<OwedDecision> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: 'Pick one of the free times. Nothing changed.' }
    if (![30, 45, 60, 90].includes(duration)) return { error: 'Pick a length of 30, 45, 60 or 90 minutes. Nothing changed.' }
    const row = await loadRow(client, id)
    if ('error' in row) return row
    if (row.status !== 'ask' && row.status !== 'owed') return { error: STALE }
    const today = studioToday()
    if (date < today || date > shiftDateStr(today, OWED_MAKEUP_DAYS - 1)) return { error: 'That day is outside the next two weeks. Nothing changed.' }

    const found = await findFreeSlotsCore({ client, duration, fromDate: date, days: 1 })
    if ('error' in found) return { error: `Nothing was booked: ${found.error}` }
    if (!found.slots.some(s => s.date === date && s.time === time)) {
        return { error: `${studioSlotLabel(date, time)} is no longer free. Nothing was booked; pick another time.` }
    }

    const was = row.status
    const claimed = await closeRow(client, id, [was], { status: 'settled', outcome: 'booking' })
    if (!claimed) return { error: STALE }

    const booked = await scheduleLessonCore({
        client,
        adminId,
        studentId: row.student_id,
        date,
        time,
        duration,
        event: { reason: 'make-up (owed list)' },
    })
    const lesson = (booked as any)?.lesson as { id?: string } | undefined
    if ('error' in booked && booked.error) {
        await client.from('owed_makeups').update({ status: was, outcome: null, decided_at: null }).eq('id', id)
        const why = booked.error === 'lesson_intent_conflict' ? 'the family asked to skip or move a lesson that day' : String(booked.error)
        return { error: `Nothing was booked (${why}). It is still on the list.` }
    }
    await client
        .from('owed_makeups')
        .update({ outcome: 'booked from the list', makeup_lesson_id: lesson?.id ?? null, makeup_date: date, makeup_time: time })
        .eq('id', id)
    const { data: student } = await client.from('profiles').select('name').eq('id', row.student_id).maybeSingle()
    console.log(`[owed-makeups] booked make-up for row ${id}: ${date} ${time} (${duration} min)`)
    return {
        success: true,
        summary: `Make-up booked for ${(student?.name as string) || 'the student'} on ${studioSlotLabel(date, time)} (${duration} min). ` +
            'Zoom and the calendar follow, and 1 family got the usual "Lesson Scheduled" email.',
    }
}
