import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Resend } from 'resend'
import type { DbClient } from '../lib/supabase/admin'
import { sendInquiryReplyCore } from '../lib/core/inquiries'

const inquiryId = '40000000-0000-4000-8000-000000000001'
const requestId = '40000000-0000-4000-8000-000000000002'
const content = 'Hello,\n\nThank you for your inquiry.\nLionel'

function setup(options: {
    signedIn?: boolean
    role?: string
    email?: string | null
    status?: string
    emailFailure?: 'reject' | 'throw'
    historyFailure?: boolean
    statusFailure?: boolean
    lookupFailure?: boolean
} = {}) {
    const lead = { id: inquiryId, email: options.email === undefined ? 'inquirer@example.com' : options.email, status: options.status || 'Lead' }
    const messages = new Map<string, Record<string, unknown>>()
    const sent: { payload: Record<string, unknown>; options: unknown }[] = []
    let writes = 0
    const client = {
        auth: { getUser: async () => ({ data: { user: options.signedIn === false ? null : { id: 'admin' } }, error: null }) },
        from(table: string) {
            const filters: Record<string, unknown> = {}
            let mutation: Record<string, unknown> | undefined
            const run = async () => {
                if (table === 'profiles') return { data: { role: options.role || 'admin', email: 'teacher@example.com' }, error: null }
                if (mutation) {
                    writes++
                    if (table === 'crm_messages') {
                        if (options.historyFailure) throw new Error('History unavailable')
                        const row: Record<string, unknown> = { ...mutation, created_at: '2026-10-06T12:00:00Z' }
                        messages.set(String(row.id), row)
                        return { data: row, error: null }
                    }
                    if (options.statusFailure) return { data: null, error: { message: 'Status unavailable' } }
                    if (!filters.status || filters.status === lead.status) Object.assign(lead, mutation)
                    return { data: lead, error: null }
                }
                if (options.lookupFailure && table === 'crm_students') return { data: null, error: { message: 'Not found' } }
                return { data: table === 'crm_students' ? lead : messages.get(String(filters.id)) || null, error: null }
            }
            const query = {
                select() { return query },
                eq(key: string, value: unknown) { filters[key] = value; return query },
                single: run,
                maybeSingle: run,
                upsert(row: Record<string, unknown>) { mutation = row; return query },
                update(row: Record<string, unknown>) { mutation = row; return query },
                then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) { return run().then(resolve, reject) },
            }
            return query
        },
    } as unknown as DbClient
    const emails = {
        async send(payload: Record<string, unknown>, emailOptions: unknown) {
            sent.push({ payload, options: emailOptions })
            if (options.emailFailure === 'throw') throw new Error('Network timeout')
            if (options.emailFailure === 'reject') return { data: null, error: { message: 'Rejected' } }
            return { data: { id: 'email-id' }, error: null }
        },
    } as unknown as Pick<Resend['emails'], 'send'>
    const reply = (overrides = {}) => sendInquiryReplyCore({ client, emails, inquiryId, content, requestId, ...overrides })
    return { reply, sent, messages, lead, writes: () => writes }
}

test('unauthenticated users and non-admins cannot send inquiry replies', async () => {
    for (const options of [{ signedIn: false }, { role: 'student' }, { role: 'prospect' }]) {
        const state = setup(options)
        assert.equal((await state.reply()).success, false)
        assert.equal(state.sent.length, 0)
        assert.equal(state.writes(), 0)
    }
})

test('empty, oversized, and malformed requests are rejected before sending', async () => {
    for (const input of [{ content: '   ' }, { content: 'x'.repeat(10001) }, { requestId: 'invalid' }]) {
        const state = setup()
        assert.equal((await state.reply(input)).success, false)
        assert.equal(state.sent.length, 0)
    }
})

test('missing inquiries or email addresses cannot receive replies', async () => {
    for (const options of [{ lookupFailure: true }, { email: null }]) {
        const state = setup(options)
        assert.equal((await state.reply()).success, false)
        assert.equal(state.sent.length, 0)
    }
})

test('provider rejection or network failure does not save a sent reply or mark contacted', async () => {
    for (const emailFailure of ['reject', 'throw'] as const) {
        const state = setup({ emailFailure })
        const result = await state.reply()
        assert.equal(result.success, false)
        assert.ok(result.error)
        assert.equal(state.writes(), 0)
        assert.equal(state.lead.status, 'Lead')
    }
})

test('accepted replies send the complete plain text, route responses to the admin, and save history', async () => {
    const state = setup()
    const result = await state.reply({ content: `  ${content}  ` })
    assert.equal(result.success, true)
    assert.equal(result.warning, undefined)
    assert.equal(state.sent[0].payload.to, 'inquirer@example.com')
    assert.equal(state.sent[0].payload.replyTo, 'teacher@example.com')
    assert.equal(state.sent[0].payload.text, content)
    assert.deepEqual(state.sent[0].options, { idempotencyKey: `inquiry-reply/${inquiryId}/${requestId}` })
    assert.equal(result.message?.sender_role, 'instructor')
    assert.equal(result.message?.body_text, content)
    assert.equal(state.lead.status, 'Contacted')
})

test('replying does not downgrade prospects, enrolled students, or archived inquiries', async () => {
    for (const status of ['Contacted', 'Prospect', 'Student', 'Archived']) {
        const state = setup({ status })
        assert.equal((await state.reply()).success, true)
        assert.equal(state.lead.status, status)
    }
})

test('retrying the same successful request does not send or save a duplicate', async () => {
    const state = setup()
    assert.equal((await state.reply()).success, true)
    assert.equal((await state.reply()).success, true)
    assert.equal(state.sent.length, 1)
    assert.equal(state.messages.size, 1)
})

test('a reused request ID cannot silently replace an already-sent reply', async () => {
    const state = setup()
    await state.reply()
    assert.equal((await state.reply({ content: 'Changed message' })).success, false)
    assert.equal((await state.reply({ inquiryId: 'another-inquiry' })).success, false)
    assert.equal(state.sent.length, 1)
    assert.equal(state.messages.get(requestId)?.body_text, content)
})

test('database failures after sending are reported as sent with a warning', async () => {
    for (const options of [{ historyFailure: true }, { statusFailure: true }]) {
        const state = setup(options)
        const result = await state.reply()
        assert.equal(result.success, true)
        assert.ok(result.warning)
        assert.equal(state.sent.length, 1)
    }
})
