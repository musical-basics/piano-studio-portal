import { isoToStudioWallClock } from '@/lib/studio-timezone'
import type { LessonEventActor, LessonEventKind } from '@/lib/lesson-events'

/**
 * Admin's "Today's changes" (Lionel's #1005): every lesson booked, moved,
 * cancelled or logged and every credit change on one studio (Eastern) day,
 * whoever did it, newest first, in plain words.
 *
 * Since 2026-11-20 each lesson change writes a lesson_events row that says who
 * did it (lib/lesson-events.ts). For anything without one (older days, or a
 * path that does not write it) the list is rebuilt from what the older records
 * hold: cancellation_log, lessons.created_at, lesson_auto_logs, approved move
 * requests, and the lesson a credit change took its snapshot from. Those lines
 * are marked `derived`. Every credit_transactions row of the day is shown,
 * either inside the lesson line it belongs to or as its own line.
 *
 * Pure: the rows come in, the lines go out (loading is lib/core/day-changes.ts).
 */

export type DayChangeWho = 'you' | 'the family' | 'the portal on its own'

export type DayChange = {
    id: string
    /** When it happened (ISO instant), for ordering. */
    at: string
    /** "4:12pm", Eastern. */
    clock: string
    studentId: string | null
    studentName: string
    kind: LessonEventKind | 'credit'
    /** "Logged Thu Nov 20, 4:30pm". */
    what: string
    /** "lessons left 5 to 4, from the email button", or null. */
    extra: string | null
    /** Null when the records do not say. */
    who: DayChangeWho | null
    /** Rebuilt from older records rather than recorded when it happened. */
    derived: boolean
}

export type EventRow = {
    id: string
    lesson_id: string | null
    student_id: string
    kind: LessonEventKind
    actor: LessonEventActor
    lesson_date: string | null
    lesson_time: string | null
    detail: Record<string, any> | null
    created_at: string
}
export type CreditRow = {
    id: string
    student_id: string
    previous_credits: number
    new_credits: number
    delta: number
    source: string | null
    note: string | null
    changed_at: string
}
export type CancellationRow = {
    id: string
    lesson_id: string | null
    student_id: string
    lesson_date: string
    lesson_time: string
    cancelled_by: string
    was_late: boolean
    fee_charged: number | string
    cancelled_at: string
}
/** A lesson row (for bookings made that day, automatic logs, and matching credit snapshots). */
export type LessonRow = {
    id: string
    student_id: string
    date: string
    time: string
    status: string
    created_at: string
    completed_source: string | null
    credit_snapshot_before: number | null
    credit_snapshot: number | null
    free_reason?: string | null
}
export type AutoLogRow = { lesson_id: string; source: string; minutes: number | null; created_at: string }
export type MoveRow = {
    id: string
    lesson_id: string
    student_id: string
    from_date: string
    from_time: string
    to_date: string
    to_time: string
    decided_via: string | null
    decided_at: string
    outcome: string | null
}

export type DayChangeInput = {
    events: EventRow[]
    credits: CreditRow[]
    cancellations: CancellationRow[]
    /** Lessons whose row was created that day. */
    created: LessonRow[]
    autoLogs: AutoLogRow[]
    moves: MoveRow[]
    /** Lessons by id: the ones the automatic logs point at, plus those a credit change may have come from. */
    lessons: Map<string, LessonRow>
    names: Map<string, string>
}

/** How close a credit change and the lesson change it belongs to must be. */
const FOLD_WINDOW_MS = 10 * 60_000

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function clock(hhmm: string | null | undefined): string {
    if (!hhmm) return ''
    const [h, m = '00'] = hhmm.slice(0, 5).split(':')
    const hn = parseInt(h, 10)
    if (Number.isNaN(hn)) return ''
    return `${hn % 12 || 12}:${m.padStart(2, '0')}${hn >= 12 ? 'pm' : 'am'}`
}

