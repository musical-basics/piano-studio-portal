'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// #934: "Adjust lessons" in admin. Adds or takes lessons with a typed reason; the
// database function adjust_lesson_credits does the change and labels the ledger
// row (source 'admin adjustment', note = the reason) in one transaction.
// Service key, so the caller is checked here: a server action can be called by
// anyone who has its id.

export type CreditHistoryRow = {
    changed_at: string
    delta: number
    new_credits: number
    source: string | null
    note: string | null
}

const MAX_CHANGE = 100
const REASON_MAX = 300
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireAdminId(): Promise<string | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return { error: 'Only admins can do that' }
    return user.id
}

export async function adjustLessonCredits(
    studentId: string,
    change: number,
    reason: string,
): Promise<{ ok: true; previous: number; now: number } | { error: string }> {
    const admin = await requireAdminId()
    if (typeof admin !== 'string') return admin
    if (!UUID.test(studentId)) return { error: 'Student not found.' }
    const delta = Math.trunc(Number(change))
    if (!delta) return { error: 'Choose how many lessons to add or take.' }
    if (Math.abs(delta) > MAX_CHANGE) return { error: `At most ${MAX_CHANGE} lessons at a time.` }
    const why = (reason || '').trim()
    if (!why) return { error: 'Type a reason, so the history says why.' }
    if (why.length > REASON_MAX) return { error: `Please keep the reason under ${REASON_MAX} characters.` }

    const { data, error } = await createAdminClient().rpc('adjust_lesson_credits', {
        p_student: studentId,
        p_delta: delta,
        p_reason: why,
    })
    if (error) return { error: error.message }
    const row = Array.isArray(data) ? data[0] : data
    revalidatePath('/admin')
    revalidatePath('/student')
    return { ok: true, previous: row?.previous_credits, now: row?.new_credits }
}

/** The student's latest credit changes, newest first, with their labels. */
export async function getCreditHistory(studentId: string): Promise<{ rows: CreditHistoryRow[] } | { error: string }> {
    const admin = await requireAdminId()
    if (typeof admin !== 'string') return admin
    if (!UUID.test(studentId)) return { error: 'Student not found.' }
    const { data, error } = await createAdminClient()
        .from('credit_transactions')
        .select('changed_at, delta, new_credits, source, note')
        .eq('student_id', studentId)
        .order('changed_at', { ascending: false })
        .limit(15)
    if (error) return { error: error.message }
    return { rows: (data || []) as CreditHistoryRow[] }
}
