import type { DbClient } from '@/lib/supabase/admin'
import {
    batchCounts,
    firstBatchVerdict,
    KIND_LABEL,
    planBatches,
    refreshEvents,
    restDueAt,
    sendEmailItems,
    sendPreview,
    STUCK_AFTER_MINUTES,
    withoutSentBodies,
    type StagedDeps,
    type StagedEmail,
    type StagedItem,
    type StagedKind,
    type StagedSend,
    type StagedStore,
} from '@/lib/staged-send'
import type { FamilyResult } from '@/lib/monthly-statements'

/**
 * The kinds of staged family bulk email (protocol 1.20, lib/staged-send.ts):
 * starting one (preview, first batch), the 15-minute check that sends the
 * rest or stops (app/api/cron/staged-sends), and "Send the rest now".
 *
 *   announcement      the same email to each family (app/actions/announcements.ts)
 *   recital           Lionel's reviewed email per family (app/actions/recital-send.ts);
 *                     sent ones are marked in the recital send log, the rest
 *                     show there as queued
 *   monthly_statement the statement is rebuilt when it is sent (lessons and
 *                     balance as of that moment); monthly_statements_sent still
 *                     makes sure no family gets two (lib/monthly-statements.ts)
 */

/** What the monthly statements need from lib/monthly-statements.ts (stand-ins in the self-check). */
export type StatementOps = {
    /** A dry run for the month: who would get one, with the email (subject, text, html). */
    plan(month: string): Promise<FamilyResult[]>
    /** A real run for these families (null = every family still without theirs). */
    send(month: string, ids: string[] | null): Promise<FamilyResult[]>
}

/** Marks recital emails as sent (or queued) in that recital's send log. */
export type RecitalLogOps = {
    mark(eventId: string, sent: StagedItem[], queued: { items: StagedItem[]; stagedId: string; dueAt: string | null }): Promise<void>
}

export type RunnerEnv = {
    store: StagedStore
    deps: StagedDeps
    statements?: StatementOps
    recitalLog?: RecitalLogOps
}

export function defaultStatementOps(client: DbClient): StatementOps {
    return {
        async plan(month) {
            const { runMonthlyStatements } = await import('@/lib/monthly-statements')
            const run = await runMonthlyStatements(client, { month, dryRun: true, withHtml: true })
            return run.families
        },
        async send(month, ids) {
            const { runMonthlyStatements, alertStatementFailures } = await import('@/lib/monthly-statements')
            const run = await runMonthlyStatements(client, { month, dryRun: false, ids })
            await alertStatementFailures(client, run)
            return run.families
        },
    }
}

export const defaultRecitalLogOps: RecitalLogOps = {
    async mark(eventId, sent, queued) {
        const { readRecitalLog, writeRecitalLog } = await import('@/lib/recital-send-log')
        const log = await readRecitalLog(eventId)
        log.queued = { ...(log.queued || {}) }
        for (const it of sent) {
            if (it.status !== 'sent') continue
            log.sent[it.key] = { at: it.sentAt || new Date().toISOString(), to: it.to, subject: it.email?.subject || '', resendIds: it.resendId ? [it.resendId] : [] }
            delete log.queued[it.key]
        }
        for (const it of queued.items) {
            if (log.sent[it.key]) continue
            log.queued[it.key] = { at: new Date().toISOString(), stagedId: queued.stagedId, dueAt: queued.dueAt }
        }
        await writeRecitalLog(eventId, log)
    },
}

export type StartOutcome = {
    record: StagedSend | null
    /** This send was already staged (the same announcement or month): nothing new went out. */
    conflict: boolean
    total: number
    firstSent: number
    firstFailed: number
    restCount: number
    restDueAt: string | null
    previewSent: boolean
    /** Why it stopped right away (the preview or a first email did not send). */
    stopped: string | null
}

function familyCount(n: number): string {
    return n === 1 ? '1 family' : `${n} families`
}

async function stop(env: RunnerEnv, rec: StagedSend, reason: string, items?: StagedItem[]): Promise<StagedSend> {
    const updated = await env.store.update(rec.id, { status: 'stopped', stop_reason: reason, ...(items ? { items } : {}) })
    const counts = batchCounts(items || rec.items, 'rest')
    await env.deps.alert(`Stopped: ${rec.label} (${KIND_LABEL[rec.kind].toLowerCase()})`, [
        reason,
        counts.size ? `${familyCount(counts.size)} still to get it. Nothing more goes out until you press "Send the rest now" on the Tests card.` : 'Nothing else was waiting.',
    ])
    return updated || rec
}

