import type { DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { isoToStudioWallClock, shiftDateStr, studioToday, studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import {
    PORTAL_EVENT_DESCRIPTION,
    PORTAL_EVENT_MARKER,
    addMinutesToWallClock,
    getCalendarEvent,
    insertLessonEvent,
    lessonEventSummary,
    listCalendarEvents,
    patchLessonEventTime,
    removeCalendarEvent,
    type GoogleCalendarEvent,
} from '@/lib/google-calendar'

/**
 * The morning calendar check (Lionel's #925).
 *
 * Each morning this compares the next 14 days of lessons with the studio Google
 * Calendar and fixes what does not match, on its own:
 *
 *   - missing:  a scheduled lesson with no event (no id saved, or the event was
 *               deleted) gets one, built exactly like a freshly booked lesson's
 *               (lib/google-calendar.ts buildLessonEvent), and its id is saved.
 *               If a portal event for the same student is already sitting there
 *               unlinked (the id got lost), it is linked instead of duplicated.
 *   - wrong time: an event whose start or end differs from its lesson is moved,
 *               changing only start and end (the old 7-8 hour end times from a
 *               past bug are fixed this way).
 *   - leftover: a portal event in the window that no lesson points to (its
 *               lesson was cancelled, so the row is gone) is deleted.
 *
 * Only events the portal made are ever touched. An event linked from a lesson
 * row is the portal's by record. An unlinked event counts as the portal's only
 * when Google says the portal's own service account created it AND it carries
 * the portal's hidden tag (new events, since #925) or the portal's exact title
 * and description ("<Name> - Piano Lesson" / "Lesson scheduled via Studio
 * Portal."). Anything that only looks like one is left alone and listed for
 * Lionel to check; everything else (his own events) is never looked at twice.
 *
 * It emails the studio inbox what it did, only when there was something.
 * The planning is pure (planCalendarSync), so the rules are tested with fakes
 * (scripts/check_calendar_sync.ts); applying is per item, and one Google error
 * is listed without stopping the rest.
 */

export const SYNC_DAYS = 14

/**
 * More leftover events than this at once means something is off (a lessons
 * query that came back short, say), so none are deleted and all are listed.
 */
export const MAX_DELETES_PER_RUN = 6

export type SyncLesson = {
    id: string
    studentName: string
    date: string // YYYY-MM-DD, studio wall clock
    time: string // HH:MM, studio wall clock
    duration: number
    status: string
    eventId: string | null
}

export type SyncEvent = {
    id: string
    summary: string
    description: string
    /** ISO instants; null for an all-day event. */
    start: string | null
    end: string | null
    /** All-day events only: the studio date it is on. */
    allDayDate: string | null
    /** Google says the portal's own service account created it. */
    createdByPortal: boolean
    /** Carries the portal's hidden tag (PORTAL_EVENT_MARKER). */
    marked: boolean
}

export type LinkedLookup = SyncEvent | null | { error: string }

export type SyncInput = {
    /** Studio dates: from is included, to is not. */
    window: { from: string; to: string }
    /** Every lesson in the window (any status), plus any lesson elsewhere that points at an event in it. */
    lessons: SyncLesson[]
    /** Every live event starting in the window. */
    windowEvents: SyncEvent[]
    /** Events looked up by id for scheduled window lessons whose event is not in windowEvents (null = gone). */
    linked: Map<string, LinkedLookup>
}

export type SyncAction =
    | { kind: 'create'; lesson: SyncLesson; why: 'no-event' | 'event-gone' | 'event-shared' }
    | { kind: 'link'; lesson: SyncLesson; event: SyncEvent; retime: boolean }
    | { kind: 'retime'; lesson: SyncLesson; event: SyncEvent }
    | { kind: 'delete'; event: SyncEvent }
    | { kind: 'leave'; event: SyncEvent; reason: string }
    | { kind: 'error'; lesson: SyncLesson; message: string }

export type SyncPlan = {
    window: { from: string; to: string }
    /** Scheduled lessons checked (in the window). */
    checked: number
    /** Of those, already right on the calendar. */
    matched: number
    actions: SyncAction[]
}

// ------------------------------------------------------------- events ---

const PORTAL_SUMMARY = / - Piano Lesson$/

/** A Google event, reduced to what the check needs. */
export function toSyncEvent(e: GoogleCalendarEvent, portalAccount: string): SyncEvent {
    const allDayDate = e.start?.date ?? null
    const toIso = (dt?: string | null) => (dt ? new Date(dt).toISOString() : null)
    return {
        id: e.id || '',
        summary: e.summary || '',
        description: e.description || '',
        start: allDayDate ? null : toIso(e.start?.dateTime),
        end: allDayDate ? null : toIso(e.end?.dateTime),
        allDayDate,
        createdByPortal: !!portalAccount && (e.creator?.email || '').toLowerCase() === portalAccount.toLowerCase(),
        marked: e.extendedProperties?.private?.[PORTAL_EVENT_MARKER.key] === PORTAL_EVENT_MARKER.value,
    }
}

/**
 * Whose event this is, for an event no lesson points to:
 *   'certain'   - made by the portal's service account and carrying the portal's
 *                 tag or its exact title and description: safe to edit or delete
 *   'looks-like'- has some of those signs but not all: never touched, listed
 *   'not-ours'  - Lionel's own: never touched, never listed
 */
export function portalOwnership(e: SyncEvent): 'certain' | 'looks-like' | 'not-ours' {
    const portalTitle = PORTAL_SUMMARY.test(e.summary)
    const portalText = portalTitle && e.description.trim() === PORTAL_EVENT_DESCRIPTION
    if (e.createdByPortal && (e.marked || portalText)) return 'certain'
    if (e.createdByPortal || e.marked || portalTitle) return 'looks-like'
    return 'not-ours'
}

/** Where a lesson's event should start and end, as ISO instants. */
export function expectedTimes(l: Pick<SyncLesson, 'date' | 'time' | 'duration'>): { start: string; end: string } {
    const endWall = addMinutesToWallClock(l.date, l.time, l.duration)
    return {
        start: studioWallClockToISO(l.date, l.time),
        end: studioWallClockToISO(endWall.slice(0, 10), endWall.slice(11, 16)),
    }
}

export function timesMatch(e: SyncEvent, l: Pick<SyncLesson, 'date' | 'time' | 'duration'>): boolean {
    if (!e.start || !e.end) return false
    const x = expectedTimes(l)
    return Date.parse(e.start) === Date.parse(x.start) && Date.parse(e.end) === Date.parse(x.end)
}

/** The studio date an event starts on. */
function eventDate(e: SyncEvent): string {
    return e.allDayDate ?? (e.start ? isoToStudioWallClock(e.start).localDate : '')
}

const sameName = (e: SyncEvent, name: string) =>
    e.summary.trim().toLowerCase() === lessonEventSummary(name).trim().toLowerCase()

const byWhen = (a: SyncLesson, b: SyncLesson) => (a.date + a.time).localeCompare(b.date + b.time)

const isEvent = (x: LinkedLookup | undefined): x is SyncEvent => !!x && 'id' in x

// -------------------------------------------------------------- plan ---

/** What the check would do. Pure: no calls, no clock. */
export function planCalendarSync(input: SyncInput): SyncPlan {
    const { window } = input
    const inWindow = (date: string) => date >= window.from && date < window.to
    const eventsById = new Map(input.windowEvents.map(e => [e.id, e]))
    const lookup = (id: string): LinkedLookup | undefined => eventsById.get(id) ?? input.linked.get(id)

    const actions: SyncAction[] = []
    const scheduled = input.lessons.filter(l => l.status === 'scheduled' && inWindow(l.date)).sort(byWhen)
    const claimed = new Map<string, string>() // event id -> lesson id
    const resolved = new Set<string>()
    let matched = 0

    // 1. Lessons whose event is already right. First, so that when two lessons
    // point at one event, the lesson it matches keeps it.
    for (const l of scheduled) {
        const e = l.eventId ? lookup(l.eventId) : undefined
        if (isEvent(e) && !claimed.has(e.id) && timesMatch(e, l)) {
            claimed.set(e.id, l.id)
            resolved.add(l.id)
            matched++
        }
    }

    // 2. The rest: wrong time, lookup failed, or no event at all.
    const needEvent: { lesson: SyncLesson; why: 'no-event' | 'event-gone' | 'event-shared' }[] = []
    for (const l of scheduled) {
        if (resolved.has(l.id)) continue
        if (!l.eventId) {
            needEvent.push({ lesson: l, why: 'no-event' })
            continue
        }
        const e = lookup(l.eventId)
        if (e && !isEvent(e)) {
            actions.push({ kind: 'error', lesson: l, message: `could not read its calendar event: ${e.error}` })
        } else if (e === undefined) {
            actions.push({ kind: 'error', lesson: l, message: 'its calendar event was not looked up' })
        } else if (e === null) {
            needEvent.push({ lesson: l, why: 'event-gone' })
        } else if (claimed.has(e.id)) {
            needEvent.push({ lesson: l, why: 'event-shared' })
        } else {
            claimed.set(e.id, l.id)
            actions.push({ kind: 'retime', lesson: l, event: e })
        }
    }

    // 3. Lessons outside the window whose event sits inside it (a move that
    // never reached the calendar): put the event back on its lesson.
    for (const l of input.lessons.filter(l => l.status === 'scheduled' && !inWindow(l.date)).sort(byWhen)) {
        const e = l.eventId ? eventsById.get(l.eventId) : undefined
        if (!e || claimed.has(e.id)) continue
        claimed.set(e.id, l.id)
        if (!timesMatch(e, l)) actions.push({ kind: 'retime', lesson: l, event: e })
    }

    // 4. Events in the window no lesson points to.
    const referenced = new Set(input.lessons.map(l => l.eventId).filter((id): id is string => !!id))
    const unlinked = input.windowEvents.filter(e => !referenced.has(e.id) && !claimed.has(e.id))
    const ours = unlinked.filter(e => portalOwnership(e) === 'certain')
    const used = new Set<string>()

    // A lesson that needs an event takes its own unlinked one if it is there
    // (same student, exact start first, else the same day), instead of a duplicate.
    for (const { lesson, why } of needEvent) {
        const mine = ours.filter(e => !used.has(e.id) && sameName(e, lesson.studentName))
        const start = Date.parse(expectedTimes(lesson).start)
        const found = mine.find(e => e.start && Date.parse(e.start) === start) ?? mine.find(e => eventDate(e) === lesson.date)
        if (found) {
            used.add(found.id)
            actions.push({ kind: 'link', lesson, event: found, retime: !timesMatch(found, lesson) })
        } else {
            actions.push({ kind: 'create', lesson, why })
        }
    }

    // What is left of the portal's own unlinked events are leftovers, unless a
    // logged lesson with no event of its own could still own one.
    const ownerless = input.lessons.filter(l =>
        l.status !== 'scheduled' && inWindow(l.date) && !(l.eventId && eventsById.has(l.eventId)))
    const leftovers: SyncEvent[] = []
    for (const e of ours.filter(e => !used.has(e.id))) {
        const owner = ownerless.find(l =>
            (sameName(e, l.studentName) && eventDate(e) === l.date) ||
            (!!e.start && Date.parse(e.start) === Date.parse(expectedTimes(l).start)))
        if (owner) actions.push({ kind: 'leave', event: e, reason: `a ${owner.status} lesson may still own it` })
        else leftovers.push(e)
    }
    if (leftovers.length > MAX_DELETES_PER_RUN) {
        for (const e of leftovers) {
            actions.push({ kind: 'leave', event: e, reason: `${leftovers.length} leftover events at once is more than expected, so none were removed` })
        }
    } else {
        for (const e of leftovers) actions.push({ kind: 'delete', event: e })
    }

    for (const e of unlinked.filter(e => portalOwnership(e) === 'looks-like')) {
        actions.push({ kind: 'leave', event: e, reason: 'looks like a lesson event, but not certainly one the portal made, so it was not touched' })
    }

    return { window, checked: scheduled.length, matched, actions }
}

// ------------------------------------------------------------- apply ---

export type CalendarPort = {
    /** The portal's Google service account (events it created carry it as creator). */
    portalAccount: string
    listEvents(timeMinIso: string, timeMaxIso: string): Promise<GoogleCalendarEvent[]>
    getEvent(eventId: string): Promise<GoogleCalendarEvent | null>
    createEvent(studentName: string, date: string, time: string, duration: number): Promise<string>
    retimeEvent(eventId: string, date: string, time: string, duration: number): Promise<'updated' | 'missing'>
    deleteEvent(eventId: string): Promise<void>
}

export function googleCalendarPort(): CalendarPort {
    return {
        portalAccount: process.env.GOOGLE_CLIENT_EMAIL || '',
        listEvents: listCalendarEvents,
        getEvent: getCalendarEvent,
        createEvent: insertLessonEvent,
        retimeEvent: patchLessonEventTime,
        deleteEvent: removeCalendarEvent,
    }
}

/** Saves an event id on a lesson; throws when it could not. */
export type SaveEventId = (lessonId: string, eventId: string) => Promise<void>

export type SyncResult = SyncAction & {
    /** True once the change is on the calendar (and saved); false on a dry run or failure. */
    done: boolean
    error?: string
    /** The event the lesson ends up linked to, when that changed. */
    newEventId?: string
    /** A retime/link found the event gone and made a new one instead. */
    recreated?: boolean
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 200)

/** Carries out a plan, one item at a time; a failure is recorded on its item and the rest go on. */
export async function applyCalendarSync(plan: SyncPlan, port: CalendarPort, save: SaveEventId): Promise<SyncResult[]> {
    const results: SyncResult[] = []
    for (const action of plan.actions) {
        try {
            results.push(await applyOne(action, port, save))
        } catch (e) {
            results.push({ ...action, done: false, error: errorText(e) })
        }
    }
    return results
}

async function applyOne(action: SyncAction, port: CalendarPort, save: SaveEventId): Promise<SyncResult> {
    const createFor = async (l: SyncLesson): Promise<string> => {
        const id = await port.createEvent(l.studentName, l.date, l.time, l.duration)
        try {
            await save(l.id, id)
        } catch (e) {
            throw new Error(`the event was made but not saved on the lesson (${errorText(e)}); tomorrow's check links it`)
        }
        return id
    }

    switch (action.kind) {
        case 'create': {
            const id = await createFor(action.lesson)
            return { ...action, done: true, newEventId: id }
        }
        case 'retime': {
            const { lesson: l, event } = action
            const r = await port.retimeEvent(event.id, l.date, l.time, l.duration)
            if (r === 'updated') return { ...action, done: true }
            const id = await createFor(l)
            return { ...action, done: true, newEventId: id, recreated: true }
        }
        case 'link': {
            const { lesson: l, event } = action
            if (portalOwnership(event) !== 'certain') throw new Error('not certainly a portal event, so it was not touched')
            if (action.retime) {
                const r = await port.retimeEvent(event.id, l.date, l.time, l.duration)
                if (r === 'missing') {
                    const id = await createFor(l)
                    return { ...action, done: true, newEventId: id, recreated: true }
                }
            }
            await save(l.id, event.id)
            return { ...action, done: true, newEventId: event.id }
        }
        case 'delete': {
            // Checked again right before deleting: only ever the portal's own.
            if (portalOwnership(action.event) !== 'certain') throw new Error('not certainly a portal event, so it was not deleted')
            await port.deleteEvent(action.event.id)
            return { ...action, done: true }
        }
        case 'leave':
        case 'error':
            return { ...action, done: false }
    }
}

// -------------------------------------------------------------- load ---

/** The studio-date window starting today, and the instants it spans. */
export function syncWindow(today: string = studioToday()) {
    const from = today
    const to = shiftDateStr(today, SYNC_DAYS)
    return { from, to, timeMin: studioWallClockToISO(from, '00:00'), timeMax: studioWallClockToISO(to, '00:00') }
}

type LessonRow = { id: string; student_id: string; date: string; time: string; duration: number | null; status: string; google_event_id: string | null }

const LESSON_COLUMNS = 'id, student_id, date, time, duration, status, google_event_id'

/** Reads the lessons and events the check compares. Throws when either source fails outright. */
export async function loadSyncInput(client: DbClient, port: CalendarPort, today: string = studioToday()): Promise<SyncInput> {
    const w = syncWindow(today)

    const { data: windowRows, error } = await client
        .from('lessons')
        .select(LESSON_COLUMNS)
        .gte('date', w.from)
        .lt('date', w.to)
        .limit(2000)
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    const rows = (windowRows ?? []) as LessonRow[]

    const minMs = Date.parse(w.timeMin)
    const maxMs = Date.parse(w.timeMax)
    const windowEvents = (await port.listEvents(w.timeMin, w.timeMax))
        .map(e => toSyncEvent(e, port.portalAccount))
        .filter(e => e.id && (e.allDayDate
            ? e.allDayDate >= w.from && e.allDayDate < w.to
            : !!e.start && Date.parse(e.start) >= minMs && Date.parse(e.start) < maxMs))

    // Lessons outside the window that point at an event inside it.
    const known = new Set(rows.map(r => r.google_event_id).filter(Boolean))
    const ask = windowEvents.map(e => e.id).filter(id => !known.has(id))
    for (let i = 0; i < ask.length; i += 100) {
        const { data, error: refError } = await client.from('lessons').select(LESSON_COLUMNS).in('google_event_id', ask.slice(i, i + 100))
        if (refError) throw new Error(`lessons query failed: ${refError.message}`)
        for (const r of (data ?? []) as LessonRow[]) if (!rows.some(x => x.id === r.id)) rows.push(r)
    }

    const studentIds = [...new Set(rows.map(r => r.student_id))]
    const profiles = new Map<string, { name: string | null; lesson_duration: number | null }>()
    for (let i = 0; i < studentIds.length; i += 200) {
        const { data, error: pError } = await client.from('profiles').select('id, name, lesson_duration').in('id', studentIds.slice(i, i + 200))
        if (pError) throw new Error(`profiles query failed: ${pError.message}`)
        for (const p of data ?? []) profiles.set(p.id as string, { name: p.name as string | null, lesson_duration: p.lesson_duration as number | null })
    }

    const lessons: SyncLesson[] = rows.map(r => {
        const p = profiles.get(r.student_id)
        return {
            id: r.id,
            // Same fallbacks as when a lesson is booked (scheduleLessonCore).
            studentName: p?.name || 'Student',
            date: r.date,
            time: String(r.time).slice(0, 5),
            duration: Number(r.duration) || Number(p?.lesson_duration) || 60,
            status: r.status,
            eventId: r.google_event_id || null,
        }
    })

    // Scheduled window lessons whose event is not in the window: ask Google about each.
    const inList = new Set(windowEvents.map(e => e.id))
    const linked = new Map<string, LinkedLookup>()
    for (const l of lessons) {
        if (l.status !== 'scheduled' || l.date < w.from || l.date >= w.to) continue
        if (!l.eventId || inList.has(l.eventId) || linked.has(l.eventId)) continue
        try {
            const e = await port.getEvent(l.eventId)
            linked.set(l.eventId, e ? toSyncEvent(e, port.portalAccount) : null)
        } catch (e) {
            linked.set(l.eventId, { error: errorText(e) })
        }
    }

    return { window: { from: w.from, to: w.to }, lessons, windowEvents, linked }
}

// ------------------------------------------------------------- words ---

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function clock(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour = h % 12 === 0 ? 12 : h % 12
    return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}

function day(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const when = (date: string, time: string) => `${day(date)}, ${clock(time)} ${studioTzAbbr(date)}`

function eventWhen(e: SyncEvent): string {
    if (!e.start) return `${e.allDayDate ? day(e.allDayDate) : 'unknown day'}, all day`
    const s = isoToStudioWallClock(e.start)
    return when(s.localDate, s.localTime)
}

/** The event's old slot, for "was ..." (date shown only when it differs from the lesson's). */
function wasSlot(e: SyncEvent, lessonDate: string): string {
    if (!e.start || !e.end) return 'was an all-day event'
    const s = isoToStudioWallClock(e.start)
    const t = isoToStudioWallClock(e.end)
    const startWords = s.localDate === lessonDate ? clock(s.localTime) : `${day(s.localDate)}, ${clock(s.localTime)}`
    const endWords = t.localDate === s.localDate ? clock(t.localTime) : `${clock(t.localTime)} the next day`
    return `was ${startWords} to ${endWords}`
}

const lessonWords = (l: SyncLesson) => `${when(l.date, l.time)}, ${escapeHtml(l.studentName)} (${l.duration} min)`

/**
 * One line of the email (HTML-escaped): what was done, or with `planned` what
 * it would do / tried to do (dry runs and failures).
 */
export function describeResult(r: SyncResult, { planned = !r.done }: { planned?: boolean } = {}): string {
    const v = (done: string, todo: string) => (planned ? todo : done)
    switch (r.kind) {
        case 'create':
            return r.why === 'event-gone'
                ? `Put back the event that was deleted from the calendar: ${lessonWords(r.lesson)}`
                : `${v('Added', 'Add')} the missing event: ${lessonWords(r.lesson)}`
        case 'retime':
            return r.recreated
                ? `The event was gone, so made a new one: ${lessonWords(r.lesson)}`
                : `${v('Fixed', 'Fix')} the time: ${lessonWords(r.lesson)} (${wasSlot(r.event, r.lesson.date)})`
        case 'link':
            return `${v('Linked', 'Link')} the lesson to its unlinked event${r.retime ? ` and ${v('fixed', 'fix')} the time (${wasSlot(r.event, r.lesson.date)})` : ''}: ${lessonWords(r.lesson)}`
        case 'delete':
            return `${v('Removed', 'Remove')} a leftover event with no lesson behind it: ${eventWhen(r.event)}, "${escapeHtml(r.event.summary)}"`
        case 'leave':
            return `${eventWhen(r.event)}, "${escapeHtml(r.event.summary || '(no title)')}": ${escapeHtml(r.reason)}`
        case 'error':
            return `${lessonWords(r.lesson)}: ${escapeHtml(r.message)}`
    }
}

export type SyncEmail = { subject: string; lines: string[]; html: string; footer: string }

/** The email to the studio inbox, or null when there is nothing to say. */
export function buildCalendarSyncEmail(results: SyncResult[], { dryRun = false }: { dryRun?: boolean } = {}): SyncEmail | null {
    const fixed = results.filter(r => r.kind !== 'leave' && r.kind !== 'error' && (r.done || dryRun) && !r.error)
    const failed = results.filter(r => r.kind === 'error' || r.error)
    const left = results.filter(r => r.kind === 'leave')
    if (!fixed.length && !failed.length && !left.length) return null

    const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`
    const parts = [
        fixed.length ? `${dryRun ? 'would fix' : 'fixed'} ${n(fixed.length, 'event')}` : '',
        failed.length ? `${n(failed.length, 'problem')}` : '',
        left.length ? `${left.length} to check` : '',
    ].filter(Boolean)
    const subject = `Calendar check: ${parts.join(', ')}`

    const fixedLine = (r: SyncResult) => describeResult(r, { planned: dryRun })
    const failedLine = (r: SyncResult) => (r.error ? `${describeResult(r, { planned: true })}: ${escapeHtml(r.error)}` : describeResult(r))
    const leftLine = (r: SyncResult) => describeResult(r)
    const section = (title: string, items: SyncResult[], line: (r: SyncResult) => string) =>
        items.length ? `<p style="margin:16px 0 4px"><strong>${title}</strong></p><ul>${items.map(r => `<li>${line(r)}</li>`).join('')}</ul>` : ''
    const html = [
        section(dryRun ? 'Would fix' : 'Fixed', fixed, fixedLine),
        section('Could not fix', failed, failedLine),
        section('Left alone, please check', left, leftLine),
    ].join('')
    const lines = [...fixed.map(fixedLine), ...failed.map(failedLine), ...left.map(leftLine)]
    const footer = `From the morning calendar check, which compares the next ${SYNC_DAYS} days of lessons with the studio calendar. ` +
        'It only ever changes lesson events the portal made itself. To see what it would do without changing anything: /api/cron/calendar-sync?dry=1'
    return { subject, lines, html, footer }
}

// --------------------------------------------------------------- run ---

export type SyncRun = {
    window: { from: string; to: string }
    checked: number
    matched: number
    results: SyncResult[]
    email: SyncEmail | null
    emailed: boolean
}

export async function runCalendarSync(
    client: DbClient,
    {
        dryRun = false,
        today,
        port = googleCalendarPort(),
        send = sendCronAlert,
    }: { dryRun?: boolean; today?: string; port?: CalendarPort; send?: typeof sendCronAlert } = {},
): Promise<SyncRun> {
    const input = await loadSyncInput(client, port, today)
    const plan = planCalendarSync(input)

    const save: SaveEventId = async (lessonId, eventId) => {
        const { error } = await client.from('lessons').update({ google_event_id: eventId }).eq('id', lessonId)
        if (error) throw new Error(error.message)
    }
    const results: SyncResult[] = dryRun
        ? plan.actions.map(a => ({ ...a, done: false }))
        : await applyCalendarSync(plan, port, save)

    const email = buildCalendarSyncEmail(results, { dryRun })
    const emailed = !dryRun && email ? await send(client, email) : false
    return { window: plan.window, checked: plan.checked, matched: plan.matched, results, email, emailed }
}

/** A result as plain JSON for the route's answer. */
export function resultJson(r: SyncResult) {
    const lesson = 'lesson' in r ? r.lesson : null
    const event = 'event' in r ? r.event : null
    return {
        kind: r.kind,
        done: r.done,
        lessonId: lesson?.id ?? null,
        date: lesson?.date ?? (event ? eventWhen(event) : null),
        time: lesson?.time ?? null,
        duration: lesson?.duration ?? null,
        student: lesson?.studentName ?? null,
        eventId: event?.id ?? lesson?.eventId ?? null,
        eventSummary: event?.summary ?? null,
        eventWas: event && lesson ? wasSlot(event, lesson.date) : event ? eventWhen(event) : null,
        why: r.kind === 'create' ? r.why : r.kind === 'leave' ? r.reason : r.kind === 'error' ? r.message : r.kind === 'link' && r.retime ? 'time fixed too' : null,
        newEventId: r.newEventId ?? null,
        error: r.error ?? null,
        line: describeResult(r),
    }
}
