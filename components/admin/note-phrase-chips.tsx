"use client"

import { LESSON_NOTE_PHRASES } from "@/lib/lesson-note-phrases"
import { FREE_LESSON_REASONS } from "@/lib/free-lesson-reasons"

/**
 * One-tap phrases under a lesson notes box (#944). The parent adds the picked
 * phrase with appendNotePhrase, so the notes are added to, never replaced.
 */
export function NotePhraseChips({ onPick, disabled }: { onPick: (phrase: string) => void; disabled?: boolean }) {
    return (
        <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Add a phrase to the notes">
            {LESSON_NOTE_PHRASES.map(phrase => (
                <button
                    key={phrase}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(phrase)}
                    className="rounded-full border bg-muted/40 px-3 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                    + {phrase}
                </button>
            ))}
        </div>
    )
}

/**
 * Ready reasons next to "Free, don't take a credit" (#947,
 * lib/free-lesson-reasons.ts). A tap ticks Free and sets the reason to the
 * chip (one reason per lesson, so the history reads the same way every time);
 * the reason box can still be typed in. The chosen one is highlighted.
 */
export function FreeReasonChips({ value, onPick, disabled }: { value: string; onPick: (reason: string) => void; disabled?: boolean }) {
    return (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Reason for the free lesson">
            {FREE_LESSON_REASONS.map(reason => {
                const picked = value.trim().toLowerCase() === reason.toLowerCase()
                return (
                    <button
                        key={reason}
                        type="button"
                        disabled={disabled}
                        aria-pressed={picked}
                        onClick={() => onPick(reason)}
                        className={`rounded-full border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${picked ? "border-primary bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted"}`}
                    >
                        {reason}
                    </button>
                )
            })}
        </div>
    )
}

/** "Nov 11" for the "last lesson's homework" hint (#943). */
export function shortLessonDate(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}