/** "Thu Nov 20, 4:30pm" for a studio date and time. */
export function lessonWhen(date: string | null | undefined, time?: string | null): string {
    if (!date) return 'a lesson'
    const d = new Date(`${date}T12:00:00Z`)
    const day = `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
    const t = clock(time)
    return t ? `${day}, ${t}` : day
}

function eventClock(iso: string): string {
    return clock(isoToStudioWallClock(iso).localTime)
}

export function whoFromActor(actor: LessonEventActor | null | undefined): DayChangeWho | null {
    if (actor === 'admin') return 'you'
    if (actor === 'family') return 'the family'
    if (actor === 'auto') return 'the portal on its own'
    return null
}

function whoFromCompletedSource(source: string | null | undefined): DayChangeWho | null {
    if (!source) return null
    return source === 'zoom_webhook' || source === 'system' || source === 'classroom_attendance' ? 'the portal on its own' : 'you'
}

function viaWords(via: unknown): string | null {
    if (typeof via !== 'string' || !via) return null
    if (via === 'agent') return 'through your agent'
    if (via === 'email button') return 'from the email button'
    return `from the ${via}`
}

function creditWords(before: unknown, after: unknown): string | null {
    if (typeof before !== 'number' || typeof after !== 'number') return null
    if (before === after) return `no credit taken (${after} left)`
    return `lessons left ${before} to ${after}`
}

function join(parts: Array<string | null | undefined | false>): string | null {
    const kept = parts.filter((p): p is string => typeof p === 'string' && p.length > 0)
    return kept.length ? kept.join(', ') : null
}

function logSourceWords(source: unknown): string | null {
    if (source === 'zoom_webhook') return 'Zoom recording'
    if (source === 'classroom_attendance') return 'classroom attendance'
    if (source === 'system') return 'classroom recording'
    return null
}

/** One lesson_events row in words. */
export function eventLine(ev: EventRow, name: string): DayChange {
    const d = ev.detail ?? {}
    const when = lessonWhen(ev.lesson_date, ev.lesson_time)
    let what = ''
    let extra: string | null = null
    switch (ev.kind) {
        case 'booked':
            what = `Booked ${when}`
            extra = join([d.reason, viaWords(d.via)])
            break
        case 'moved': {
            const from = d.from ?? {}
            const to = d.to ?? {}
            const sameSlot = from.date === to.date && String(from.time ?? '').slice(0, 5) === String(to.time ?? '').slice(0, 5)
            what = sameSlot
                ? `Changed ${lessonWhen(to.date, to.time)} to ${to.duration} min`
                : `Moved ${lessonWhen(from.date, from.time)} to ${lessonWhen(to.date ?? ev.lesson_date, to.time ?? ev.lesson_time)}`
            extra = join([d.reason, viaWords(d.via)])
            break
        }
        case 'cancelled':
            what = d.was_status === 'completed' ? `Deleted the logged lesson ${when}` : `Cancelled ${when}`
            extra = join([
                d.was_late ? 'late (inside 24 hours)' : null,
                Number(d.fee) > 0 ? `$${Number(d.fee).toFixed(2)} late fee added` : null,
                d.reason,
                viaWords(d.via),
            ])
            break
        case 'removed':
            what = `Removed ${when} (didn't happen)`
            extra = join(['no credit taken, nobody told', viaWords(d.via)])
            break
        case 'logged':
            what = d.added ? `Added and logged ${when}` : `Logged ${when}`
            extra = join([
                d.trial ? 'free trial' : d.free ? 'free' : null,
                d.repaired ? 'credit taken now (it had been completed without one)' : null,
                creditWords(d.credits_before, d.credits_after),
                logSourceWords(d.source),
                d.quiet ? 'logged late, no email' : null,
                viaWords(d.via),
            ])
            break
        case 'no_show':
            what = `Marked ${when} a no-show`
            extra = join([creditWords(d.credits_before, d.credits_after), viaWords(d.via)])
            break
        case 'missed':
            what = `You missed ${when} (lesson removed)`
            extra = join([d.reason, viaWords(d.via)])
            break
        case 'unlogged':
            what = d.mode === 'free' ? `Made the logged lesson ${when} free` : `Undid the log of ${when}`
            extra = join([creditWords(d.credits_before, d.credits_after), d.reason ? `why: ${d.reason}` : null])
            break
        case 'held':
            what = `Put ${when} on hold`
            extra = join([d.reason])
            break
        case 'released':
            what = `Released ${when} from hold`
            extra = join([d.reason ? `was: ${d.reason}` : null])
            break
        case 'cancel_undone':
            what = `Undid the cancel of ${when} (booked again)`
            extra = join([
                d.zoom === false ? 'no new Zoom meeting' : 'new Zoom link',
                d.calendar === false ? 'no calendar event' : 'calendar event back',
                Array.isArray(d.restored) && d.restored.length ? `kept its ${d.restored.join(', ')}` : null,
            ])
            break
        default:
            what = `${String(ev.kind)} ${when}`
    }
    return {
        id: `ev-${ev.id}`,
        at: ev.created_at,
        clock: eventClock(ev.created_at),
        studentId: ev.student_id,
        studentName: name,
        kind: ev.kind,
        what,
        extra,
        who: whoFromActor(ev.actor),
        derived: false,
    }
}

