import type { DbClient } from '@/lib/supabase/admin'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'

/**
 * How long family messages waited for Lionel's answer (#1054), for the Monday
 * email. A wait starts at a family's first message that has no answer yet and
 * ends at Lionel's next message in that thread (portal chat, which also holds
 * email and text replies). Several messages in a row from the family are one
 * wait, from the first. A wait that started in the week counts for that week,
 * even when the answer came after it ended. A plain thank-you he never answers
 * stays open, so it shows under "still waiting" rather than skewing the times.
 */

export type MessageRow = {
    sender_id: string
    recipient_id: string | null
    created_at: string
    deleted_at?: string | null
}

export type ReplyWait = {
    familyId: string
    /** The family's first unanswered message. */
    from: string
    /** Lionel's next message in the thread, or null while still waiting. */
    to: string | null
}

/** Every wait in these messages (any order), oldest first. */
export function replyWaits(messages: MessageRow[], adminId: string, isFamily: (id: string) => boolean): ReplyWait[] {
    const sorted = [...messages].filter(m => !m.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const open = new Map<string, string>()
    const waits: ReplyWait[] = []
    for (const m of sorted) {
        if (m.recipient_id === adminId && isFamily(m.sender_id)) {
            if (!open.has(m.sender_id)) open.set(m.sender_id, m.created_at)
        } else if (m.sender_id === adminId && m.recipient_id && open.has(m.recipient_id)) {
            waits.push({ familyId: m.recipient_id, from: open.get(m.recipient_id)!, to: m.created_at })
            open.delete(m.recipient_id)
        }
    }
    for (const [familyId, from] of open) waits.push({ familyId, from, to: null })
    return waits.sort((a, b) => a.from.localeCompare(b.from))
}

export type ReplyTimes = {
    /** Waits that started in the week and were answered. */
    answered: number
    /** Median wait of those, in minutes; null when none. */
    typicalMinutes: number | null
    longest: { minutes: number; name: string; at: string } | null
    /** Waits that started in the week and still have no answer now. */
    stillWaiting: { name: string; at: string }[]
}

const minutesBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000

/** Summarise the waits that started in [startIso, endIso). */
export function summarizeReplyTimes(waits: ReplyWait[], startIso: string, endIso: string, nameOf: (id: string) => string): ReplyTimes {
    const inWeek = waits.filter(w => Date.parse(w.from) >= Date.parse(startIso) && Date.parse(w.from) < Date.parse(endIso))
    const done = inWeek.filter(w => w.to).map(w => ({ w, minutes: minutesBetween(w.from, w.to!) }))
    const sorted = done.map(d => d.minutes).sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const typical = sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    const top = done.reduce<(typeof done)[number] | null>((best, d) => (!best || d.minutes > best.minutes ? d : best), null)
    return {
        answered: done.length,
        typicalMinutes: typical,
        longest: top ? { minutes: top.minutes, name: nameOf(top.w.familyId), at: top.w.from } : null,
        stillWaiting: inWeek.filter(w => !w.to).map(w => ({ name: nameOf(w.familyId), at: w.from })),
    }
}

/** "12 min", "3.5 h", "2 days". */
export function formatWait(minutes: number): string {
    if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`
    const half = (n: number) => Math.round(n * 2) / 2
    if (minutes < 48 * 60) return `${half(minutes / 60)} h`
    const days = half(minutes / 1440)
    return `${days} day${days === 1 ? '' : 's'}`
}

/**
 * Reads the week's family threads and summarises them. Families are students
 * and prospects, without the teacher and test accounts.
 */
export async function loadReplyTimes(client: DbClient, startIso: string, endIso: string): Promise<ReplyTimes> {
    const { data: people, error: peopleError } = await client
        .from('profiles')
        .select('id, name, role, status, credits')
        .in('role', ['student', 'prospect', 'admin'])
    if (peopleError) throw new Error(`profiles query failed: ${peopleError.message}`)
    const admin = (people || []).find(p => p.role === 'admin')
    if (!admin) throw new Error('no admin profile')
    const families = new Map(
        (people || [])
            .filter(p => p.role !== 'admin' && p.status !== 'other' && !isUntrackedTeacherAccount(p))
            .map(p => [p.id as string, (p.name as string | null)?.trim() || 'A family']),
    )
    const { data: msgs, error } = await client
        .from('messages')
        .select('sender_id, recipient_id, created_at, deleted_at')
        .or(`sender_id.eq.${admin.id},recipient_id.eq.${admin.id}`)
        .gte('created_at', startIso)
        .order('created_at', { ascending: true })
        .limit(5000)
    if (error) throw new Error(`messages query failed: ${error.message}`)
    const waits = replyWaits((msgs || []) as MessageRow[], admin.id as string, id => families.has(id))
    return summarizeReplyTimes(waits, startIso, endIso, id => families.get(id) || 'A family')
}