async function finishStart(env: RunnerEnv, rec: StagedSend, items: StagedItem[], deadline: Date | null | undefined): Promise<StartOutcome> {
    const now = env.deps.now()
    const first = batchCounts(items, 'first')
    const restCount = items.filter(it => it.batch === 'rest').length
    const due = restCount ? restDueAt(now, deadline) : null
    const outcome: StartOutcome = {
        record: rec, conflict: false, total: items.length, firstSent: first.sent, firstFailed: first.failed,
        restCount, restDueAt: due?.toISOString() ?? null, previewSent: true, stopped: null,
    }
    const verdict = firstBatchVerdict(items)
    if (verdict.kind === 'bad') {
        outcome.stopped = `The first batch did not all send (${verdict.reason}).`
        outcome.record = await stop(env, rec, outcome.stopped, withoutSentBodies(items))
        return outcome
    }
    outcome.record = await env.store.update(rec.id, {
        items: withoutSentBodies(items),
        status: restCount ? 'waiting' : 'done',
        first_sent_at: now.toISOString(),
        rest_due_at: outcome.restDueAt,
    }) || rec
    return outcome
}

/**
 * Starts a staged send of reviewed emails (announcements, recital emails):
 * the preview copy, then the first batch. The rest waits for the check.
 */
export async function startEmailStagedSend(
    env: RunnerEnv,
    { kind, ref, label, recipients, deadline, context }: {
        kind: Extract<StagedKind, 'announcement' | 'recital'>
        ref: string
        label: string
        recipients: { key: string; to: string[]; email: StagedEmail }[]
        /** The rest must go by then (a recital's start, less a margin). */
        deadline?: Date | null
        context?: Record<string, unknown>
    },
): Promise<StartOutcome> {
    const planned: StagedItem[] = planBatches(recipients).map(r => ({ key: r.key, to: r.to, batch: r.batch, status: 'pending', email: r.email }))
    const created = await env.store.create({ kind, ref, label, items: planned, context })
    if ('conflict' in created) {
        return {
            record: created.conflict, conflict: true, total: planned.length, firstSent: 0, firstFailed: 0,
            restCount: 0, restDueAt: null, previewSent: false, stopped: null,
        }
    }
    const rec = created.record
    const firstItems = planned.filter(it => it.batch === 'first')
    const restCount = planned.length - firstItems.length
    const due = restCount ? restDueAt(env.deps.now(), deadline) : null

    const preview = await sendPreview(env.deps, {
        email: firstItems[0].email as StagedEmail,
        total: planned.length,
        firstCount: firstItems.length,
        due,
        idempotencyKey: `staged/${rec.id}/preview`,
    })
    if (preview.error !== undefined) {
        const reason = `The preview copy to the studio inbox did not send (${preview.error}), so nothing went to families.`
        const stopped = await stop(env, rec, reason)
        return { record: stopped, conflict: false, total: planned.length, firstSent: 0, firstFailed: 0, restCount: planned.length, restDueAt: null, previewSent: false, stopped: reason }
    }
    await env.store.update(rec.id, { preview_sent_at: env.deps.now().toISOString() })

    const items = await sendEmailItems(env.deps, rec, planned, it => it.batch === 'first', async next => {
        await env.store.update(rec.id, { items: next })
    })
    if (kind === 'recital' && typeof context?.eventId === 'string') {
        await (env.recitalLog ?? defaultRecitalLogOps).mark(context.eventId, items.filter(it => it.batch === 'first'), {
            items: items.filter(it => it.status === 'pending'), stagedId: rec.id, dueAt: due?.toISOString() ?? null,
        })
    }
    return finishStart(env, rec, items, deadline)
}

export type StatementsStart =
    | { mode: 'held'; record: StagedSend }
    | { mode: 'direct'; families: FamilyResult[]; why: string }
    | ({ mode: 'staged'; families: FamilyResult[] } & StartOutcome)

/**
 * The 1st-of-the-month run of the monthly statements, staged: a dry run says
 * who gets one; with 2 or more families the first one's statement goes to the
 * studio inbox as the preview, then the first batch is sent for real. A
 * second trigger the same month finds the staged send and sends nothing.
 * After the rest has gone (status done), a run sends to any family still
 * without theirs, as before (a family that became active, or a failure).
 */
