/**
 * "Undo" right after a mis-tap in admin: 10 minutes after Lionel cancels a
 * lesson (#1086, lib/core/undo-cancel.ts) or marks it a no-show (#1097,
 * lib/core/no-show.ts). The admin bar counts down with this; the server checks
 * the time again before it changes anything. Pure, so the bar can use it too.
 */

export const UNDO_WINDOW_MS = 10 * 60_000

/** Milliseconds of Undo left after something done at `atIso`; 0 once it ran out. */
export function undoMsLeft(atIso: string | null | undefined, now: number = Date.now()): number {
    const at = atIso ? Date.parse(atIso) : NaN
    if (Number.isNaN(at)) return 0
    return Math.max(0, at + UNDO_WINDOW_MS - now)
}

/** "8 min left", "under a minute left". */
export function undoLeftLabel(msLeft: number): string {
    const min = Math.floor(msLeft / 60_000)
    return min >= 1 ? `${min} min left` : 'under a minute left'
}

/**
 * What cancelLessonCore keeps on the cancellation_log row (undo_snapshot) so a
 * cancel can be undone: the deleted lessons row, its homework ticks (deleted
 * with it), and how it was cancelled.
 */
export type CancelUndoSnapshot = {
    lesson: Record<string, any>
    homework_ticks: Array<{ item_index: number; item_text: string; ticked_at: string }>
    /** 'missed' = "I missed this", which has its own credit and apology. */
    kind: 'cancelled' | 'missed'
    /** false = cleared quietly (student set inactive, "I missed this"). */
    notify: boolean
    via: string | null
}

/**
 * Why a cancel can't be undone, or null when it can. Only Lionel's own single
 * cancel of a lesson that was still to be taught qualifies: never a family's
 * cancel (it may carry a late fee and its own messages), "I missed this" (its
 * credit and apology), the quiet clear-out when a student goes inactive, or a
 * lesson that was already logged. The time and the slot are checked apart.
 */
export function cancelUndoBlock(row: {
    cancelled_by: string
    undone_at: string | null
    undo_snapshot: CancelUndoSnapshot | null
}): string | null {
    if (row.undone_at) return 'This cancel was already undone.'
    const snap = row.undo_snapshot
    if (!snap || !snap.lesson) return 'This cancel happened before Undo existed, so there is nothing to put back.'
    if (row.cancelled_by !== 'admin') return "Only your own cancels can be undone here, not a family's."
    if (snap.kind !== 'cancelled') return 'This was "I missed this", which has its own credit and apology, so it is not undone here.'
    if (!snap.notify) return 'This lesson was cleared quietly (the student was set inactive), so it is not undone here.'
    if (snap.lesson.status !== 'scheduled') return `This lesson was ${snap.lesson.status === 'completed' ? 'already logged' : `marked "${snap.lesson.status}"`} when it was cancelled, so it is not booked back here.`
    return null
}
