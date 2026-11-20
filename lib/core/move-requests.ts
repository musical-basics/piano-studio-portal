/**
 * "Request a different time" (#878). A family asks to move one upcoming lesson
 * to one of Lionel's free slots in that lesson's week; nothing moves until he
 * approves, from the admin Today tab or the Approve button in the 8:30am email.
 *
 *   - Approve runs rescheduleLessonCore, the usual reschedule (Zoom, Google
 *     Calendar, the usual "Lesson Rescheduled" email to the family). Nothing
 *     else is sent.
 *   - Decline changes nothing and sends nothing (words in Lionel's name need his
 *     sign-off). The family sees in the portal that the lesson stays at its time.
 *
 * One pending request per lesson (a unique index). A pending request expires
 * when the lesson is moved, logged or cancelled some other way, when the
 * lesson's time or the picked time comes, or when the picked time is no longer
 * free; every read sweeps those first, and Approve re-checks the slot right
 * before moving.
 *
 * Every function here uses the service key: callers check who is asking.
 */

import type { DbClient } from '@/lib/supabase/admin'
import { rescheduleLessonCore } from '@/lib/core/lessons'
import { findFreeSlotsCore } from '@/lib/core/free-slots'
import { LATE_CANCEL_WINDOW_HOURS } from '@/lib/billing-policy'
import { shiftDateStr, studioToday } from '@/lib/studio-timezone'
import {
    cleanMoveNote,
    familySlotLabel,
    lessonWeek,
    outcomeForAdmin,
    staleReason,
    studioSlotLabel,
    studioStartMs,
    weekLabel,
    type MoveRequestLesson,
    type MoveRequestRow,
} from '@/lib/move-requests'

const COLUMNS = 'id, lesson_id, student_id, from_date, from_time, to_date, to_time, duration, status, outcome, decided_via, decided_at, created_at, note'

const hhmm = (t: string) => String(t).slice(0, 5)

/** What the family can see about one of its upcoming lessons. */
export type FamilyMoveState = { requestId: string; status: 'pending' | 'declined' | 'unavailable'; toLabel: string }

export type MoveOption = { date: string; time: string; label: string }

export type MoveOptions = {
    lessonId: string
    /** "Thu, Nov 20 at 4:30pm EST (1:30pm your time)" */
    lessonLabel: string
    /** The times offered: "the week of Mon, Nov 17" (#878) or "the next 2 weeks" (#927). */
    week: string
    duration: number
    slots: MoveOption[]
    /** A request already waiting for Lionel. */
    pending: { requestId: string; toLabel: string } | null
}

export type PendingMoveRequest = {
    id: string
    lessonId: string
    studentId: string
    studentName: string
    fromDate: string
    fromTime: string
    toDate: string
    toTime: string
    duration: number
    /** Studio time, "Thu, Nov 20 at 4:30pm EST" */
    fromLabel: string
    toLabel: string
    createdAt: string
    /** The family's short note with the request (#1346), or null. */
    note: string | null
}

