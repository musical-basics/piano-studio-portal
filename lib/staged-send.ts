import type { DbClient } from '@/lib/supabase/admin'
import { STUDIO_TZ, studioTzAbbr } from '@/lib/studio-timezone'

/**
 * Staged family bulk emails (protocol 1.20, "start small and feel the way").
 *
 * Every bulk email to families (monthly statements, announcements, recital
 * emails) goes out in this order:
 *   1. a preview copy to the studio inbox (what the families will get);
 *   2. a first batch of FIRST_BATCH_SIZE families (different email providers
 *      first, so one provider's filtering shows up early);
 *   3. the rest HOLD_HOURS later, and only if Resend reports every email of
 *      the first batch delivered with no bounce or complaint. Anything else
 *      (a bounce, a complaint, a failed send, or no "delivered" by then)
 *      stops the send and emails the studio inbox why.
 * "Send the rest now" on the Tests card (/admin/jobs) sends what is left at
 * once, including after a stop: that is Lionel's call.
 *
 * One staged_sends row per bulk send (migration 20261120171200), which is
 * also the record on the Tests card: batch sizes, and per email whether it
 * was delivered or bounced. Each email still goes to one family at a time,
 * spaced out, never BCC. A send to one family is not bulk and is not staged.
 *
 * This file is the kind-neutral part: the plan, the verdict, the store and
 * sending reviewed emails. lib/staged-send-runner.ts adds the kinds.
 */

export const FIRST_BATCH_SIZE = 3
export const HOLD_HOURS = 24
/** Resend allows a few sends a second; one family at a time, spaced out. */
export const SEND_GAP_MS = 600
/** A send cut off partway (the server stopped) is handed back after this long. */
export const STUCK_AFTER_MINUTES = 15

export type StagedKind = 'monthly_statement' | 'announcement' | 'recital'

export const KIND_LABEL: Record<StagedKind, string> = {
    monthly_statement: 'Monthly statements',
    announcement: 'Announcement',
    recital: 'Recital emails',
}

export type StagedStatus = 'first_batch' | 'waiting' | 'sending_rest' | 'done' | 'stopped'

export type StagedEmail = {
    from?: string
    subject: string
    html: string
    text?: string | null
    replyTo?: string | null
}

export type StagedItem = {
    /** 'student:<id>', 'addr:<email>' or a recital key: unique within the send. */
    key: string
    to: string[]
    batch: 'first' | 'rest'
    status: 'pending' | 'sent' | 'failed' | 'skipped'
    resendId?: string | null
    sentAt?: string | null
    /** Resend's last event for this email: delivered, bounced, complained, ... */
    lastEvent?: string | null
    error?: string | null
    /** What to send (announcements, recital emails). Statements are rebuilt when sent. */
    email?: StagedEmail | null
}

export type StagedSend = {
    id: string
    kind: StagedKind
    ref: string
    label: string
    status: StagedStatus
    items: StagedItem[]
    context: Record<string, unknown>
    preview_sent_at: string | null
    first_sent_at: string | null
    rest_due_at: string | null
    rest_sent_at: string | null
    rest_sent_by: 'schedule' | 'hand' | null
    checked_at: string | null
    rest_checked_at: string | null
    stop_reason: string | null
    result: string | null
    result_at: string | null
    created_at: string
    updated_at: string
}

// --------------------------------------------------------------- pure ---

function domainOf(address: string): string {
    return address.split('@')[1]?.toLowerCase().trim() || address.toLowerCase()
}

/**
 * Which items go first: up to `n`, a different email provider each where
 * possible (gmail, then outlook, then a school address...), in list order.
 */
export function pickFirstBatch<T extends { to: string[] }>(items: T[], n = FIRST_BATCH_SIZE): Set<number> {
    const chosen = new Set<number>()
    const seen = new Set<string>()
    items.forEach((it, i) => {
        if (chosen.size >= n) return
        const d = domainOf(it.to[0] || '')
        if (seen.has(d)) return
        seen.add(d)
        chosen.add(i)
    })
    items.forEach((_, i) => {
        if (chosen.size < n) chosen.add(i)
    })
    return chosen
}

/** The batches for a list of recipients: the first FIRST_BATCH_SIZE (mixed providers) and the rest. */
export function planBatches<T extends { to: string[] }>(items: T[], n = FIRST_BATCH_SIZE): (T & { batch: 'first' | 'rest' })[] {
    const first = pickFirstBatch(items, n)
    return items.map((it, i) => ({ ...it, batch: first.has(i) ? 'first' as const : 'rest' as const }))
}

