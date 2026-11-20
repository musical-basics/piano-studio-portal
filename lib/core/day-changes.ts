import type { DbClient } from '@/lib/supabase/admin'
import { shiftDateStr, studioWallClockToISO } from '@/lib/studio-timezone'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import {
    buildDayChanges,
    type AutoLogRow,
    type CancellationRow,
    type CreditRow,
    type DayChange,
    type EventRow,
    type LessonRow,
    type MoveRow,
} from '@/lib/day-changes'

/**
 * Loads one studio (Eastern) day of admin's "Today's changes" (#1005, words in
 * lib/day-changes.ts). `client` must be the service-role client. Reads only.
 */

const LESSON_FIELDS = 'id, student_id, date, time, status, created_at, completed_source, credit_snapshot_before, credit_snapshot, free_reason'

function must<T>(what: string, res: { data: T | null; error: { message: string } | null }): T {
    if (res.error) throw new Error(`${what} query failed: ${res.error.message}`)
    return (res.data ?? []) as T
}

export async function loadDayChanges(client: DbClient, date: string): Promise<DayChange[]> {
    const from = studioWallClockToISO(date, '00:00')
    const to = studioWallClockToISO(shiftDateStr(date, 1), '00:00')

    const [eventsRes, creditsRes, cancelRes, createdRes, autoRes, movesRes] = await Promise.all([
        client.from('lesson_events').select('id, lesson_id, student_id, kind, actor, lesson_date, lesson_time, detail, created_at').gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }).limit(1000),
        client.from('credit_transactions').select('id, student_id, previous_credits, new_credits, delta, source, note, changed_at').gte('changed_at', from).lt('changed_at', to).limit(1000),
        client.from('cancellation_log').select('id, lesson_id, student_id, lesson_date, lesson_time, cancelled_by, was_late, fee_charged, cancelled_at').gte('cancelled_at', from).lt('cancelled_at', to).limit(1000),
        client.from('lessons').select(LESSON_FIELDS).gte('created_at', from).lt('created_at', to).limit(1000),
        client.from('lesson_auto_logs').select('lesson_id, source, minutes, created_at').gte('created_at', from).lt('created_at', to).limit(1000),
        client.from('lesson_move_requests').select('id, lesson_id, student_id, from_date, from_time, to_date, to_time, decided_via, decided_at, outcome').eq('status', 'approved').gte('decided_at', from).lt('decided_at', to).limit(1000),
    ])
    const events = must<EventRow[]>('lesson_events', eventsRes as any)
    const credits = must<CreditRow[]>('credit_transactions', creditsRes as any)
    const cancellations = must<CancellationRow[]>('cancellation_log', cancelRes as any)
    const created = must<LessonRow[]>('lessons', createdRes as any)
    const autoLogs = must<AutoLogRow[]>('lesson_auto_logs', autoRes as any)
    // A move that failed after the claim is put back to pending or expired, so 'approved' ones moved.
    const moves = must<MoveRow[]>('lesson_move_requests', movesRes as any).filter(m => !String(m.outcome ?? '').startsWith('claim_failed'))

    // The lessons behind automatic logs and behind credit changes that took a
    // lesson's credit without saying which (to name the lesson in older days).
    const lessons = new Map<string, LessonRow>()
    for (const l of created) lessons.set(l.id, l)
    const autoIds = autoLogs.map(a => a.lesson_id).filter(id => !lessons.has(id))
    if (autoIds.length) {
        const rows = must<LessonRow[]>('lessons', await client.from('lessons').select(LESSON_FIELDS).in('id', autoIds) as any)
        for (const l of rows) lessons.set(l.id, l)
    }
    const chargedStudents = Array.from(new Set(credits.filter(c => c.delta < 0).map(c => c.student_id)))
    if (chargedStudents.length) {
        // Logs of the last two months, late logs included.
        const rows = must<LessonRow[]>('lessons', await client
            .from('lessons')
            .select(LESSON_FIELDS)
            .in('student_id', chargedStudents)
            .not('credit_snapshot', 'is', null)
            .gte('date', shiftDateStr(date, -62))
            .lte('date', shiftDateStr(date, 1))
            .limit(2000) as any)
        for (const l of rows) lessons.set(l.id, l)
    }

    const ids = new Set<string>()
    for (const r of [...events, ...credits, ...cancellations, ...created, ...moves]) ids.add(r.student_id)
    for (const l of lessons.values()) ids.add(l.student_id)
    const names = new Map<string, string>()
    // The test account ("Test / Teacher", status 'other') and the teacher accounts are
    // left out, as in the Monday email and the roster counts: test runs would fill the list.
    const hidden = new Set<string>()
    if (ids.size) {
        const rows = must<Array<{ id: string; name: string | null; status: string | null; credits: number | null }>>('profiles',
            await client.from('profiles').select('id, name, status, credits').in('id', Array.from(ids)) as any)
        for (const p of rows) {
            names.set(p.id, p.name || 'A student')
            if (p.status === 'other' || isUntrackedTeacherAccount(p)) hidden.add(p.id)
        }
    }

    return buildDayChanges({ events, credits, cancellations, created, autoLogs, moves, lessons, names })
        .filter(c => !c.studentId || !hidden.has(c.studentId))
}