async function loadLesson(client: DbClient, lessonId: string): Promise<(MoveRequestLesson & { student_id: string }) | null | { error: string }> {
    const { data, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, status, duration')
        .eq('id', lessonId)
        .maybeSingle()
    if (error) return { error: `Could not read the lesson: ${error.message}` }
    return (data as any) ?? null
}

/**
 * Is the picked time still free for this lesson? Same rule as the slots the
 * family was offered (Lionel's hours minus other lessons and events), with no
 * notice needed. Null when the schedule could not be read.
 */
export async function moveSlotStillFree(client: DbClient, request: Pick<MoveRequestRow, 'lesson_id' | 'to_date' | 'to_time' | 'duration'>): Promise<boolean | null> {
    const found = await findFreeSlotsCore({
        client,
        duration: request.duration || 60,
        fromDate: request.to_date,
        days: 1,
        ignoreLessonIds: [request.lesson_id],
        minNoticeMinutes: 0,
    })
    if ('error' in found) return null
    return found.slots.some(s => s.date === request.to_date && s.time === hhmm(request.to_time))
}

/** Closes a pending request as expired (only if it is still pending). */
async function expire(client: DbClient, requestId: string, outcome: string): Promise<void> {
    const { error } = await client
        .from('lesson_move_requests')
        .update({ status: 'expired', outcome, decided_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('status', 'pending')
    if (error) console.error(`[move-requests] could not expire ${requestId}:`, error.message)
}

/**
 * Expires every pending request (of one student, or all) that can no longer be
 * approved. Returns the ones still pending. A schedule that cannot be read
 * leaves requests as they are.
 */
export async function sweepMoveRequests(client: DbClient, { studentId }: { studentId?: string } = {}): Promise<MoveRequestRow[]> {
    let query = client.from('lesson_move_requests').select(COLUMNS).eq('status', 'pending').order('created_at', { ascending: true })
    if (studentId) query = query.eq('student_id', studentId)
    const { data, error } = await query
    if (error) throw new Error(`lesson_move_requests query failed: ${error.message}`)
    const pending = (data || []) as MoveRequestRow[]
    if (pending.length === 0) return []

    const lessonIds = [...new Set(pending.map(r => r.lesson_id))]
    const { data: lessons, error: lessonError } = await client
        .from('lessons')
        .select('id, date, time, status, duration')
        .in('id', lessonIds)
    if (lessonError) throw new Error(`lessons query failed: ${lessonError.message}`)
    const byId = new Map((lessons || []).map(l => [l.id as string, l as MoveRequestLesson]))

    const now = Date.now()
    const open: MoveRequestRow[] = []
    for (const request of pending) {
        // A make-up claim (#927) holds its row only while it moves the lesson.
        if (request.decided_via === 'family') {
            if (now - Date.parse(request.created_at) > FAMILY_CLAIM_HOLD_MS) await expire(client, request.id, 'claim_failed: never finished')
            else open.push(request)
            continue
        }
        const stale = staleReason(request, byId.get(request.lesson_id) ?? null, now)
        if (stale) {
            await expire(client, request.id, stale)
            continue
        }
        const free = await moveSlotStillFree(client, request)
        if (free === false) {
            await expire(client, request.id, 'slot_taken')
            continue
        }
        open.push(request)
    }
    return open
}

async function familyTimezone(client: DbClient, studentId: string): Promise<string | null> {
    const { data } = await client.from('profiles').select('timezone').eq('id', studentId).maybeSingle()
    return (data?.timezone as string) ?? null
}

/** Days ahead (today included) the make-up picker offers (#927). */
export const MAKEUP_PICKER_DAYS = 14

/** A family's own make-up claim holds its lesson this long at most (see sweepMoveRequests). */
const FAMILY_CLAIM_HOLD_MS = 5 * 60_000

/**
 * The free times offered for one of a family's lessons, shared by "Request a
 * different time" (#878: that lesson's Monday-to-Sunday week) and the make-up
 * picker (#927: the next MAKEUP_PICKER_DAYS days). Lionel's free slots from now
 * on (an hour's notice), at the lesson's length, other than the lesson's own
 * time and times another family is already waiting on. Changes nothing except
 * closing this family's requests that can no longer happen.
 */
async function familyLessonOptions(
    client: DbClient,
    studentId: string,
    lessonId: string,
    span: 'week' | 'makeup',
): Promise<MoveOptions | { error: string }> {
    const lesson = await loadLesson(client, lessonId)
    if (lesson && 'error' in lesson) return lesson
    if (!lesson || lesson.student_id !== studentId) return { error: 'This lesson was not found. It may have been moved or cancelled; refresh the page.' }
    if (lesson.status !== 'scheduled') return { error: 'This lesson can no longer be moved.' }
    const time = hhmm(lesson.time)
    if (studioStartMs(lesson.date, time) <= Date.now()) return { error: 'This lesson has already started, so it can no longer be moved.' }

    const open = await sweepMoveRequests(client, { studentId })
    const tz = await familyTimezone(client, studentId)
    const pendingRow = open.find(r => r.lesson_id === lessonId) ?? null

    const duration = lesson.duration || 60
    const today = studioToday()
    const window = span === 'week'
        ? lessonWeek(lesson.date)
        : { start: today, end: shiftDateStr(today, MAKEUP_PICKER_DAYS - 1) }
    const days = span === 'week' ? 7 : MAKEUP_PICKER_DAYS
    const found = await findFreeSlotsCore({ client, duration, fromDate: window.start, days, ignoreLessonIds: [lessonId] })
    if ('error' in found) return { error: 'The free times could not be loaded just now. Please try again in a minute.' }

    // Times another family is already waiting on are not offered twice.
    const { data: others } = await client
        .from('lesson_move_requests')
        .select('lesson_id, to_date, to_time, duration')
        .eq('status', 'pending')
        .gte('to_date', window.start)
        .lte('to_date', window.end)
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    const askedElsewhere = (date: string, start: number) => (others || []).some(o =>
        o.lesson_id !== lessonId && o.to_date === date &&
        start < toMin(hhmm(o.to_time)) + (o.duration || 60) && start + duration > toMin(hhmm(o.to_time)))

    return {
        lessonId,
        lessonLabel: familySlotLabel(lesson.date, time, tz),
        week: span === 'week' ? weekLabel(lesson.date) : `the next ${MAKEUP_PICKER_DAYS / 7} weeks`,
        duration,
        slots: found.slots
            .filter(s => !(s.date === lesson.date && s.time === time))
            .filter(s => !askedElsewhere(s.date, toMin(s.time)))
            .map(s => ({ date: s.date, time: s.time, label: familySlotLabel(s.date, s.time, tz) })),
        pending: pendingRow ? { requestId: pendingRow.id, toLabel: familySlotLabel(pendingRow.to_date, pendingRow.to_time, tz) } : null,
    }
}

/** "Request a different time" (#878): free times in the lesson's own week. Changes nothing. */
export function getMoveOptionsCore(client: DbClient, studentId: string, lessonId: string): Promise<MoveOptions | { error: string }> {
    return familyLessonOptions(client, studentId, lessonId, 'week')
}

/** The make-up picker (#927): free times in the next two weeks. Changes nothing. */
export function getMakeupOptionsCore(client: DbClient, studentId: string, lessonId: string): Promise<MoveOptions | { error: string }> {
    return familyLessonOptions(client, studentId, lessonId, 'makeup')
}

/**
 * The make-up picker (#927): the family moves its own lesson to one of the
 * offered free times straight away, the same way an admin reschedule does
 * (rescheduleLessonCore: Zoom meeting, calendar event, the usual "Lesson
 * Rescheduled" email in the family's own time). The caller must have checked
 * that `studentId` is the signed-in family itself (never an admin preview).
 *
 * Guards: only the family's own lesson, still scheduled and more than
 * LATE_CANCEL_WINDOW_HOURS away (a move inside that window is a late change,
 * which goes through Lionel: "Request a different time"); the time must still
 * be one of the free ones offered; no request of theirs may be waiting on the
 * same lesson. The claim holds the lesson's one pending row in
 * lesson_move_requests while it moves, so a double tap or a second tab can't
 * move it twice; the row stays as the record (decided_via 'family').
 */
export async function claimMakeupSlotCore(
    client: DbClient,
    { studentId, lessonId, date, time }: { studentId: string; lessonId: string; date: string; time: string },
): Promise<{ success: true; toLabel: string } | { error: string }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: 'Pick one of the times in the list.' }

    const options = await getMakeupOptionsCore(client, studentId, lessonId)
    if ('error' in options) return options
    if (options.pending) {
        return { error: `You already asked to move this lesson to ${options.pending.toLabel}. Withdraw that request first to pick another time.` }
    }
    const lesson = await loadLesson(client, lessonId)
    if (!lesson || 'error' in lesson) return { error: 'This lesson could not be read just now. Please try again.' }
    const from = hhmm(lesson.time)
    if (studioStartMs(lesson.date, from) - Date.now() < LATE_CANCEL_WINDOW_HOURS * 3_600_000) {
        return { error: `This lesson is less than ${LATE_CANCEL_WINDOW_HOURS} hours away, so it can't be moved here. Use "Request a different time" (your teacher approves it) or message your teacher.` }
    }
    const picked = options.slots.find(s => s.date === date && s.time === time)
    if (!picked) return { error: 'That time is no longer free. Please pick another one.' }

    const { data: hold, error: holdError } = await client.from('lesson_move_requests').insert({
        lesson_id: lessonId,
        student_id: studentId,
        from_date: lesson.date,
        from_time: from,
        to_date: date,
        to_time: time,
        duration: options.duration,
        status: 'pending',
        decided_via: 'family',
    }).select('id').single()
    if (holdError || !hold) {
        if (holdError?.code === '23505') return { error: 'This lesson is already being moved. Refresh the page to see where it is now.' }
        console.error('[move-requests] make-up claim hold failed:', holdError?.message)
        return { error: 'Your lesson could not be moved just now. Please try again in a minute.' }
    }
    const close = (status: 'approved' | 'expired', outcome: string) => client
        .from('lesson_move_requests')
        .update({ status, outcome, decided_at: new Date().toISOString() })
        .eq('id', hold.id)

    // The usual reschedule email goes out in the studio's name, like an admin move.
    const { data: admin } = await client.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
    if (!admin?.id) {
        await close('expired', 'claim_failed: studio account not found')
        return { error: 'Your lesson could not be moved just now. Please try again in a minute.' }
    }
    const result = await rescheduleLessonCore({
        client,
        adminId: admin.id as string,
        lessonId,
        newDate: date,
        newTime: time,
        newDuration: options.duration,
        // The family picked this time itself just now, which outranks an older
        // skip/move note of theirs for that day.
        confirmOverride: true,
        event: { actor: 'family', via: 'make-up picker' },
    })
    if ('error' in result && result.error) {
        const taken = /already booked/i.test(String(result.error))
        await close('expired', taken ? 'slot_taken' : `claim_failed: ${result.error}`)
        return taken
            ? { error: 'That time was just taken. Please pick another one.' }
            : { error: 'Your lesson could not be moved just now. Nothing changed; please try again in a minute.' }
    }
    await close('approved', 'moved: the family picked it (make-up picker)')
    console.log(`[move-requests] make-up picker: student ${studentId} moved lesson ${lessonId} ${lesson.date} ${from} -> ${date} ${time}`)
    return { success: true, toLabel: picked.label }
}

/**
 * Files a family's request to move a lesson to one of the offered free times,
 * with its optional short note (#1346).
 * The caller must have checked that `studentId` is the signed-in family itself.
 */
export async function fileMoveRequestCore(
    client: DbClient,
    { studentId, lessonId, date, time, note }: { studentId: string; lessonId: string; date: string; time: string; note?: string | null },
): Promise<{ success: true; toLabel: string } | { error: string }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: 'Pick one of the times in the list.' }

    const options = await getMoveOptionsCore(client, studentId, lessonId)
    if ('error' in options) return options
    if (options.pending) {
        return { error: `You already asked to move this lesson to ${options.pending.toLabel}. Withdraw that request first to pick another time.` }
    }
    const picked = options.slots.find(s => s.date === date && s.time === time)
    if (!picked) return { error: 'That time is no longer free. Please pick another one.' }

    const lesson = await loadLesson(client, lessonId)
    if (!lesson || 'error' in lesson) return { error: 'This lesson could not be read just now. Please try again.' }

    const { error } = await client.from('lesson_move_requests').insert({
        lesson_id: lessonId,
        student_id: studentId,
        from_date: lesson.date,
        from_time: hhmm(lesson.time),
        to_date: date,
        to_time: time,
        duration: options.duration,
        status: 'pending',
        note: cleanMoveNote(note),
    })
    if (error) {
        if (error.code === '23505') return { error: 'You already asked to move this lesson. Refresh the page to see that request.' }
        console.error('[move-requests] insert failed:', error.message)
        return { error: 'Your request could not be saved just now. Please try again in a minute.' }
    }
    console.log(`[move-requests] student ${studentId} asked to move lesson ${lessonId} (${lesson.date} ${hhmm(lesson.time)}) to ${date} ${time}`)
    return { success: true, toLabel: picked.label }
}