/** When the rest is due: HOLD_HOURS after the first batch, or earlier for an event that starts sooner. */
export function restDueAt(now: Date, deadline?: Date | null): Date {
    const hold = new Date(now.getTime() + HOLD_HOURS * 3_600_000)
    if (!deadline || deadline >= hold) return hold
    // A recital tomorrow can't wait 24 hours: the rest goes by its deadline,
    // but never sooner than 30 minutes after the first batch (enough for
    // Resend to report delivered or bounced).
    const soonest = new Date(now.getTime() + 30 * 60_000)
    return deadline > soonest ? deadline : soonest
}

const DELIVERED = new Set(['delivered', 'opened', 'clicked'])
const BAD = new Set(['bounced', 'complained', 'failed', 'canceled'])

export type BatchCounts = {
    size: number
    sent: number
    delivered: number
    bounced: number
    complained: number
    failed: number
    /** Sent, no delivered or bad event yet. */
    waiting: number
    /** Not sent yet. */
    pending: number
}

export function batchCounts(items: StagedItem[], batch: 'first' | 'rest'): BatchCounts {
    const c: BatchCounts = { size: 0, sent: 0, delivered: 0, bounced: 0, complained: 0, failed: 0, waiting: 0, pending: 0 }
    for (const it of items) {
        if (it.batch !== batch || it.status === 'skipped') continue
        c.size++
        if (it.status === 'pending') { c.pending++; continue }
        if (it.status === 'failed') { c.failed++; continue }
        c.sent++
        const ev = it.lastEvent || ''
        if (DELIVERED.has(ev)) c.delivered++
        else if (ev === 'bounced') c.bounced++
        else if (ev === 'complained') c.complained++
        else if (BAD.has(ev)) c.failed++
        else c.waiting++
    }
    return c
}

export type Verdict = { kind: 'ok' } | { kind: 'bad'; reason: string } | { kind: 'not_yet'; reason: string }

/** Whether the first batch says go: all delivered, no bounce, no complaint, nothing failed. */
export function firstBatchVerdict(items: StagedItem[]): Verdict {
    const first = items.filter(it => it.batch === 'first' && it.status !== 'skipped')
    const problems: string[] = []
    for (const it of first) {
        if (it.status === 'failed') problems.push(`${it.key}: did not send (${it.error || 'error'})`)
        else if (it.status === 'pending') problems.push(`${it.key}: was never sent`)
        else if (BAD.has(it.lastEvent || '')) problems.push(`${it.key}: ${it.lastEvent}`)
    }
    if (problems.length) return { kind: 'bad', reason: problems.join('; ') }
    const waiting = first.filter(it => !DELIVERED.has(it.lastEvent || ''))
    if (waiting.length) {
        return { kind: 'not_yet', reason: waiting.map(it => `${it.key}: ${it.lastEvent || 'no report yet'}`).join('; ') }
    }
    return { kind: 'ok' }
}

/** Removes the reviewed email bodies once they are no longer needed (keeps the record small). */
export function withoutSentBodies(items: StagedItem[]): StagedItem[] {
    return items.map(it => (it.status === 'pending' ? it : { ...it, email: null }))
}

// -------------------------------------------------------------- store ---

export type NewStaged = {
    kind: StagedKind
    ref: string
    label: string
    items: StagedItem[]
    context?: Record<string, unknown>
}

/** Where staged sends live: the table in production, memory in the self-check. */
export type StagedStore = {
    create(row: NewStaged): Promise<{ record: StagedSend } | { conflict: StagedSend | null }>
    get(id: string): Promise<StagedSend | null>
    find(kind: StagedKind, ref: string): Promise<StagedSend | null>
    /** Updates the row; with `onlyIf`, only while its status is one of those (null when it was not). */
    update(id: string, patch: Partial<StagedSend>, onlyIf?: StagedStatus[]): Promise<StagedSend | null>
    /** Sends that may still need work: waiting, sending, or done but not checked. */
    active(): Promise<StagedSend[]>
    recent(limit: number): Promise<StagedSend[]>
}

