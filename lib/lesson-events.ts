import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The record behind admin's "Today's changes" (#1005): one lesson_events row
 * each time a lesson is booked, moved, cancelled, removed, logged, marked a
 * no-show or missed, has its log undone, or is held or released, with who did
 * it. Written next to the real action and never allowed to fail it.
 * Since #1086 and #1097 also 'cancel_undone' and 'no_show_undone' (undone
 * within 10 minutes).
 */

export const LESSON_EVENT_KINDS = ['booked', 'moved', 'cancelled', 'removed', 'logged', 'no_show', 'missed', 'unlogged', 'held', 'released', 'cancel_undone', 'no_show_undone'] as const
export type LessonEventKind = (typeof LESSON_EVENT_KINDS)[number]

/** admin = Lionel (pages, his email buttons, his agent); family = student or parent; auto = the portal on its own. */
export type LessonEventActor = 'admin' | 'family' | 'auto'

/** What a caller knows better than the core function's default. */
export type LessonEventContext = {
    actor?: LessonEventActor
    /** How it came in, e.g. 'agent', 'email button', 'make-up picker'. */
    via?: string
    /** Why, in a few words, e.g. 'student set inactive', 'make-up for a missed lesson'. */
    reason?: string
}

export type LessonEventInput = {
    kind: LessonEventKind
    actor: LessonEventActor
    studentId: string
    lessonId?: string | null
    /** The lesson's studio (Eastern) date and time; for a move, the new slot. */
    date?: string | null
    time?: string | null
    detail?: Record<string, unknown>
    context?: LessonEventContext | null
}

/** Who logged it, from lessons.completed_source. */
export function actorForCompletedSource(source: string | null | undefined): LessonEventActor {
    return source === 'zoom_webhook' || source === 'system' || source === 'classroom_attendance' ? 'auto' : 'admin'
}

/** Never throws and never fails the action it describes. */
export async function recordLessonEvent(ev: LessonEventInput): Promise<void> {
    try {
        const ctx = ev.context ?? {}
        const detail: Record<string, unknown> = { ...(ev.detail ?? {}) }
        if (ctx.via) detail.via = ctx.via
        if (ctx.reason) detail.reason = ctx.reason
        const { error } = await createAdminClient().from('lesson_events').insert({
            kind: ev.kind,
            actor: ctx.actor ?? ev.actor,
            student_id: ev.studentId,
            lesson_id: ev.lessonId ?? null,
            lesson_date: ev.date ?? null,
            lesson_time: ev.time ? String(ev.time).slice(0, 5) : null,
            detail,
        })
        if (error) console.error(`[lesson-events] ${ev.kind} not recorded:`, error.message)
    } catch (e: any) {
        console.error(`[lesson-events] ${ev.kind} not recorded:`, e?.message ?? e)
    }
}
