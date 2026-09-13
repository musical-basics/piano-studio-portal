/**
 * The reaction vocabulary, shared by the client bubbles and the server core.
 *
 * Kept in its own module (and free of any server import) so a client component
 * can pull in the emoji list without dragging `lib/core/messages` — and the
 * Resend client it constructs — into the browser bundle.
 *
 * The database does not constrain which emoji may be stored; this list is the
 * only gate, enforced in `toggleReactionCore`. Adding one here is all it takes.
 */

export const REACTION_EMOJIS = ["👍", "❤️", "🎉"] as const

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

/** Accessible names for the picker buttons; the emoji alone reads as nothing. */
export const REACTION_LABELS: Record<string, string> = {
    "👍": "Thumbs up",
    "❤️": "Heart",
    "🎉": "Party",
}

export function isReactionEmoji(value: string): value is ReactionEmoji {
    return (REACTION_EMOJIS as readonly string[]).includes(value)
}

/** One emoji's standing on a message, from the current viewer's perspective. */
export type ReactionSummary = {
    emoji: string
    count: number
    /** Whether the viewer is one of the reactors, so a tap removes rather than adds. */
    mine: boolean
}

/** Reactions for a set of messages, keyed by message id. Absent = none. */
export type ReactionMap = Record<string, ReactionSummary[]>

/**
 * Apply a toggle to a message's summaries locally.
 *
 * Used for the optimistic update in the chat hook, and by the server core to
 * keep the two in step: tapping an emoji you already hold removes it, otherwise
 * it is added and the chip appears in the fixed `REACTION_EMOJIS` order.
 */
export function applyToggle(current: ReactionSummary[], emoji: string): ReactionSummary[] {
    const existing = current.find((r) => r.emoji === emoji)

    const next = existing
        ? current
            .map((r) =>
                r.emoji === emoji
                    ? { ...r, count: r.mine ? r.count - 1 : r.count + 1, mine: !r.mine }
                    : r,
            )
            .filter((r) => r.count > 0)
        : [...current, { emoji, count: 1, mine: true }]

    const order = REACTION_EMOJIS as readonly string[]
    return next.sort((a, b) => order.indexOf(a.emoji) - order.indexOf(b.emoji))
}
