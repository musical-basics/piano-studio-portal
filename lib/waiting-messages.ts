import type { DbClient } from '@/lib/supabase/admin'

/**
 * Family messages still waiting for Lionel's reply (#990): threads from the last
 * WAITING_DAYS days where the family (a student or prospect) wrote last. The
 * admin home shows them as a pill next to the red unlogged one; each opens that
 * family's chat. Same rule as scripts/watch_family_messages.cjs --unanswered.
 */

export const WAITING_DAYS = 14

export type WaitingThread = {
    studentId: string
    name: string
    /** When their last message came in. */
    at: string
    /** One line of it, for the list. */
    preview: string
}

export async function findWaitingMessages(client: DbClient, adminId: string, now: Date = new Date()): Promise<WaitingThread[]> {
    const since = new Date(now.getTime() - WAITING_DAYS * 864e5).toISOString()
    const { data: msgs, error } = await client
        .from('messages')
        .select('sender_id, recipient_id, content, attachments, created_at, deleted_at')
        .or(`sender_id.eq.${adminId},recipient_id.eq.${adminId}`)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(2000)
    if (error) throw new Error(`messages query failed: ${error.message}`)

    const last = new Map<string, { sender_id: string; content: string | null; attachments: unknown; created_at: string }>()
    for (const m of msgs || []) {
        if (m.deleted_at) continue
        const other = m.sender_id === adminId ? m.recipient_id : m.sender_id
        if (other) last.set(other as string, m as any)
    }
    const waitingIds = [...last.entries()].filter(([, m]) => m.sender_id !== adminId).map(([id]) => id)
    if (waitingIds.length === 0) return []

    const { data: people, error: peopleError } = await client
        .from('profiles')
        .select('id, name, preferred_name, role')
        .in('id', waitingIds)
        .in('role', ['student', 'prospect'])
    if (peopleError) throw new Error(`profiles query failed: ${peopleError.message}`)

    return (people || [])
        .map(p => {
            const m = last.get(p.id as string)!
            const text = (m.content || '').replace(/\s+/g, ' ').trim()
            const files = Array.isArray(m.attachments) ? m.attachments.length : 0
            return {
                studentId: p.id as string,
                name: (p.preferred_name as string) || (p.name as string) || 'A family',
                at: m.created_at,
                preview: text ? (text.length > 90 ? `${text.slice(0, 87)}...` : text) : files ? `(${files} attachment${files === 1 ? '' : 's'})` : '',
            }
        })
        .sort((a, b) => a.at.localeCompare(b.at))
}
