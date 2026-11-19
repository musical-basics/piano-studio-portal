/**
 * Who joined a lesson's Zoom meeting (Lionel's #797), from Zoom's past
 * participants report (GET /past_meetings/{id}/participants, scope
 * meeting:read:list_past_participants:admin, added 2026-11-18).
 *
 * Lionel's own Zoom account is the host: its participants carry
 * internal_user = true. Anyone else is the student (or a parent). Time in the
 * waiting room counts as the student being there: a student left waiting was
 * not a no-show.
 *
 * Every lesson has its own meeting, but a meeting can be opened again later,
 * so only participants who joined around the lesson (an hour either side) are
 * counted.
 *
 * Read-only. Nothing is stored: the token comes fresh from lib/zoom.
 */

export type ZoomParticipant = {
    id?: string
    user_id?: string
    name?: string
    user_email?: string
    join_time?: string
    leave_time?: string
    duration?: number
    status?: string
    internal_user?: boolean
}

export type ZoomAttendance =
    /** Zoom says the meeting does not exist as a past meeting: nobody ever started it. */
    | { kind: 'never_started' }
    /** Lionel was there; nobody else was, or only for under 2 minutes in total. */
    | { kind: 'only_you'; hostMinutes: number; othersMinutes: number }
    /** Someone other than Lionel was there for 2+ minutes. */
    | { kind: 'student_joined'; hostMinutes: number; studentMinutes: number }
    /** Others came but Lionel's account never joined. */
    | { kind: 'host_absent'; studentMinutes: number }
    /** The meeting ran, but nobody joined around the lesson time. */
    | { kind: 'other_time' }
    | { kind: 'unknown'; reason: string }

/** Under this much in total, the other side did not really join (#797). */
export const STUDENT_JOINED_MIN_SECONDS = 120

/** Participants count when they joined this close to the lesson. */
const WINDOW_MS = 60 * 60 * 1000

const minutes = (seconds: number) => Math.round(seconds / 60)

export function classifyAttendance(
    participants: ZoomParticipant[],
    lessonStartMs: number,
    lessonEndMs: number,
): ZoomAttendance {
    const near = participants.filter(p => {
        const at = p.join_time ? Date.parse(p.join_time) : NaN
        return Number.isFinite(at) && at >= lessonStartMs - WINDOW_MS && at <= lessonEndMs + WINDOW_MS
    })
    if (near.length === 0) return { kind: 'other_time' }
    let host = 0
    let others = 0
    let hostSeen = false
    for (const p of near) {
        const seconds = Math.max(0, Number(p.duration) || 0)
        if (p.internal_user === true) {
            hostSeen = true
            host += seconds
        } else {
            others += seconds
        }
    }
    if (others >= STUDENT_JOINED_MIN_SECONDS) {
        return hostSeen
            ? { kind: 'student_joined', hostMinutes: minutes(host), studentMinutes: minutes(others) }
            : { kind: 'host_absent', studentMinutes: minutes(others) }
    }
    if (hostSeen) return { kind: 'only_you', hostMinutes: minutes(host), othersMinutes: minutes(others) }
    return { kind: 'other_time' }
}

/** Zoom's participants for a meeting, every page. `never_started` on Zoom's 404. */
export async function fetchPastParticipants(
    meetingId: string,
    token: string,
): Promise<{ ok: true; participants: ZoomParticipant[] } | { ok: false; neverStarted: boolean; reason: string }> {
    const id = meetingId.replace(/\D/g, '')
    if (!id) return { ok: false, neverStarted: false, reason: 'no Zoom meeting id' }
    const participants: ZoomParticipant[] = []
    let pageToken = ''
    for (let page = 0; page < 10; page++) {
        const url = `https://api.zoom.us/v2/past_meetings/${id}/participants?page_size=300${pageToken ? `&next_page_token=${encodeURIComponent(pageToken)}` : ''}`
        let res: Response
        try {
            res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
        } catch (e) {
            return { ok: false, neverStarted: false, reason: `Zoom did not answer (${e instanceof Error ? e.message : 'error'})` }
        }
        if (res.status === 404) {
            // {"code":3001,"message":"Meeting does not exist: ..."}: never started.
            const body = await res.json().catch(() => ({})) as { code?: number; message?: string }
            if (body.code === 3001 || /does not exist/i.test(body.message || '')) return { ok: false, neverStarted: true, reason: 'never started' }
            return { ok: false, neverStarted: false, reason: `Zoom 404 ${body.code ?? ''}`.trim() }
        }
        if (!res.ok) return { ok: false, neverStarted: false, reason: `Zoom answered ${res.status}` }
        const body = await res.json() as { participants?: ZoomParticipant[]; next_page_token?: string }
        participants.push(...(body.participants || []))
        pageToken = body.next_page_token || ''
        if (!pageToken) break
    }
    return { ok: true, participants }
}

export async function zoomAttendance(
    meetingId: string,
    token: string,
    lessonStartMs: number,
    lessonEndMs: number,
): Promise<ZoomAttendance> {
    const got = await fetchPastParticipants(meetingId, token)
    if (!got.ok) return got.neverStarted ? { kind: 'never_started' } : { kind: 'unknown', reason: got.reason }
    return classifyAttendance(got.participants, lessonStartMs, lessonEndMs)
}

/** Whether the email offers the one-tap No-Show button for this lesson. */
export function looksLikeNoShow(a: ZoomAttendance | undefined | null): boolean {
    return a?.kind === 'only_you'
}

/** Short plain-text note for the email line. */
export function attendanceNote(a: ZoomAttendance): string {
    switch (a.kind) {
        case 'never_started': return 'Zoom never started (nobody opened the meeting)'
        case 'only_you': return a.othersMinutes > 0
            ? `No-show? Zoom: you were there ${a.hostMinutes} min, the student only ${a.othersMinutes} min`
            : `No-show? Zoom: only you joined (${a.hostMinutes} min)`
        case 'student_joined': return `Zoom: the student was there ${a.studentMinutes} min, you ${a.hostMinutes} min`
        case 'host_absent': return `Zoom: the student was there ${a.studentMinutes} min, but your account never joined`
        case 'other_time': return 'Zoom: nobody joined around the lesson time'
        case 'unknown': return `Zoom attendance unknown (${a.reason})`
    }
}
