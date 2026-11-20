'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { listRecentCancelUndosCore, undoCancelCore, type RecentUndo, type UndoCancelResult } from '@/lib/core/undo-cancel'

export type { RecentUndo, UndoCancelResult }

// These run with the service key, so they check the caller themselves: a server
// action can be called by anyone who has its id.
async function adminId(): Promise<string | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return { error: 'Only admins can do that' }
    return user.id
}

/** What can still be undone (the last 10 minutes), for the bar at the top of admin. Changes nothing. */
export async function getRecentUndos(): Promise<{ items: RecentUndo[] } | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    try {
        const items = await listRecentCancelUndosCore()
        return { items: items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) }
    } catch (e: any) {
        return { error: e?.message ?? 'Could not load what can be undone' }
    }
}

/** Books a lesson Lionel cancelled in the last 10 minutes back (#1086). */
export async function undoCancel(cancellationId: string): Promise<UndoCancelResult> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    const result = await undoCancelCore({ adminId: admin, cancellationId })
    revalidatePath('/admin')
    revalidatePath('/student')
    return result
}
