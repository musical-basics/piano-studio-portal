import type { DbClient } from '@/lib/supabase/admin'
import { logLessonCore } from '@/lib/core/lessons'

/**
 * The one way the portal logs a classroom lesson by itself, used by both:
 *   - the classroom video hand-off (#537, lib/classroom-recordings.ts): a 20+
 *     minute classroom video landed on the lesson;
 *   - classroom attendance (#795, lib/classroom-attendance.ts): Lionel and the
 *     student were in the classroom together for 20+ minutes.
 *
 * It is the same logLessonCore the admin "Log" button runs (one credit, next
 * week booked, lesson email). Exactly one log per lesson, whichever gets there
 * first: the lesson must still be 'scheduled' with no credit taken (re-read
 * here), and each path first claims the lesson with a row in
 * lesson_auto_logs (primary key = lesson id), so two runs at the same moment
 * (the video webhook and the attendance webhook at the end of a lesson) cannot
 * both log it. A failed log gives its claim back so a later run can retry.
 * The claim row stays as the record of what logged the lesson and why.
 */

export type ClassroomLogSource = 'classroom_video' | 'classroom_attendance'

/** Ledger labels (credit_transactions.source), so the credit history says why. */
export const CLASSROOM_LOG_LEDGER_SOURCE: Record<ClassroomLogSource, string> = {
    classroom_video: 'logged by classroom video (20+ min)',
    classroom_attendance: 'logged by attendance (classroom, 20+ min together)',
}

export async function studioAdminId(supabase: DbClient): Promise<string | null> {
    const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    return data?.id ?? null
}

export async function autoLogClassroomLesson(
    supabase: DbClient,
    lesson: { id: string; date: string; time: string },
    opts: {
        source: ClassroomLogSource
        /** Video length or time together, for the claim row. */
        minutes: number
        log: (msg: string) => void
        getAdminId: () => Promise<string | null>
    },
): Promise<{ creditDeducted: boolean } | null> {
    const { source, minutes, log } = opts
    const { data: fresh, error } = await supabase
        .from('lessons')
        .select('student_id, status, credit_snapshot_before, credit_snapshot')
        .eq('id', lesson.id)
        .maybeSingle()
    if (error || !fresh) {
        log(`not logging lesson ${lesson.id}: re-read failed (${error?.message ?? 'lesson gone'})`)
        return null
    }
    if (fresh.status !== 'scheduled' || fresh.credit_snapshot_before !== null || fresh.credit_snapshot !== null) {
        log(`not logging lesson ${lesson.id}: it was logged meanwhile (${fresh.status})`)
        return null
    }

    const adminId = await opts.getAdminId()
    if (!adminId) {
        log(`not logging lesson ${lesson.id}: no admin profile found`)
        return null
    }

    // Claim it. A duplicate key means the other path is logging it right now
    // (or already did): this one stops.
    const { error: claimError } = await supabase
        .from('lesson_auto_logs')
        .insert({ lesson_id: lesson.id, source, minutes: Math.round(minutes) })
    if (claimError) {
        log(claimError.code === '23505'
            ? `not logging lesson ${lesson.id}: already logged automatically`
            : `not logging lesson ${lesson.id}: claim failed (${claimError.message})`)
        return null
    }
    const giveBack = () => supabase.from('lesson_auto_logs').delete().eq('lesson_id', lesson.id)

    const started = Date.now()
    try {
        const res = await logLessonCore({
            client: supabase,
            adminId,
            lessonId: lesson.id,
            notes: '',
            // 'system' stays the classroom video's value (the morning email and
            // weekly summary tell it apart by the video on the lesson).
            completedSource: source === 'classroom_attendance' ? 'classroom_attendance' : 'system',
            // Wait for the emails: a serverless function may stop once it returns.
            awaitNotifications: true,
        })
        if ('error' in res) {
            await giveBack()
            log(`logging lesson ${lesson.id} failed: ${res.error}`)
            return null
        }
        await labelLedgerRow(supabase, fresh.student_id as string, res.lesson, started, CLASSROOM_LOG_LEDGER_SOURCE[source])
        log(`logged lesson ${lesson.id} (${lesson.date} ${lesson.time}) by ${source.replace('classroom_', 'classroom ')}: ${res.message}`)
        return { creditDeducted: res.credit_deducted }
    } catch (err: any) {
        await giveBack()
        log(`logging lesson ${lesson.id} threw: ${err?.message ?? err}`)
        return null
    }
}

/**
 * The ledger trigger cannot see a source set over the REST API, so label the
 * row the log just wrote (same student and balances, written since we began).
 */
async function labelLedgerRow(
    supabase: DbClient,
    studentId: string,
    logged: { credit_snapshot_before?: number | null; credit_snapshot?: number | null } | null | undefined,
    startedMs: number,
    source: string,
): Promise<void> {
    const before = logged?.credit_snapshot_before
    const after = logged?.credit_snapshot
    if (before == null || after == null || before === after) return
    const { data: rows } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('student_id', studentId)
        .eq('previous_credits', before)
        .eq('new_credits', after)
        .is('source', null)
        .gte('changed_at', new Date(startedMs - 60_000).toISOString())
        .order('changed_at', { ascending: false })
        .limit(1)
    if (rows && rows[0]) {
        const { error } = await supabase.from('credit_transactions').update({ source }).eq('id', rows[0].id)
        if (error) console.error('[classroom-auto-log] ledger label not saved:', error.message)
    }
}
