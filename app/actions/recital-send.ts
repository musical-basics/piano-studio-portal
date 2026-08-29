'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'
import { revalidatePath } from 'next/cache'
import {
    emptySendLog,
    type AudienceMember,
    type ProgramEntry,
    type RecitalSendLog,
} from '@/lib/recital-send'

// Server actions for the /admin/recital-send review page. Everything the page
// shows is exactly what these actions send: subjects and bodies come from the
// client after Lionel has reviewed (and possibly edited) them; the server only
// escapes, linkifies, and wraps them in the studio email chrome.
//
// Send state persists in the private `studio_private` storage bucket at
// recital/{eventId}/send-log.json (service-role only). We use storage instead
// of a table because prod schema migrations can't be applied from the app.

const FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'
const BUCKET = 'studio_private'

const logPath = (eventId: string) => `recital/${eventId}/send-log.json`

async function requireAdmin(): Promise<{ error: string } | { userId: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    if (profile?.role !== 'admin') return { error: 'Admins only' }
    return { userId: user.id }
}

async function readLog(eventId: string): Promise<RecitalSendLog> {
    const admin = createAdminClient()
    const { data } = await admin.storage.from(BUCKET).download(logPath(eventId))
    if (!data) return emptySendLog()
    try {
        const parsed = JSON.parse(await data.text())
        return { ...emptySendLog(), ...parsed }
    } catch {
        return emptySendLog()
    }
}

async function writeLog(eventId: string, log: RecitalSendLog): Promise<void> {
    const admin = createAdminClient()
    const { error } = await admin.storage
        .from(BUCKET)
        .upload(logPath(eventId), JSON.stringify(log, null, 2), {
            contentType: 'application/json',
            upsert: true,
        })
    if (error) throw new Error(`send-log write failed: ${error.message}`)
}

export type RecitalSendActionResult = {
    error?: string
    success?: boolean
    log?: RecitalSendLog
    sentCount?: number
    skipped?: number
    results?: Record<string, string>
}

export async function getRecitalSendLog(eventId: string): Promise<RecitalSendActionResult> {
    const gate = await requireAdmin()
    if ('error' in gate) return { error: gate.error }
    return { log: await readLog(eventId) }
}

/** Persist program order/pieces and the audience list (both review-page edits). */
export async function updateRecitalSendMeta(
    eventId: string,
    meta: { program?: ProgramEntry[]; audience?: AudienceMember[] }
): Promise<RecitalSendActionResult> {
    const gate = await requireAdmin()
    if ('error' in gate) return { error: gate.error }

    const log = await readLog(eventId)
    if (meta.program) log.program = meta.program
    if (meta.audience) log.audience = meta.audience
    await writeLog(eventId, log)
    revalidatePath('/admin/recital-send')
    return { success: true, log }
}

function escapeHtml(s: string): string {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}

