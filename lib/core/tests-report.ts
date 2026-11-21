import type { DbClient } from '@/lib/supabase/admin'
import { isUntrackedTeacherAccount } from '@/lib/studio-policy'
import {
    armFor,
    isRolloutStage,
    ROLLOUT_FEATURES,
    ROLLOUT_KEYS,
    type RolloutArm,
    type RolloutFeature,
    type RolloutKey,
    type RolloutStage,
} from '@/lib/rollouts'

/**
 * The Tests card on /admin/jobs (protocol 1.20): every rollout of a family
 * portal feature with its stage, since when, how many active families are in
 * each version, and how each version was used since the stage began. Only
 * active families count (role student, status active, no teacher accounts):
 * the test student and admin previews never show up in the numbers.
 */

export type ArmUsage = {
    /** Families in this version who used the feature (not counting passive actions). */
    families: number
    /** Actions that are use of the feature. */
    actions: number
    /** Every recorded action, passive ones too, most first. */
    byAction: { action: string; label: string; count: number }[]
}

export type RolloutReportRow = {
    key: RolloutKey
    label: string
    newArm: string
    oldArm: string
    stage: RolloutStage
    startedAt: string | null
    note: string | null
    result: string | null
    resultAt: string | null
    families: Record<RolloutArm, number>
    usage: Record<RolloutArm, ArmUsage>
}

export type RolloutReport = {
    rows: RolloutReportRow[]
    activeFamilies: number
    /** Set when portal_rollouts could not be read (the card then shows the safe stages). */
    error: string | null
}

type EventRow = { feature: string; student_id: string; arm: string; action: string; created_at: string }

function emptyUsage(): ArmUsage {
    return { families: 0, actions: 0, byAction: [] }
}

/** Adds up one feature's events by version. Pure. */
export function summarizeUsage(
    feature: RolloutFeature,
    events: EventRow[],
    activeIds: Set<string>,
    since: string | null,
): Record<RolloutArm, ArmUsage> {
    const passive = new Set(feature.passive ?? [])
    const labels: Record<string, string> = feature.actions
    const out: Record<RolloutArm, ArmUsage> = { new: emptyUsage(), old: emptyUsage() }
    const users: Record<RolloutArm, Set<string>> = { new: new Set(), old: new Set() }
    const counts: Record<RolloutArm, Map<string, number>> = { new: new Map(), old: new Map() }
    const sinceMs = since ? Date.parse(since) : 0
    for (const e of events) {
        if (e.feature !== feature.key || !activeIds.has(e.student_id)) continue
        if (Date.parse(e.created_at) < sinceMs) continue
        const arm: RolloutArm = e.arm === 'old' ? 'old' : 'new'
        counts[arm].set(e.action, (counts[arm].get(e.action) ?? 0) + 1)
        if (passive.has(e.action)) continue
        out[arm].actions++
        users[arm].add(e.student_id)
    }
    for (const arm of ['new', 'old'] as RolloutArm[]) {
        out[arm].families = users[arm].size
        out[arm].byAction = [...counts[arm].entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([action, count]) => ({ action, label: labels[action] ?? action, count }))
    }
    return out
}

export async function loadRolloutReport(client: DbClient): Promise<RolloutReport> {
    let error: string | null = null
    const { data: rolloutRows, error: rolloutError } = await client
        .from('portal_rollouts')
        .select('feature, stage, started_at, note, result, result_at')
    if (rolloutError) error = rolloutError.message
    const byKey = new Map<string, any>()
    for (const r of rolloutRows || []) byKey.set(r.feature, r)

    const { data: students, error: studentsError } = await client
        .from('profiles')
        .select('id, credits')
        .eq('role', 'student')
        .eq('status', 'active')
    if (studentsError) throw new Error(`profiles query failed: ${studentsError.message}`)
    const active = (students || []).filter((s: any) => !isUntrackedTeacherAccount(s)).map((s: any) => s.id as string)
    const activeIds = new Set(active)

    const starts = ROLLOUT_KEYS.map(k => byKey.get(k)?.started_at).filter(Boolean) as string[]
    const earliest = starts.length ? starts.sort()[0] : new Date(0).toISOString()
    let events: EventRow[] = []
    if (!error) {
        const { data, error: eventsError } = await client
            .from('portal_rollout_events')
            .select('feature, student_id, arm, action, created_at')
            .gte('created_at', earliest)
            .order('created_at', { ascending: false })
            .limit(20000)
        if (eventsError) error = eventsError.message
        events = (data || []) as EventRow[]
    }

    const rows: RolloutReportRow[] = ROLLOUT_KEYS.map(key => {
        const f: RolloutFeature = ROLLOUT_FEATURES[key]
        const row = byKey.get(key)
        const stage: RolloutStage = isRolloutStage(row?.stage) ? row.stage : f.fallback
        const families: Record<RolloutArm, number> = { new: 0, old: 0 }
        for (const id of active) families[armFor(stage, key, id)]++
        return {
            key,
            label: f.label,
            newArm: f.newArm,
            oldArm: f.oldArm,
            stage,
            startedAt: row?.started_at ?? null,
            note: row?.note ?? null,
            result: row?.result ?? null,
            resultAt: row?.result_at ?? null,
            families,
            usage: summarizeUsage(f, events, activeIds, row?.started_at ?? null),
        }
    })
    return { rows, activeFamilies: active.length, error }
}
