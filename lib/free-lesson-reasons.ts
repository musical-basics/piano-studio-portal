/**
 * Ready reasons for a free lesson (Lionel's #947), offered as one-tap chips
 * next to "Free, don't take a credit" in the admin log dialog, so the history
 * reads the same way every time. Typing any other reason still works. Change
 * this list to change the chips. Safe for the browser: no server imports.
 */
export const FREE_LESSON_REASONS: readonly string[] = [
    'Make-up',
    'My mistake',
    'Trial',
    'Gift',
]

/** The reason a new student's free trial is logged with automatically (#946, lib/free-trial.ts). */
export const FREE_TRIAL_REASON = 'Trial'
