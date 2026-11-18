/**
 * Studio-wide rules that show up in more than one place. Change them here only.
 */

/** Youngest age the studio teaches (Lionel, 2026-11-12: "11 and above ... that's our age limit"). */
export const MIN_STUDENT_AGE = 11

/**
 * Credits at or above this mark an account that is not a paying student: the
 * two teacher accounts hold about 998 credits and their lessons are never
 * logged. Lionel, 2026-11-18 (#734): "teacher credits aren't tracked by me so
 * dont worry about it". So the unlogged-lesson emails (8:30am, 11pm and the
 * monthly credit check) leave them out. No real student comes near this many.
 */
export const UNTRACKED_ACCOUNT_MIN_CREDITS = 900

/** A teacher account whose credits nobody tracks (see UNTRACKED_ACCOUNT_MIN_CREDITS). */
export function isUntrackedTeacherAccount(profile: { credits?: number | null } | null | undefined): boolean {
    return Number(profile?.credits ?? 0) >= UNTRACKED_ACCOUNT_MIN_CREDITS
}
