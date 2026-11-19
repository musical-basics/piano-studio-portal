/**
 * "Running late" (#788): the one-line note Lionel sends a family when he is
 * late for today's lesson. His approved wording, built from his own past chat
 * lines ("My apologies running late ...", "Be on in 15 mins"). Plain module so
 * the confirm dialog and the server build the exact same text.
 */

export const RUNNING_LATE_MINUTES = [5, 10, 15] as const
export type RunningLateMinutes = (typeof RUNNING_LATE_MINUTES)[number]
export const DEFAULT_RUNNING_LATE_MINUTES: RunningLateMinutes = 10

export function isRunningLateMinutes(n: unknown): n is RunningLateMinutes {
    return RUNNING_LATE_MINUTES.includes(n as RunningLateMinutes)
}

export function runningLateMessage(minutes: RunningLateMinutes): string {
    return `My apologies, running late, be on in ${minutes} mins`
}
