import type { DbClient } from '@/lib/supabase/admin'

/**
 * Last lesson's homework (Lionel's #943): the homework of the student's most
 * recent earlier lesson that has any. The email's Log it page and the admin
 * log dialogs pre-fill their Homework box with it, so only what changed needs
 * typing. It is only a starting text: edited or cleared, what is in the box
 * when he logs is what is saved.
 */

export type LastHomework = {
    homework: string
    /** The lesson it came from, YYYY-MM-DD. */
    date: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

/** "Before" means an earlier date, or the same date at an earlier time. Null when there is none. */
export async function findLastHomework(
    client: DbClient,
    studentId: string,
    before: { date: string; time: string },
): Promise<LastHomework | null> {
    const date = before.date
    const time = String(before.time).slice(0, 5)
    if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null
    const { data, error } = await client
        .from('lessons')
        .select('date, time, homework')
        .eq('student_id', studentId)
        .not('homework', 'is', null)
        .or(`date.lt.${date},and(date.eq.${date},time.lt.${time})`)
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .limit(10)
    if (error) throw new Error(`lessons query failed: ${error.message}`)
    const row = (data || []).find(r => String(r.homework ?? '').trim())
    return row ? { homework: String(row.homework).trim(), date: row.date as string } : null
}