export function dbStore(client: DbClient): StagedStore {
    const table = () => client.from('staged_sends')
    return {
        async create(row) {
            const { data, error } = await table()
                .insert({ kind: row.kind, ref: row.ref, label: row.label, items: row.items, context: row.context ?? {} })
                .select('*')
                .single()
            if (error) {
                if (error.code === '23505') {
                    const { data: existing } = await table().select('*').eq('kind', row.kind).eq('ref', row.ref).maybeSingle()
                    return { conflict: (existing as StagedSend) ?? null }
                }
                throw new Error(`staged_sends insert failed: ${error.message}`)
            }
            return { record: data as StagedSend }
        },
        async get(id) {
            const { data, error } = await table().select('*').eq('id', id).maybeSingle()
            if (error) throw new Error(`staged_sends read failed: ${error.message}`)
            return (data as StagedSend) ?? null
        },
        async find(kind, ref) {
            const { data, error } = await table().select('*').eq('kind', kind).eq('ref', ref).maybeSingle()
            if (error) throw new Error(`staged_sends read failed: ${error.message}`)
            return (data as StagedSend) ?? null
        },
        async update(id, patch, onlyIf) {
            let q = table().update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
            if (onlyIf) q = q.in('status', onlyIf)
            const { data, error } = await q.select('*')
            if (error) throw new Error(`staged_sends update failed: ${error.message}`)
            return ((data || [])[0] as StagedSend) ?? null
        },
        async active() {
            const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
            const { data, error } = await table()
                .select('*')
                .or('status.in.(first_batch,waiting,sending_rest),and(status.eq.done,rest_checked_at.is.null)')
                .gte('created_at', since)
                .order('created_at')
            if (error) throw new Error(`staged_sends read failed: ${error.message}`)
            return (data || []) as StagedSend[]
        },
        async recent(limit) {
            const { data, error } = await table().select('*').order('created_at', { ascending: false }).limit(limit)
            if (error) throw new Error(`staged_sends read failed: ${error.message}`)
            return (data || []) as StagedSend[]
        },
    }
}

/** In-memory store for scripts/check_staged_sends.ts. */
export function memoryStore(): StagedStore & { rows: StagedSend[] } {
    const rows: StagedSend[] = []
    let n = 0
    const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
    return {
        rows,
        async create(row) {
            const existing = rows.find(r => r.kind === row.kind && r.ref === row.ref)
            if (existing) return { conflict: clone(existing) }
            const now = new Date().toISOString()
            const rec: StagedSend = {
                id: `staged-${++n}`, kind: row.kind, ref: row.ref, label: row.label, status: 'first_batch',
                items: clone(row.items), context: row.context ?? {}, preview_sent_at: null, first_sent_at: null,
                rest_due_at: null, rest_sent_at: null, rest_sent_by: null, checked_at: null, rest_checked_at: null,
                stop_reason: null, result: null, result_at: null, created_at: now, updated_at: now,
            }
            rows.push(rec)
            return { record: clone(rec) }
        },
        async get(id) {
            const r = rows.find(x => x.id === id)
            return r ? clone(r) : null
        },
        async find(kind, ref) {
            const r = rows.find(x => x.kind === kind && x.ref === ref)
            return r ? clone(r) : null
        },
        async update(id, patch, onlyIf) {
            const r = rows.find(x => x.id === id)
            if (!r || (onlyIf && !onlyIf.includes(r.status))) return null
            Object.assign(r, clone(patch), { updated_at: new Date().toISOString() })
            return clone(r)
        },
        async active() {
            return clone(rows.filter(r => ['first_batch', 'waiting', 'sending_rest'].includes(r.status) || (r.status === 'done' && !r.rest_checked_at)))
        },
        async recent(limit) {
            return clone([...rows].reverse().slice(0, limit))
        },
    }
}

// ------------------------------------------------------------ sending ---

export const STUDIO_FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'

export type SendResult = { id: string | null; error?: undefined } | { id?: undefined; error: string }

/** The outside world, so the self-check can stand in for Resend and the inbox. */
export type StagedDeps = {
    send(email: StagedEmail & { to: string[]; idempotencyKey?: string }): Promise<SendResult>
    /** Resend's last event for a sent email, or null when it can't be read. */
    lastEvent(id: string): Promise<string | null>
    /** The studio inbox (the admin profile's email). */
    inbox(): Promise<string>
    /** Emails the studio inbox (lib/cron-alerts.ts). */
    alert(subject: string, lines: string[]): Promise<boolean>
    sleep(ms: number): Promise<void>
    now(): Date
}

export function resendDeps(client: DbClient): StagedDeps {
    const key = process.env.RESEND_API_KEY
    let resend: any = null
    const getResend = async () => {
        if (!key) return null
        if (!resend) {
            const { Resend } = await import('resend')
            resend = new Resend(key)
        }
        return resend
    }
    return {
        async send(email) {
            const r = await getResend()
            if (!r) return { error: 'RESEND_API_KEY missing' }
            try {
                const { data, error } = await r.emails.send({
                    from: email.from || STUDIO_FROM,
                    to: email.to,
                    subject: email.subject,
                    html: email.html,
                    ...(email.text ? { text: email.text } : {}),
                    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
                }, email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined)
                if (error) return { error: `${error.name || 'error'}: ${error.message}` }
                return { id: data?.id ?? null }
            } catch (e: any) {
                return { error: String(e?.message || e) }
            }
        },
        async lastEvent(id) {
            const r = await getResend()
            if (!r) return null
            try {
                const { data, error } = await r.emails.get(id)
                if (error || !data) return null
                return (data.last_event as string) ?? null
            } catch {
                return null
            }
        },
        async inbox() {
            const { studioInbox } = await import('@/lib/cron-alerts')
            return studioInbox(client)
        },
        async alert(subject, lines) {
            const { sendCronAlert } = await import('@/lib/cron-alerts')
            return sendCronAlert(client, {
                subject,
                lines,
                footer: 'Family bulk emails go out small first (protocol 1.20). The send and each email\'s delivery are on the Tests card: ' +
                    '<a href="https://lessons.musicalbasics.com/admin/jobs">lessons.musicalbasics.com/admin/jobs</a>, where "Send the rest now" sends what is left.',
            })
        },
        sleep: ms => new Promise(r => setTimeout(r, ms)),
        now: () => new Date(),
    }
}