/** Who changed the credits, from the ledger label. */
export function creditSource(source: string | null, note: string | null, delta: number): { who: DayChangeWho | null; words: string } {
    const s = (source ?? '').trim()
    const n = (note ?? '').trim()
    if (/^test\b/i.test(s) || /^test\b/i.test(n)) return { who: null, words: `test entry${s ? ` (${s})` : ''}` }
    if (s === 'admin adjustment') return { who: 'you', words: n ? `adjustment: ${n}` : 'adjustment' }
    if (s === 'monthly plan' || s === 'lesson package') return { who: 'the family', words: `payment (${s})` }
    if (/^monthly plan renewal/i.test(s)) return { who: 'the portal on its own', words: 'plan renewal payment' }
    if (/^log undone: /i.test(s)) return { who: 'you', words: `log undone: ${s.replace(/^log undone: /i, '')}` }
    if (/^unlogged lesson logged late/i.test(s)) return { who: 'you', words: s }
    if (/^no-show/i.test(s)) return { who: 'you', words: 'no-show' }
    if (/^late charge/i.test(s)) return { who: 'you', words: s }
    if (/^logged by /i.test(s)) return { who: 'the portal on its own', words: s }
    if (s === 'free trial') return { who: 'the portal on its own', words: 'free trial' }
    if (s) return { who: null, words: n ? `${s}: ${n}` : s }
    if (n) return { who: null, words: n }
    return { who: null, words: delta > 0 ? 'lessons added, no reason recorded' : 'no reason recorded' }
}

function creditLine(c: CreditRow, name: string): DayChange {
    const { who, words } = creditSource(c.source, c.note, c.delta)
    const sign = c.delta > 0 ? `+${c.delta}` : String(c.delta)
    return {
        id: `cr-${c.id}`,
        at: c.changed_at,
        clock: eventClock(c.changed_at),
        studentId: c.student_id,
        studentName: name,
        kind: 'credit',
        what: `Lessons left ${c.previous_credits} to ${c.new_credits} (${sign})`,
        extra: words,
        who,
        derived: false,
    }
}

type Pending = { line: DayChange; credits?: { before: number | null; after: number | null } }

function within(a: string, b: string): boolean {
    return Math.abs(Date.parse(a) - Date.parse(b)) <= FOLD_WINDOW_MS
}