/** Plain reviewed text -> simple studio-styled HTML (links clickable). */
function renderBodyHtml(body: string, trackingPixelUrl?: string): string {
    const escaped = escapeHtml(body)
    const linkified = escaped.replace(
        /https?:\/\/[^\s<]+/g,
        url => `<a href="${url}" style="color:#4f46e5; word-break:break-all;">${url}</a>`
    )
    const paragraphs = linkified
        .split(/\n{2,}/)
        .map(p => `<p style="font-size:14px; line-height:24px; color:#555; margin:0 0 16px; white-space:pre-wrap;">${p}</p>`)
        .join('')
    return `<div style="background-color:#f6f9fc; padding:24px 0; font-family:-apple-system, sans-serif;">
        <div style="background-color:#ffffff; margin:0 auto; padding:32px 28px; max-width:560px; border-radius:8px;">
            ${paragraphs}
            <p style="font-size:12px; color:#999; text-align:center; margin:28px 0 0;">Lionel Yu Piano Studio</p>
            ${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:block;" />` : ''}
        </div>
    </div>`
}

export type RecitalSendItem = {
    /** Recipient key used in the send log: 'student:<id>', 'guest:<email>', 'audience:<email>'. */
    key: string
    to: string[]
    subject: string
    body: string
    /** When set (students), an open-tracking pixel for this family is embedded. */
    trackPublicId?: string
}

/**
 * Send the reviewed emails via one Resend batch call. Skips any key already
 * marked sent in the log (double-click / double-tab protection); pass nothing
 * twice unless the log entry was cleared.
 */
export async function sendRecitalEmails(eventId: string, items: RecitalSendItem[]): Promise<RecitalSendActionResult> {
    const gate = await requireAdmin()
    if ('error' in gate) return { error: gate.error }
    if (!process.env.RESEND_API_KEY) return { error: 'RESEND_API_KEY is not configured' }
    if (items.length === 0) return { error: 'Nothing to send' }

    const valid = items.filter(i =>
        i.key && i.subject.trim() && i.body.trim() &&
        i.to.length > 0 && i.to.every(t => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t))
    )
    if (valid.length !== items.length) {
        return { error: 'Some emails have a missing subject, body, or invalid address. Nothing was sent.' }
    }

    const log = await readLog(eventId)
    const toSend = valid.filter(i => !log.sent[i.key])
    const skipped = valid.length - toSend.length
    if (toSend.length === 0) {
        return { error: 'All of these were already sent (see the sent log).', log }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'
    const resend = new Resend(process.env.RESEND_API_KEY)
    const payloads = toSend.map(i => ({
        from: FROM,
        to: i.to,
        subject: i.subject,
        html: renderBodyHtml(
            i.body,
            i.trackPublicId ? `${appUrl}/api/recital-track?e=${eventId}&p=${i.trackPublicId}` : undefined
        ),
    }))

    const { data, error } = await resend.batch.send(payloads)
    if (error) return { error: `Resend error: ${error.message}` }

    const ids = (data?.data || []).map(d => d.id)
    const now = new Date().toISOString()
    toSend.forEach((i, idx) => {
        log.sent[i.key] = { at: now, to: i.to, subject: i.subject, resendIds: ids[idx] ? [ids[idx]] : [] }
    })
    await writeLog(eventId, log)
    revalidatePath('/admin/recital-send')
    return { success: true, sentCount: toSend.length, skipped, log }
}

export type RecitalReminderInput = {
    key: string // '2h' | '15m'
    subject: string
    body: string
    /** ISO instant at which the email should be delivered. */
    scheduledFor: string
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Schedule reminder emails via Resend scheduledAt: ONE individual email per
 * recipient, never a BCC blast (studio rule; BCC hurts deliverability and
 * arrives addressed to the wrong inbox). The batch endpoint doesn't support
 * scheduledAt, so this loops with a delay under Resend's 2 req/sec limit.
 * Per-recipient ids are logged as we go, so a partial failure is visible and
 * a retry schedules only the recipients that are still missing.
 */
export async function scheduleRecitalReminders(
    eventId: string,
    reminders: RecitalReminderInput[],
    recipients: string[]
): Promise<RecitalSendActionResult> {
    const gate = await requireAdmin()
    if ('error' in gate) return { error: gate.error }
    if (!process.env.RESEND_API_KEY) return { error: 'RESEND_API_KEY is not configured' }

    const emails = [...new Set(recipients.map(r => r.trim().toLowerCase()))]
        .filter(r => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r))
    if (emails.length === 0) return { error: 'No valid reminder recipients' }

    const log = await readLog(eventId)
    const resend = new Resend(process.env.RESEND_API_KEY)
    const results: Record<string, string> = {}

    for (const reminder of reminders) {
        const existing = log.reminders[reminder.key]
        const alreadyScheduled = new Set(
            existing && !existing.canceledAt ? (existing.perRecipient || []).map(p => p.email) : []
        )
        // Fully covered already (or an old-style record with no per-recipient
        // detail): don't schedule anything twice.
        if (existing && !existing.canceledAt && (!existing.perRecipient || emails.every(e => alreadyScheduled.has(e)))) {
            results[reminder.key] = 'already scheduled, skipped'
            continue
        }
        if (new Date(reminder.scheduledFor).getTime() <= Date.now()) {
            results[reminder.key] = 'scheduled time is in the past, skipped'
            continue
        }

        const perRecipient: { email: string; id: string }[] =
            existing && !existing.canceledAt ? [...(existing.perRecipient || [])] : []
        const pending = emails.filter(e => !alreadyScheduled.has(e))
        let failure: string | null = null
        for (const email of pending) {
            const { data, error } = await resend.emails.send({
                from: FROM,
                to: [email],
                subject: reminder.subject,
                html: renderBodyHtml(reminder.body),
                scheduledAt: reminder.scheduledFor,
            })
            if (error) {
                failure = `${reminder.key}: scheduled ${perRecipient.length} of ${emails.length}, then Resend error: ${error.message}. Retry to schedule the rest.`
                break
            }
            if (data?.id) perRecipient.push({ email, id: data.id })
            await sleep(600)
        }

        log.reminders[reminder.key] = {
            scheduledAt: new Date().toISOString(),
            scheduledFor: reminder.scheduledFor,
            subject: reminder.subject,
            recipientCount: perRecipient.length,
            resendIds: perRecipient.map(p => p.id),
            perRecipient,
        }
        if (failure) {
            await writeLog(eventId, log)
            revalidatePath('/admin/recital-send')
            return { error: failure, log }
        }
        results[reminder.key] = `scheduled ${perRecipient.length} emails for ${reminder.scheduledFor}`
    }

    await writeLog(eventId, log)
    revalidatePath('/admin/recital-send')
    return { success: true, results, log }
}

export async function cancelRecitalReminder(eventId: string, key: string): Promise<RecitalSendActionResult> {
    const gate = await requireAdmin()
    if ('error' in gate) return { error: gate.error }
    if (!process.env.RESEND_API_KEY) return { error: 'RESEND_API_KEY is not configured' }

    const log = await readLog(eventId)
    const record = log.reminders[key]
    if (!record || record.canceledAt) return { error: 'No active scheduled reminder to cancel', log }

    // Cancel every scheduled email; tolerate individual failures (an email
    // that already delivered can't be canceled) and report the count.
    const resend = new Resend(process.env.RESEND_API_KEY)
    let failed = 0
    for (const id of record.resendIds) {
        const { error } = await resend.emails.cancel(id)
        if (error) failed++
    }
    record.canceledAt = new Date().toISOString()
    await writeLog(eventId, log)
    revalidatePath('/admin/recital-send')
    return {
        success: true,
        results: { [key]: failed === 0 ? 'all canceled' : `${record.resendIds.length - failed} canceled, ${failed} could not be (likely already delivered)` },
        log,
    }
}
