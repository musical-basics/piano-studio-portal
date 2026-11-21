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
    TEST_STUDENT_ID,
} from '@/lib/rollouts'
import { batchCounts, dbStore, KIND_LABEL, type BatchCounts, type StagedStatus } from '@/lib/staged-send'

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

// ------------------------------------------------------- auto-refill ---

/** The auto-refill test's money record (#1477): who is on it and every refill, no names. */
export type AutoRefillReport = {
    familiesOn: number
    familiesOff: number
    /** Refill charges of real families (not the first purchase, not the test student). */
    counts: { paid: number; declined: number; waiting: number; retriedPaid: number }
    /** The first real refill charge, the one protocol 1.20 asks to watch. */
    firstReal: { at: string; status: string; attempts: number } | null
    /** Newest first. */
    recent: { id: string; at: string; kind: 'start' | 'refill'; status: string; amountCents: number; attempts: number; test: boolean }[]
    error: string | null
}

export async function loadAutoRefillReport(client: DbClient, limit = 8): Promise<AutoRefillReport> {
    const empty: AutoRefillReport = { familiesOn: 0, familiesOff: 0, counts: { paid: 0, declined: 0, waiting: 0, retriedPaid: 0 }, firstReal: null, recent: [], error: null }
    try {
        const { data: plans, error: plansError } = await client.from('auto_refill_plans').select('student_id, status')
        if (plansError) throw new Error(plansError.message)
        const { data: rows, error: rowsError } = await client
            .from('auto_refills')
            .select('id, student_id, kind, status, amount_cents, attempts, created_at, paid_at')
            .order('created_at', { ascending: true })
            .limit(5000)
        if (rowsError) throw new Error(rowsError.message)
        const real = (plans ?? []).filter((p: any) => p.student_id !== TEST_STUDENT_ID)
        const refills = (rows ?? []) as any[]
        const realRefills = refills.filter(r => r.kind === 'refill' && r.student_id !== TEST_STUDENT_ID)
        const first = realRefills[0]
        return {
            familiesOn: real.filter((p: any) => p.status === 'on').length,
            familiesOff: real.filter((p: any) => p.status === 'off').length,
            counts: {
                paid: realRefills.filter(r => r.status === 'paid').length,
                declined: realRefills.filter(r => r.status === 'failed').length,
                waiting: realRefills.filter(r => r.status === 'due' || r.status === 'charging').length,
                retriedPaid: realRefills.filter(r => r.status === 'paid' && r.attempts > 1).length,
            },
            firstReal: first ? { at: first.paid_at ?? first.created_at, status: first.status, attempts: first.attempts } : null,
            recent: refills.slice(-limit).reverse().map(r => ({
                id: r.id, at: r.paid_at ?? r.created_at, kind: r.kind, status: r.status, amountCents: r.amount_cents, attempts: r.attempts,
                test: r.student_id === TEST_STUDENT_ID,
            })),
            error: null,
        }
    } catch (e) {
        return { ...empty, error: e instanceof Error ? e.message : String(e) }
    }
}

// ------------------------------------------------- staged bulk emails ---

/** One staged family bulk email on the Tests card (lib/staged-send.ts). Counts only, no addresses. */
export type StagedSendRow = {
    id: string
    kind: string
    label: string
    createdAt: string
    status: StagedStatus
    previewSentAt: string | null
    firstSentAt: string | null
    restDueAt: string | null
    restSentAt: string | null
    restSentBy: 'schedule' | 'hand' | null
    first: BatchCounts
    rest: BatchCounts
    stopReason: string | null
    result: string | null
    resultAt: string | null
    /** "Send the rest now" applies: waiting or stopped, with emails not sent yet. */
    canSendRest: boolean
}

export async function loadStagedReport(client: DbClient, limit = 8): Promise<{ rows: StagedSendRow[]; error: string | null }> {
    try {
        const recs = await dbStore(client).recent(limit)
        return {
            error: null,
            rows: recs.map(r => ({
                id: r.id,
                kind: KIND_LABEL[r.kind] ?? r.kind,
                label: r.label,
                createdAt: r.created_at,
                status: r.status,
                previewSentAt: r.preview_sent_at,
                firstSentAt: r.first_sent_at,
                restDueAt: r.rest_due_at,
                restSentAt: r.rest_sent_at,
                restSentBy: r.rest_sent_by,
                first: batchCounts(r.items, 'first'),
                rest: batchCounts(r.items, 'rest'),
                stopReason: r.stop_reason,
                result: r.result,
                resultAt: r.result_at,
                canSendRest: (r.status === 'waiting' || r.status === 'stopped') &&
                    r.items.some(it => it.status === 'pending' || it.status === 'failed'),
            })),
        }
    } catch (e) {
        return { rows: [], error: e instanceof Error ? e.message : String(e) }
    }
}