export function buildDayChanges(input: DayChangeInput): DayChange[] {
    const nameOf = (id: string | null | undefined) => (id && input.names.get(id)) || 'A student'
    const out: Pending[] = []

    // 1. What was recorded as it happened.
    const recordedByLesson = new Map<string, Set<string>>()
    for (const ev of input.events) {
        const d = ev.detail ?? {}
        out.push({
            line: eventLine(ev, nameOf(ev.student_id)),
            credits: typeof d.credits_before === 'number' && typeof d.credits_after === 'number' && d.credits_before !== d.credits_after
                ? { before: d.credits_before, after: d.credits_after }
                : undefined,
        })
        if (ev.lesson_id) {
            const kinds = recordedByLesson.get(ev.lesson_id) ?? new Set<string>()
            kinds.add(ev.kind)
            if (ev.kind === 'logged' && d.added) kinds.add('booked')
            recordedByLesson.set(ev.lesson_id, kinds)
        }
    }
    const recorded = (lessonId: string | null | undefined, ...kinds: string[]) =>
        Boolean(lessonId && kinds.some(k => recordedByLesson.get(lessonId)?.has(k)))

    // 2. Rebuilt from the older records, only where nothing was recorded.
    for (const c of input.cancellations) {
        if (recorded(c.lesson_id, 'cancelled', 'missed', 'removed')) continue
        const fee = Number(c.fee_charged) || 0
        out.push({
            line: {
                id: `cl-${c.id}`,
                at: c.cancelled_at,
                clock: eventClock(c.cancelled_at),
                studentId: c.student_id,
                studentName: nameOf(c.student_id),
                kind: 'cancelled',
                what: `Cancelled ${lessonWhen(c.lesson_date, c.lesson_time)}`,
                extra: join([c.was_late ? 'late (inside 24 hours)' : null, fee > 0 ? `$${fee.toFixed(2)} late fee added` : null]),
                who: c.cancelled_by === 'student' ? 'the family' : c.cancelled_by === 'admin' ? 'you' : null,
                derived: true,
            },
        })
    }
    for (const l of input.created) {
        if (recorded(l.id, 'booked')) continue
        const addedLogged = l.status === 'completed' && recorded(l.id, 'logged')
        if (addedLogged) continue
        out.push({
            line: {
                id: `lb-${l.id}`,
                at: l.created_at,
                clock: eventClock(l.created_at),
                studentId: l.student_id,
                studentName: nameOf(l.student_id),
                kind: 'booked',
                what: l.status === 'completed' ? `Added ${lessonWhen(l.date, l.time)} (already logged)` : `Booked ${lessonWhen(l.date, l.time)}`,
                extra: l.status === 'completed' || l.status === 'scheduled' ? null : `now marked ${l.status}`,
                who: null,
                derived: true,
            },
        })
    }
    for (const a of input.autoLogs) {
        if (recorded(a.lesson_id, 'logged')) continue
        const l = input.lessons.get(a.lesson_id)
        if (!l) continue
        out.push({
            line: {
                id: `al-${a.lesson_id}`,
                at: a.created_at,
                clock: eventClock(a.created_at),
                studentId: l.student_id,
                studentName: nameOf(l.student_id),
                kind: 'logged',
                what: `Logged ${lessonWhen(l.date, l.time)}`,
                extra: join([
                    typeof l.free_reason === 'string' ? 'free' : null,
                    creditWords(l.credit_snapshot_before, l.credit_snapshot),
                    `automatic (${a.source.replace(/_/g, ' ')}${a.minutes ? `, ${a.minutes} min` : ''})`,
                ]),
                who: 'the portal on its own',
                derived: true,
            },
            credits: l.credit_snapshot_before !== null && l.credit_snapshot !== null && l.credit_snapshot_before !== l.credit_snapshot
                ? { before: l.credit_snapshot_before, after: l.credit_snapshot }
                : undefined,
        })
        const kinds = recordedByLesson.get(a.lesson_id) ?? new Set<string>()
        kinds.add('logged')
        recordedByLesson.set(a.lesson_id, kinds)
    }
    for (const m of input.moves) {
        if (recorded(m.lesson_id, 'moved')) continue
        const picker = m.decided_via === 'family'
        out.push({
            line: {
                id: `mv-${m.id}`,
                at: m.decided_at,
                clock: eventClock(m.decided_at),
                studentId: m.student_id,
                studentName: nameOf(m.student_id),
                kind: 'moved',
                what: `Moved ${lessonWhen(m.from_date, m.from_time)} to ${lessonWhen(m.to_date, m.to_time)}`,
                extra: picker ? 'from the make-up picker' : join(['the family asked', m.decided_via === 'email' ? 'from the email button' : null]),
                who: picker ? 'the family' : 'you',
                derived: true,
            },
        })
    }

    // 3. Credit changes: inside the lesson line they belong to, else a line of their own.
    // Oldest first, each to the closest unclaimed line with the same balances
    // (a log and a no-show of the same lesson can both read 537 to 536).
    const usedLine = new Set<number>()
    const remaining: CreditRow[] = []
    const byTime = [...input.credits].sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    const lineCount = out.length
    for (const c of byTime) {
        let best = -1
        let bestGap = Infinity
        for (let idx = 0; idx < lineCount; idx++) {
            const p = out[idx]
            if (usedLine.has(idx) || p.line.studentId !== c.student_id) continue
            if (p.credits?.before !== c.previous_credits || p.credits?.after !== c.new_credits) continue
            if (!within(p.line.at, c.changed_at)) continue
            const gap = Math.abs(Date.parse(p.line.at) - Date.parse(c.changed_at))
            if (gap < bestGap) {
                best = idx
                bestGap = gap
            }
        }
        if (best >= 0) {
            usedLine.add(best)
            continue
        }
        remaining.push(c)
    }
    for (const c of remaining) {
        // An older log or no-show that wrote no event: the lesson that kept these balances.
        const label = (c.source ?? '').trim()
        const lessonish = c.delta < 0 && (!label || /^no-show/i.test(label) || /^unlogged lesson logged late/i.test(label) || /^logged by /i.test(label))
        const match = lessonish
            ? Array.from(input.lessons.values())
                .filter(l => l.student_id === c.student_id && l.credit_snapshot_before === c.previous_credits && l.credit_snapshot === c.new_credits)
                .sort((a, b) => b.date.localeCompare(a.date))[0]
            : undefined
        if (match && !recorded(match.id, 'logged', 'no_show')) {
            const noShow = match.status === 'cancelled'
            const { words, who: labelWho } = creditSource(c.source, c.note, c.delta)
            out.push({
                line: {
                    id: `cr-${c.id}`,
                    at: c.changed_at,
                    clock: eventClock(c.changed_at),
                    studentId: c.student_id,
                    studentName: nameOf(c.student_id),
                    kind: noShow ? 'no_show' : 'logged',
                    what: noShow ? `Marked ${lessonWhen(match.date, match.time)} a no-show` : `Logged ${lessonWhen(match.date, match.time)}`,
                    extra: join([creditWords(c.previous_credits, c.new_credits), label ? words : null]),
                    who: noShow ? 'you' : (label ? labelWho : null) ?? whoFromCompletedSource(match.completed_source),
                    derived: true,
                },
            })
            continue
        }
        out.push({ line: creditLine(c, nameOf(c.student_id)) })
    }

    return out.map(p => p.line).sort((a, b) => b.at.localeCompare(a.at))
}

/** "3 logged, 1 cancelled, 2 credit changes". */
export function summarizeDayChanges(lines: DayChange[]): string {
    const order: Array<[DayChange['kind'], string, string]> = [
        ['booked', 'booked', 'booked'],
        ['moved', 'moved', 'moved'],
        ['cancelled', 'cancelled', 'cancelled'],
        ['removed', 'removed', 'removed'],
        ['logged', 'logged', 'logged'],
        ['no_show', 'no-show', 'no-shows'],
        ['missed', 'missed', 'missed'],
        ['unlogged', 'log undone', 'logs undone'],
        ['held', 'put on hold', 'put on hold'],
        ['released', 'released', 'released'],
        ['cancel_undone', 'cancel undone', 'cancels undone'],
        ['credit', 'other credit change', 'other credit changes'],
    ]
    const parts: string[] = []
    for (const [kind, one, many] of order) {
        const n = lines.filter(l => l.kind === kind).length
        if (n) parts.push(`${n} ${n === 1 ? one : many}`)
    }
    return parts.join(', ')
}