function escapeHtml(s: string): string {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** The words above the preview copy in the studio inbox. */
export function previewBanner(total: number, firstCount: number, due: Date | null): string {
    const rest = total - firstCount
    const families = total === 1 ? '1 family' : `${total} families`
    const when = due
        ? `${due.toLocaleString('en-US', { timeZone: STUDIO_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ${studioTzAbbr(due)}`
        : null
    return rest > 0
        ? `Preview copy: this is what ${families} get. The first ${firstCount} go out now; the other ${rest} around ${when}, ` +
          `only if those ${firstCount} are delivered with no bounce or complaint. To send them sooner or stop, use the Tests card on the Jobs page.`
        : `Preview copy: this is what ${families} get. All ${firstCount} go out now.`
}

/** The preview copy to the studio inbox: the email as a family gets it, with a line on top. */
export async function sendPreview(
    deps: StagedDeps,
    { email, total, firstCount, due, idempotencyKey }: { email: StagedEmail; total: number; firstCount: number; due: Date | null; idempotencyKey: string },
): Promise<SendResult> {
    const inbox = await deps.inbox()
    const banner = previewBanner(total, firstCount, due)
    return deps.send({
        from: email.from,
        to: [inbox],
        subject: `Preview: ${email.subject}`,
        html: `<div style="font-family:-apple-system,sans-serif;background:#fff7e6;border:1px solid #f5d08a;border-radius:6px;padding:10px 14px;margin:0 0 16px;font-size:13px;color:#7a5200;">${escapeHtml(banner)}</div>${email.html}`,
        text: email.text ? `${banner}\n\n${email.text}` : null,
        idempotencyKey,
    })
}

/**
 * Sends the pending items that carry their own email, one at a time and
 * spaced out, marking each as it goes. `save` is called after each, so a send
 * cut off partway never sends the same family twice (and Resend's idempotency
 * key covers a retry within 24 hours).
 */
export async function sendEmailItems(
    deps: StagedDeps,
    record: Pick<StagedSend, 'id'>,
    items: StagedItem[],
    which: (it: StagedItem) => boolean,
    save: (items: StagedItem[]) => Promise<void>,
): Promise<StagedItem[]> {
    const out = items.map(it => ({ ...it }))
    let first = true
    for (const it of out) {
        if (it.status !== 'pending' || !which(it)) continue
        if (!it.email) {
            it.status = 'failed'
            it.error = 'no email stored to send'
            continue
        }
        if (!first) await deps.sleep(SEND_GAP_MS)
        first = false
        const res = await deps.send({ ...it.email, to: it.to, idempotencyKey: `staged/${record.id}/${it.key}`.slice(0, 256) })
        if (res.error !== undefined) {
            it.status = 'failed'
            it.error = res.error
        } else {
            it.status = 'sent'
            it.resendId = res.id
            it.sentAt = deps.now().toISOString()
            it.email = null
        }
        await save(out)
    }
    return out
}

/**
 * Reads Resend's last event for each sent item of a batch (spaced under the
 * rate limit). A bounce or complaint is final; a delivered email is read
 * again only with `all` (a complaint comes after delivery).
 */
export async function refreshEvents(deps: StagedDeps, items: StagedItem[], batch: 'first' | 'rest', { all = false }: { all?: boolean } = {}): Promise<StagedItem[]> {
    const out = items.map(it => ({ ...it }))
    let first = true
    for (const it of out) {
        if (it.batch !== batch || it.status !== 'sent' || !it.resendId) continue
        if (BAD.has(it.lastEvent || '') || (!all && DELIVERED.has(it.lastEvent || ''))) continue
        if (!first) await deps.sleep(SEND_GAP_MS)
        first = false
        const ev = await deps.lastEvent(it.resendId)
        if (ev) it.lastEvent = ev
    }
    return out
}
