'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { dbStore, resendDeps } from '@/lib/staged-send'
import { defaultStatementOps, sendRestNow } from '@/lib/staged-send-runner'

/**
 * The Tests card's controls for staged family bulk emails (protocol 1.20,
 * lib/staged-send.ts). Server actions can be called by anyone who has their
 * id, so each checks the caller is the admin first.
 */

export type StagedActionResult = { ok: true; text: string } | { ok: false; error: string }

/** "Send the rest now": sends what is left of a waiting or stopped send at once. */
export async function sendStagedRestNow(id: string): Promise<StagedActionResult> {
    const denied = await requireAdmin()
    if (denied) return { ok: false, error: denied }
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Unknown send' }
    const client = createAdminClient()
    const res = await sendRestNow({ store: dbStore(client), deps: resendDeps(client), statements: defaultStatementOps(client) }, id)
    revalidatePath('/admin/jobs')
    if (!res.ok) return res
    const families = (n: number) => (n === 1 ? '1 family' : `${n} families`)
    return { ok: true, text: `Sent to ${families(res.sent)}${res.failed ? `; ${families(res.failed)} did not send (emailed you the details)` : ''}.` }
}

/** Saves the written result of a staged send (the Tests record). */
export async function saveStagedResult(id: string, result: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const denied = await requireAdmin()
    if (denied) return { ok: false, error: denied }
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Unknown send' }
    const text = String(result ?? '').trim().slice(0, 4000)
    const now = new Date().toISOString()
    const { error } = await createAdminClient()
        .from('staged_sends')
        .update({ result: text || null, result_at: text ? now : null, updated_at: now })
        .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/jobs')
    return { ok: true }
}