export async function startStagedStatements(env: RunnerEnv, month: string): Promise<StatementsStart> {
    const ops = env.statements
    if (!ops) throw new Error('statement ops missing')
    const existing = await env.store.find('monthly_statement', month)
    if (existing && existing.status !== 'done') return { mode: 'held', record: existing }
    if (existing) return { mode: 'direct', families: await ops.send(month, null), why: 'the staged send is done; this catches up anyone still without theirs' }

    const plan = await ops.plan(month)
    const going = plan.filter(f => f.status === 'would_send' && f.to)
    if (going.length < 2) {
        return { mode: 'direct', families: await ops.send(month, null), why: going.length ? 'one family, not a bulk send' : 'nobody to send to' }
    }
    const planned: StagedItem[] = planBatches(going.map(f => ({ key: `student:${f.studentId}`, to: [f.to as string] })))
        .map(r => ({ key: r.key, to: r.to, batch: r.batch, status: 'pending' }))
    const created = await env.store.create({ kind: 'monthly_statement', ref: month, label: `${monthLabel(month)} statements`, items: planned })
    if ('conflict' in created) {
        return created.conflict ? { mode: 'held', record: created.conflict } : { mode: 'direct', families: [], why: 'staged by another run' }
    }
    const rec = created.record
    const firstIds = planned.filter(it => it.batch === 'first').map(it => it.key.slice('student:'.length))
    const restCount = planned.length - firstIds.length
    const due = restDueAt(env.deps.now())
    const sample = going.find(f => f.studentId === firstIds[0]) as FamilyResult
    const preview = await sendPreview(env.deps, {
        email: { subject: sample.subject || `${monthLabel(month)} lesson summary`, html: sample.html || `<pre>${sample.text || ''}</pre>`, text: sample.text },
        total: planned.length,
        firstCount: firstIds.length,
        due,
        idempotencyKey: `staged/${rec.id}/preview`,
    })
    if (preview.error !== undefined) {
        const reason = `The preview copy to the studio inbox did not send (${preview.error}), so no statement went to families.`
        const stopped = await stop(env, rec, reason)
        return { mode: 'staged', families: [], record: stopped, conflict: false, total: planned.length, firstSent: 0, firstFailed: 0, restCount: planned.length, restDueAt: null, previewSent: false, stopped: reason }
    }
    await env.store.update(rec.id, { preview_sent_at: env.deps.now().toISOString() })

    const families = await ops.send(month, firstIds)
    const items = mergeStatementResults(planned, families, 'first')
    const outcome = await finishStart(env, rec, items, null)
    return { mode: 'staged', families, ...outcome, restCount }
}

function monthLabel(month: string): string {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return names[Number(month.slice(5, 7)) - 1] ?? month
}

/** Folds a statements run into the items: sent and failed families update theirs; a new family joins the batch given. */
export function mergeStatementResults(items: StagedItem[], families: FamilyResult[], newBatch: 'first' | 'rest'): StagedItem[] {
    const out = items.map(it => ({ ...it }))
    for (const f of families) {
        if (f.status !== 'sent' && f.status !== 'failed') continue
        const key = `student:${f.studentId}`
        let it = out.find(x => x.key === key)
        if (!it) {
            it = { key, to: f.to ? [f.to] : [], batch: newBatch, status: 'pending' }
            out.push(it)
        }
        if (f.status === 'sent') {
            it.status = 'sent'
            it.resendId = f.resendId ?? null
            it.sentAt = new Date().toISOString()
            it.error = null
        } else {
            it.status = 'failed'
            it.error = f.reason || 'failed'
        }
    }
    return out
}

/** Sends everything not sent yet (pending, and failed ones again) for a claimed send, then marks it done. */
async function sendTheRest(env: RunnerEnv, rec: StagedSend, by: 'schedule' | 'hand'): Promise<StagedSend> {
    let items = rec.items.map(it => (it.status === 'failed' ? { ...it, status: 'pending' as const, error: null } : it))
    const pendingKeys = new Set(items.filter(it => it.status === 'pending').map(it => it.key))
    if (rec.kind === 'monthly_statement') {
        if (!env.statements) throw new Error('statement ops missing')
        const families = await env.statements.send(rec.ref, null)
        items = mergeStatementResults(items, families, 'rest')
        // A family that no longer gets one (no longer active, or already had theirs): not pending any more.
        items = items.map(it => (it.status === 'pending' ? { ...it, status: 'skipped' as const, error: 'not sent: no longer due a statement' } : it))
    } else {
        items = await sendEmailItems(env.deps, rec, items, () => true, async next => {
            await env.store.update(rec.id, { items: next })
        })
        if (rec.kind === 'recital' && typeof rec.context?.eventId === 'string') {
            await (env.recitalLog ?? defaultRecitalLogOps).mark(rec.context.eventId, items.filter(it => pendingKeys.has(it.key)), { items: [], stagedId: rec.id, dueAt: null })
        }
    }
    const done = await env.store.update(rec.id, {
        items: withoutSentBodies(items),
        status: 'done',
        rest_sent_at: env.deps.now().toISOString(),
        rest_sent_by: by,
        stop_reason: rec.status === 'stopped' && by === 'hand' ? `${rec.stop_reason || 'Stopped'} (sent anyway by hand)` : rec.stop_reason,
    }) || rec
    const failed = items.filter(it => pendingKeys.has(it.key) && it.status === 'failed')
    if (failed.length) {
        await env.deps.alert(`${rec.label}: ${familyCount(failed.length)} did not get it`, failed.map(it => `${it.key}: ${it.error || 'failed'}`))
    }
    return done
}