/** The family takes back its own pending request. */
export async function withdrawMoveRequestCore(client: DbClient, { studentId, requestId }: { studentId: string; requestId: string }): Promise<{ success: true } | { error: string }> {
    const { data, error } = await client
        .from('lesson_move_requests')
        .update({ status: 'withdrawn', outcome: 'withdrawn', decided_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('student_id', studentId)
        .eq('status', 'pending')
        .select('id')
    if (error) return { error: 'The request could not be withdrawn just now. Please try again.' }
    if (!data || data.length === 0) return { error: 'This request is no longer waiting (it was already answered or closed). Refresh the page.' }
    return { success: true }
}

/**
 * For the family's portal: the latest request on each of these lessons that is
 * worth showing. Pending, declined, or closed because the picked time stopped
 * being free, and only while the lesson is still at the time it was asked from.
 */
export async function familyMoveStatesCore(
    client: DbClient,
    studentId: string,
    lessons: Array<{ id: string; date: string; time: string }>,
): Promise<Record<string, FamilyMoveState>> {
    if (lessons.length === 0) return {}
    await sweepMoveRequests(client, { studentId })
    const { data, error } = await client
        .from('lesson_move_requests')
        .select(COLUMNS)
        .eq('student_id', studentId)
        .in('lesson_id', lessons.map(l => l.id))
        .order('created_at', { ascending: false })
    if (error) throw new Error(`lesson_move_requests query failed: ${error.message}`)
    const tz = await familyTimezone(client, studentId)

    const states: Record<string, FamilyMoveState> = {}
    for (const lesson of lessons) {
        const latest = (data as MoveRequestRow[] || []).find(r => r.lesson_id === lesson.id)
        if (!latest) continue
        const sameSlot = latest.from_date === lesson.date && hhmm(latest.from_time) === hhmm(lesson.time)
        const toLabel = familySlotLabel(latest.to_date, latest.to_time, tz)
        if (latest.status === 'pending') {
            states[lesson.id] = { requestId: latest.id, status: 'pending', toLabel }
        } else if (sameSlot && latest.status === 'declined') {
            states[lesson.id] = { requestId: latest.id, status: 'declined', toLabel }
        } else if (sameSlot && latest.status === 'expired' && /^(slot_taken|slot_passed)/.test(latest.outcome || '')) {
            states[lesson.id] = { requestId: latest.id, status: 'unavailable', toLabel }
        }
    }
    return states
}

/** Every request waiting for Lionel, oldest first, after the sweep. */
export async function listPendingMoveRequestsCore(client: DbClient): Promise<PendingMoveRequest[]> {
    // A make-up claim in progress (#927) is not Lionel's to decide.
    const open = (await sweepMoveRequests(client)).filter(r => r.decided_via !== 'family')
    if (open.length === 0) return []
    const { data: students } = await client
        .from('profiles')
        .select('id, name')
        .in('id', [...new Set(open.map(r => r.student_id))])
    const names = new Map((students || []).map(s => [s.id as string, (s.name as string) || 'Student']))
    return open.map(r => toPending(r, names.get(r.student_id) || 'Student'))
}

function toPending(r: MoveRequestRow, studentName: string): PendingMoveRequest {
    return {
        id: r.id,
        lessonId: r.lesson_id,
        studentId: r.student_id,
        studentName,
        fromDate: r.from_date,
        fromTime: hhmm(r.from_time),
        toDate: r.to_date,
        toTime: hhmm(r.to_time),
        duration: r.duration || 60,
        fromLabel: studioSlotLabel(r.from_date, r.from_time),
        toLabel: studioSlotLabel(r.to_date, r.to_time),
        createdAt: r.created_at,
        note: r.note ?? null,
    }
}

type Loaded =
    | { ok: true; request: MoveRequestRow; pending: PendingMoveRequest }
    | { ok: false; error: string; closed?: boolean }

/**
 * One request, checked the way Approve needs it: still pending, the lesson
 * still where it was, both times still ahead, the picked time still free.
 * Anything stale is closed here (and said so in plain words).
 */
export async function loadPendingMoveRequest(client: DbClient, requestId: string): Promise<Loaded> {
    const { data, error } = await client.from('lesson_move_requests').select(COLUMNS).eq('id', requestId).maybeSingle()
    if (error) return { ok: false, error: `The request could not be read just now (${error.message}). Nothing changed.` }
    if (!data) return { ok: false, closed: true, error: 'This request is gone: its lesson was cancelled or removed. Nothing changed.' }
    const request = data as MoveRequestRow
    const { data: student } = await client.from('profiles').select('name').eq('id', request.student_id).maybeSingle()
    const pending = toPending(request, (student?.name as string) || 'Student')

    if (request.status !== 'pending') {
        const what = request.status === 'approved' ? 'already approved (the lesson was moved)'
            : request.status === 'declined' ? 'already declined'
            : request.status === 'withdrawn' ? 'withdrawn by the family'
            : `closed: ${outcomeForAdmin(request.outcome)}`
        return { ok: false, closed: true, error: `This request was ${what}. Nothing changed.` }
    }

    const lesson = await loadLesson(client, request.lesson_id)
    if (lesson && 'error' in lesson) return { ok: false, error: `${lesson.error}. Nothing changed.` }
    const stale = staleReason(request, lesson, Date.now())
    if (stale) {
        await expire(client, request.id, stale)
        return { ok: false, closed: true, error: `This request can't be approved any more: ${outcomeForAdmin(stale)}. Nothing changed; the request is closed.` }
    }
    return { ok: true, request, pending }
}

export type MoveDecision = { success: true; summary: string } | { error: string; closed?: boolean }

/**
 * Approve: re-check the picked time, then the usual reschedule. The request is
 * claimed first (pending -> approved), so two taps can't move the lesson twice;
 * a reschedule that fails puts it back to pending.
 */
export async function approveMoveRequestCore({
    client,
    adminId,
    requestId,
    via,
}: {
    client: DbClient
    adminId: string
    requestId: string
    via: 'admin' | 'email'
}): Promise<MoveDecision> {
    const loaded = await loadPendingMoveRequest(client, requestId)
    if (!loaded.ok) return { error: loaded.error, closed: loaded.closed }
    const { request, pending } = loaded

    const free = await moveSlotStillFree(client, request)
    if (free === null) return { error: 'Your schedule could not be read just now, so nothing was moved. The request is still open; try again in a minute.' }
    if (!free) {
        await expire(client, request.id, 'slot_taken')
        return {
            closed: true,
            error: `${pending.toLabel} is no longer free (another lesson or event is there now, or it is outside your hours). ` +
                `Nothing was moved and nothing was sent; the request is closed and the family sees that the lesson stays at ${pending.fromLabel}.`,
        }
    }

    const { data: claimed, error: claimError } = await client
        .from('lesson_move_requests')
        .update({ status: 'approved', outcome: 'moving', decided_via: via, decided_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'pending')
        .select('id')
    if (claimError) return { error: `The request could not be updated (${claimError.message}). Nothing was moved.` }
    if (!claimed || claimed.length === 0) return { closed: true, error: 'This request was just answered somewhere else. Nothing changed.' }

    const result = await rescheduleLessonCore({
        client,
        adminId,
        lessonId: request.lesson_id,
        newDate: request.to_date,
        newTime: hhmm(request.to_time),
        newDuration: request.duration || 60,
        // The family picked this time itself just now, which outranks an older
        // skip/move note for that day; the warning is passed on below.
        confirmOverride: true,
        event: { reason: 'the family asked', ...(via === 'email' ? { via: 'email button' } : {}) },
    })
    if ('error' in result && result.error) {
        const taken = /already booked/i.test(String(result.error))
        await client
            .from('lesson_move_requests')
            .update(taken
                ? { status: 'expired', outcome: 'slot_taken' }
                : { status: 'pending', outcome: null, decided_via: null, decided_at: null })
            .eq('id', request.id)
        return taken
            ? { closed: true, error: `${pending.toLabel} was just taken by another lesson. Nothing was moved and nothing was sent; the request is closed.` }
            : { error: `The move did not go through (${result.error}). Nothing was moved; the request is still open.` }
    }

    const warning = 'warning' in result && result.warning ? ' Note: they also have an open skip/move note for that day.' : ''
    await client.from('lesson_move_requests').update({ outcome: `moved${warning ? ': had an open skip/move note for that day' : ''}` }).eq('id', request.id)
    console.log(`[move-requests] approved ${request.id} via ${via}: lesson ${request.lesson_id} ${request.from_date} ${hhmm(request.from_time)} -> ${request.to_date} ${hhmm(request.to_time)}`)
    return {
        success: true,
        summary: `${pending.studentName}'s lesson moved from ${pending.fromLabel} to ${pending.toLabel}. ` +
            `Zoom and the calendar moved with it, and 1 family got the usual "Lesson Rescheduled" email.${warning}`,
    }
}

/** Decline: the lesson stays, nothing is sent. */
export async function declineMoveRequestCore({
    client,
    requestId,
    via,
}: {
    client: DbClient
    requestId: string
    via: 'admin' | 'email'
}): Promise<MoveDecision> {
    const { data, error } = await client
        .from('lesson_move_requests')
        .update({ status: 'declined', outcome: 'declined', decided_via: via, decided_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select(COLUMNS)
    if (error) return { error: `The request could not be updated (${error.message}). Nothing changed.` }
    if (!data || data.length === 0) {
        const loaded = await loadPendingMoveRequest(client, requestId)
        return { closed: true, error: loaded.ok ? 'This request changed while you were answering. Nothing changed; try again.' : loaded.error }
    }
    const request = data[0] as MoveRequestRow
    const { data: student } = await client.from('profiles').select('name').eq('id', request.student_id).maybeSingle()
    const pending = toPending(request, (student?.name as string) || 'Student')
    console.log(`[move-requests] declined ${request.id} via ${via}`)
    return {
        success: true,
        summary: `Declined. ${pending.studentName}'s lesson stays at ${pending.fromLabel}. Nothing was sent; the family sees in the portal that it stays at its time.`,
    }
}
