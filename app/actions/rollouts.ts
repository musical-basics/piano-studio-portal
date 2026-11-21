'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { rolloutArm } from '@/lib/rollouts-server'
import { clearRolloutCache, isRolloutAction, isRolloutKey, isRolloutStage } from '@/lib/rollouts'

/**
 * Protocol 1.20 rollouts (lib/rollouts.ts): the family portal's usage record
 * and the Tests card's controls on /admin/jobs.
 *
 * recordRolloutEvent is called from the family portal, deferred and without
 * waiting (lib/rollout-track.ts), so it never holds up the page. It only
 * records the signed-in student's own actions: an admin (or an admin's
 * preview of a family) is not a family, so nothing is written for them. The
 * arm is worked out here, on the server, from the stage at that moment.
 */
export async function recordRolloutEvent(feature: string, action: string): Promise<void> {
    try {
        if (!isRolloutKey(feature) || !isRolloutAction(feature, action)) return
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (me?.role !== 'student') return
        const arm = await rolloutArm(feature, user.id)
        const { error } = await createAdminClient()
            .from('portal_rollout_events')
            .insert({ feature, student_id: user.id, arm, action })
        if (error) console.error('[rollouts] event write failed:', error.message)
    } catch (e) {
        console.error('[rollouts] event write threw:', e instanceof Error ? e.message : e)
    }
}

export type RolloutActionResult = { ok: true } | { ok: false; error: string }

/** Moves a feature to another stage; the test period starts again from now. */
export async function setRolloutStage(feature: string, stage: string): Promise<RolloutActionResult> {
    const denied = await requireAdmin()
    if (denied) return { ok: false, error: denied }
    if (!isRolloutKey(feature) || !isRolloutStage(stage)) return { ok: false, error: 'Unknown feature or stage' }
    const now = new Date().toISOString()
    const { error } = await createAdminClient()
        .from('portal_rollouts')
        .upsert({ feature, stage, started_at: now, updated_at: now }, { onConflict: 'feature' })
    if (error) return { ok: false, error: error.message }
    clearRolloutCache()
    revalidatePath('/admin/jobs')
    return { ok: true }
}

/** Saves the written result of a rollout test (the record protocol 1.20 asks for). */
export async function saveRolloutResult(feature: string, result: string): Promise<RolloutActionResult> {
    const denied = await requireAdmin()
    if (denied) return { ok: false, error: denied }
    if (!isRolloutKey(feature)) return { ok: false, error: 'Unknown feature' }
    const text = String(result ?? '').trim().slice(0, 4000)
    const now = new Date().toISOString()
    const { error } = await createAdminClient()
        .from('portal_rollouts')
        .update({ result: text || null, result_at: text ? now : null, updated_at: now })
        .eq('feature', feature)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/jobs')
    return { ok: true }
}