export type SendRestResult = { ok: true; record: StagedSend; sent: number; failed: number } | { ok: false; error: string }

/** "Send the rest now" (Tests card): sends what is left at once, after a wait or a stop. */
export async function sendRestNow(env: RunnerEnv, id: string): Promise<SendRestResult> {
    const before = await env.store.get(id)
    if (!before) return { ok: false, error: 'No such send' }
    const claimed = await env.store.update(id, { status: 'sending_rest' }, ['waiting', 'stopped'])
    if (!claimed) return { ok: false, error: before.status === 'done' ? 'Everything was already sent.' : 'It is being sent right now.' }
    const pendingBefore = claimed.items.filter(it => it.status === 'pending' || it.status === 'failed').map(it => it.key)
    const done = await sendTheRest(env, { ...claimed, status: before.status }, 'hand')
    const mine = done.items.filter(it => pendingBefore.includes(it.key) || (it.batch === 'rest' && it.status !== 'skipped' && !before.items.some(b => b.key === it.key)))
    return { ok: true, record: done, sent: mine.filter(it => it.status === 'sent').length, failed: mine.filter(it => it.status === 'failed').length }
}

export type CheckReport = {
    looked: number
    restSent: string[]
    stopped: string[]
    checked: string[]
    unstuck: string[]
}

/**
 * The check (every 15 minutes): for each waiting send, reads Resend's
 * delivery reports for the first batch. A bounce, complaint or failure stops
 * it at once; when the rest is due, all delivered sends the rest, anything
 * else stops it. A send cut off partway is handed back as stopped. An hour
 * after the last emails went, their delivery is read once more for the record.
 */
export async function checkStagedSends(env: RunnerEnv): Promise<CheckReport> {
    const now = env.deps.now()
    const report: CheckReport = { looked: 0, restSent: [], stopped: [], checked: [], unstuck: [] }
    const minutesSince = (iso: string | null) => (iso ? (now.getTime() - Date.parse(iso)) / 60_000 : Infinity)
    for (const rec of await env.store.active()) {
        report.looked++
        if (rec.status === 'sending_rest' || rec.status === 'first_batch') {
            if (minutesSince(rec.updated_at) >= STUCK_AFTER_MINUTES) {
                await stop(env, rec, 'The send was cut off partway (the server stopped). Emails marked sent went out; press "Send the rest now" to finish.')
                report.unstuck.push(rec.id)
            }
            continue
        }
        if (rec.status === 'waiting') {
            const due = rec.rest_due_at ? Date.parse(rec.rest_due_at) <= now.getTime() : true
            if (!due && minutesSince(rec.checked_at) < 30) continue
            const items = await refreshEvents(env.deps, rec.items, 'first', { all: due })
            const verdict = firstBatchVerdict(items)
            if (verdict.kind === 'bad') {
                await stop(env, rec, `The first batch had a problem (${verdict.reason}).`, items)
                report.stopped.push(rec.id)
                continue
            }
            if (!due) {
                await env.store.update(rec.id, { items, checked_at: now.toISOString() })
                report.checked.push(rec.id)
                continue
            }
            if (verdict.kind === 'not_yet') {
                await stop(env, rec, `The first batch was not reported delivered by the time the rest was due (${verdict.reason}).`, items)
                report.stopped.push(rec.id)
                continue
            }
            const claimed = await env.store.update(rec.id, { items, checked_at: now.toISOString(), status: 'sending_rest' }, ['waiting'])
            if (!claimed) continue
            await sendTheRest(env, claimed, 'schedule')
            report.restSent.push(rec.id)
            continue
        }
        if (rec.status === 'done' && !rec.rest_checked_at) {
            const last = rec.rest_sent_at || rec.first_sent_at
            if (minutesSince(last) < 60) continue
            let items = await refreshEvents(env.deps, rec.items, 'first', { all: true })
            items = await refreshEvents(env.deps, items, 'rest', { all: true })
            await env.store.update(rec.id, { items, rest_checked_at: now.toISOString() })
            report.checked.push(rec.id)
            const rest = batchCounts(items, 'rest')
            if (rest.bounced || rest.complained) {
                await env.deps.alert(`${rec.label}: ${rest.bounced} bounced, ${rest.complained} complained`, items
                    .filter(it => it.batch === 'rest' && (it.lastEvent === 'bounced' || it.lastEvent === 'complained'))
                    .map(it => `${it.key}: ${it.lastEvent}`))
            }
        }
    }
    return report
}
