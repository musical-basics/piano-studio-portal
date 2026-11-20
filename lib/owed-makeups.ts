/**
 * Families owed a make-up lesson (#1092): the plain rules, shared by the
 * server code (lib/core/owed-makeups.ts), the admin card and the self-check
 * (scripts/check_owed_makeups.ts). No database or server-only imports here.
 *
 * Each "I missed this" and each lesson Lionel cancels is one lesson_events row
 * (#1005). The list turns those into rows:
 *   - "I missed this" with no make-up booked in it: owed.
 *   - a cancel by Lionel (admin pages, email button, his agent): 'ask', since a
 *     cancel he made is often a family's own request. He says Owed or Not owed.
 *   - cancels by the family, "student set inactive", and removing a logged
 *     lesson never come here.
 */

import { studioSlotLabel } from '@/lib/move-requests'

/**
 * The list starts here (6pm EST on Nov 20, 2026, when #1092 shipped): misses
 * and cancels before it are not on it.
 */
export const OWED_LIST_STARTS_AT = '2026-11-20T23:00:00Z'

export type OwedSource = 'missed' | 'cancelled'
export type OwedStatus = 'ask' | 'owed' | 'settled' | 'dismissed'

/** A lesson_events row, as the list reads it. */
export type OwedLessonEvent = {
    id: string
    kind: string
    actor: string
    student_id: string
    lesson_id: string | null
    lesson_date: string | null
    lesson_time: string | null
    detail: Record<string, unknown> | null
    created_at: string
}

export type NewOwedRow = {
    source: OwedSource
    status: OwedStatus
    via: string | null
    outcome?: string
    makeup_date?: string
    makeup_time?: string
}

/** "I missed this" writes "make-up 2026-11-25 15:00" in the event's reason when it booked one. */
const MISSED_MAKEUP = /make-up (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/

/** What one lesson event means for the list; null when it doesn't belong on it. */
export function owedRowFromEvent(ev: OwedLessonEvent): NewOwedRow | null {
    if (ev.actor !== 'admin' || !ev.lesson_date || !ev.lesson_time) return null
    const detail = ev.detail || {}
    const reason = typeof detail.reason === 'string' ? detail.reason : ''
    const via = typeof detail.via === 'string' ? detail.via : null
    if (ev.kind === 'missed') {
        const booked = reason.match(MISSED_MAKEUP)
        return booked
            ? { source: 'missed', status: 'settled', via, outcome: 'booked with "I missed this"', makeup_date: booked[1], makeup_time: booked[2] }
            : { source: 'missed', status: 'owed', via }
    }
    if (ev.kind === 'cancelled') {
        if (reason === 'student set inactive') return null
        const was = typeof detail.was_status === 'string' ? detail.was_status : 'scheduled'
        if (was !== 'scheduled') return null
        return { source: 'cancelled', status: 'ask', via }
    }
    return null
}

/** "Tue, Nov 18 at 4:30pm EST: you missed it" / "Tue, Nov 18 at 4:30pm EST: you cancelled it (by your agent)" */
export function owedWhatLabel(row: { source: OwedSource; lesson_date: string; lesson_time: string; via?: string | null }): string {
    const when = studioSlotLabel(row.lesson_date, row.lesson_time)
    if (row.source === 'missed') return `${when}: you missed it ("I missed this")`
    const how = row.via === 'agent' ? ' (by your agent)' : row.via === 'email button' ? ' (email button)' : ''
    return `${when}: you cancelled it${how}`
}

/** "today", "yesterday", "5 days ago" from an instant, for the card. */
export function daysAgo(iso: string, nowMs: number = Date.now()): string {
    const days = Math.floor((nowMs - Date.parse(iso)) / 86_400_000)
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    return `${days} days ago`
}
