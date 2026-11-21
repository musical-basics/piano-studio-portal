import { createAdminClient } from '@/lib/supabase/admin'
import {
    armFor,
    fallbackStages,
    flagsFor,
    loadRolloutStages,
    type RolloutArm,
    type RolloutFlags,
    type RolloutKey,
    type RolloutStages,
} from '@/lib/rollouts'

/**
 * Server side of the portal rollouts (lib/rollouts.ts, protocol 1.20).
 * Reads the stages with the service key (portal_rollouts is service-role only),
 * cached 30 seconds; a failed read falls back to each feature's safe stage.
 * Server code only: it uses the service key.
 */

async function stages(): Promise<RolloutStages> {
    try {
        return await loadRolloutStages(createAdminClient())
    } catch {
        // No service key in this environment: the safe stages.
        return fallbackStages()
    }
}

export async function rolloutArm(feature: RolloutKey, studentId: string, opts: { preview?: boolean } = {}): Promise<RolloutArm> {
    return armFor((await stages())[feature], feature, studentId, opts)
}

/** True when this student sees the new version of `feature`. An admin preview always does. */
export async function inRollout(feature: RolloutKey, studentId: string, opts: { preview?: boolean } = {}): Promise<boolean> {
    return (await rolloutArm(feature, studentId, opts)) === 'new'
}

/** Every feature's flag for one student, for the family portal page. */
export async function rolloutFlags(studentId: string, opts: { preview?: boolean } = {}): Promise<RolloutFlags> {
    return flagsFor(await stages(), studentId, opts)
}
