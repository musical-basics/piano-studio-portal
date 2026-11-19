/**
 * Homework ticks (#945): the family ticks off its current homework during the
 * week; Lionel sees what is ticked before the next lesson. The current homework
 * is the homework of the student's latest logged lesson; older lessons'
 * homework is read only. Every function here uses the service key: callers
 * check who is asking.
 */

import type { DbClient } from '@/lib/supabase/admin'
import { homeworkItems, tickedIndexes, type HomeworkStatus, type HomeworkTick } from '@/lib/homework'
import { shiftDateStr, studioToday } from '@/lib/studio-timezone'

/** How far back a logged lesson still counts as "the latest" for Lionel's view. */
const CURRENT_WITHIN_DAYS = 120

type LoggedLesson = { id: string; student_id: string; date: string; time: string; homework: string | null }

/** The student's latest logged lesson (homework or not), or null. */
export async function latestLoggedLesson(client: DbClient, studentId: string): Promise<LoggedLesson | null> {
    const { data, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, homework')
        .eq('student_id', studentId)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .limit(1)
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    return (data?.[0] as LoggedLesson) ?? null
}

/**
 * Ticks or unticks one item of the family's current homework. The caller must
 * have checked that `studentId` is the signed-in family itself (never an admin
 * preview). Only the latest logged lesson's homework can be ticked, and the item
 * must still read as the family saw it.
 */
export async function setHomeworkTickCore(
    client: DbClient,
    { studentId, lessonId, index, text, checked }: { studentId: string; lessonId: string; index: number; text: string; checked: boolean },
): Promise<{ success: true } | { error: string }> {
    if (!Number.isInteger(index) || index < 0) return { error: 'That item was not found. Refresh the page.' }
    let latest: LoggedLesson | null
    try {
        latest = await latestLoggedLesson(client, studentId)
    } catch {
        return { error: 'Your homework could not be saved just now. Please try again.' }
    }
    if (!latest || latest.id !== lessonId) {
        return { error: 'Only the homework from your latest lesson can be ticked. Refresh the page.' }
    }
    const items = homeworkItems(latest.homework)
    if (items[index] !== text) return { error: 'This homework was changed by your teacher. Refresh the page.' }

    if (checked) {
        const { error } = await client
            .from('homework_ticks')
            .upsert({ lesson_id: lessonId, student_id: studentId, item_index: index, item_text: text, ticked_at: new Date().toISOString() }, { onConflict: 'lesson_id,item_index' })
        if (error) return { error: 'Your tick could not be saved just now. Please try again.' }
    } else {
        const { error } = await client.from('homework_ticks').delete().eq('lesson_id', lessonId).eq('item_index', index)
        if (error) return { error: 'Your change could not be saved just now. Please try again.' }
    }
    return { success: true }
}

/** All of a student's ticks (their Homework tab). */
export async function homeworkTicksFor(client: DbClient, studentId: string): Promise<HomeworkTick[]> {
    const { data, error } = await client.from('homework_ticks').select('lesson_id, item_index, item_text').eq('student_id', studentId)
    if (error) throw new Error(`homework_ticks query failed: ${error.message}`)
    return (data || []) as HomeworkTick[]
}

/**
 * For Lionel: each student's current homework (their latest logged lesson in
 * the last CURRENT_WITHIN_DAYS days, when it has homework) with what is ticked.
 * Students whose latest lesson has no homework are left out.
 */
export async function homeworkStatusByStudent(client: DbClient): Promise<Record<string, HomeworkStatus>> {
    const since = shiftDateStr(studioToday(), -CURRENT_WITHIN_DAYS)
    const { data, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, homework')
        .eq('status', 'completed')
        .gte('date', since)
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .limit(5000)
    if (error) throw new Error(`lessons query failed: ${error.message}`)

    const latest = new Map<string, LoggedLesson>()
    for (const l of (data || []) as LoggedLesson[]) {
        if (!latest.has(l.student_id)) latest.set(l.student_id, l)
    }
    const withHomework = [...latest.values()].filter(l => homeworkItems(l.homework).length > 0)
    if (withHomework.length === 0) return {}

    const { data: tickRows, error: tickError } = await client
        .from('homework_ticks')
        .select('lesson_id, item_index, item_text')
        .in('lesson_id', withHomework.map(l => l.id))
    if (tickError) throw new Error(`homework_ticks query failed: ${tickError.message}`)
    const ticks = (tickRows || []) as HomeworkTick[]

    const out: Record<string, HomeworkStatus> = {}
    for (const l of withHomework) {
        const items = homeworkItems(l.homework)
        const done = tickedIndexes(l.id, items, ticks)
        out[l.student_id] = {
            lessonId: l.id,
            lessonDate: l.date,
            items: items.map((text, i) => ({ text, ticked: done.has(i) })),
            ticked: done.size,
        }
    }
    return out
}
