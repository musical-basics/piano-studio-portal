'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    bookOwedMakeupCore,
    decideOwedMakeupCore,
    owedMakeupSlotsCore,
    type OwedDecision,
    type OwedSlots,
} from '@/lib/core/owed-makeups'

export type { OwedDecision, OwedSlots }

// Families owed a make-up (#1092). These run with the service key, so they
// check the caller themselves: a server action can be called by anyone who
// has its id.
async function adminId(): Promise<string | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return { error: 'Only admins can do that' }
    return user.id
}

/** Free times for one row's make-up in the next two weeks. Changes nothing. */
export async function getOwedMakeupSlots(id: string, duration?: number): Promise<OwedSlots | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    return owedMakeupSlotsCore(createAdminClient(), { id, duration })
}

/** Books the make-up the usual way and takes the row off the list. */
export async function bookOwedMakeup(id: string, date: string, time: string, duration: number): Promise<OwedDecision> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    const result = await bookOwedMakeupCore(createAdminClient(), { adminId: admin, id, date, time, duration })
    revalidatePath('/admin')
    revalidatePath('/student')
    return result
}

/** Owed / Not owed / Settled (optionally: this already booked lesson was the make-up). Sends nothing. */
export async function decideOwedMakeup(id: string, decision: 'owed' | 'not_owed' | 'settled', lessonId?: string | null): Promise<OwedDecision> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    if (!['owed', 'not_owed', 'settled'].includes(decision)) return { error: 'Unknown choice. Nothing changed.' }
    const result = await decideOwedMakeupCore(createAdminClient(), { id, decision, lessonId })
    revalidatePath('/admin')
    return result
}
