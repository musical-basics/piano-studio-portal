/**
 * Homework as a checklist (#945). Plain helpers shared by the family's Homework
 * tab, Lionel's admin view and the server: no database or server-only imports.
 *
 * lessons.homework is free text, one item per line by convention. Common list
 * marks ("1.", "2)", "-", "*", bullets) are stripped so a pasted list doesn't
 * show its marks twice; a one-line homework is one item.
 */

export function homeworkItems(text: string | null | undefined): string[] {
    return String(text ?? '')
        .split(/\r?\n/)
        .map(line => line.replace(/^\s*(?:[-*•‣◦]|\d+[.)])\s*/, '').trim())
        .filter(Boolean)
}

/** One ticked item as stored (homework_ticks). */
export type HomeworkTick = { lesson_id: string; item_index: number; item_text: string }

/**
 * Which of a lesson's items are ticked. A tick counts only while the item at
 * its place still reads the same, so editing the homework never moves a tick
 * onto a different item.
 */
export function tickedIndexes(lessonId: string, items: string[], ticks: HomeworkTick[]): Set<number> {
    const out = new Set<number>()
    for (const t of ticks) {
        if (t.lesson_id === lessonId && items[t.item_index] === t.item_text) out.add(t.item_index)
    }
    return out
}

/** What Lionel sees for a student's current homework before the next lesson. */
export type HomeworkStatus = {
    /** The lesson the homework came from (the student's latest logged lesson). */
    lessonId: string
    lessonDate: string
    items: { text: string; ticked: boolean }[]
    ticked: number
}
