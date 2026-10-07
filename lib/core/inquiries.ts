import type { Resend } from 'resend'
import type { DbClient } from '@/lib/supabase/admin'
import type { InquiryMessage } from '@/types/admin'

export async function getInquiryAdmin(client: DbClient) {
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return { error: 'Not authenticated' } as const

    const { data: admin } = await client.from('profiles')
        .select('role, email').eq('id', user.id).single()
    if (admin?.role !== 'admin') return { error: 'Not authorized' } as const
    return { admin } as const
}

type ReplyResult = {
    success: boolean
    error?: string
    warning?: string
    message?: InquiryMessage
}

export async function sendInquiryReplyCore({ client, emails, inquiryId, content, requestId }: {
    client: DbClient
    emails: Pick<Resend['emails'], 'send'>
    inquiryId: string
    content: string
    requestId: string
}): Promise<ReplyResult> {
    const auth = await getInquiryAdmin(client)
    if (auth.error) return { success: false, error: auth.error }

    const body = typeof content === 'string' ? content.trim() : ''
    if (!body || body.length > 10000) {
        return { success: false, error: 'Enter a reply between 1 and 10,000 characters.' }
    }
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        return { success: false, error: 'Please reopen the inquiry and try again.' }
    }
    if (!auth.admin.email) return { success: false, error: 'Your admin profile needs an email address for replies.' }

    const { data: lead, error: leadError } = await client.from('crm_students')
        .select('id, email').eq('id', inquiryId).single()
    if (leadError || !lead) return { success: false, error: 'Inquiry not found.' }
    if (!lead.email) return { success: false, error: 'This inquiry has no email address.' }

    // A retried action must not send a second copy, even after the provider's
    // idempotency window expires. The request ID also identifies the saved reply.
    const { data: existing, error: existingError } = await client.from('crm_messages')
        .select('id, student_id, body_text, sender_role, created_at').eq('id', requestId).maybeSingle()
    if (existingError) return { success: false, error: 'Could not check reply history. Please try again.' }
    if (existing) {
        if (existing.student_id !== inquiryId || existing.sender_role !== 'instructor' || existing.body_text !== body) {
            return { success: false, error: 'This reply has changed. Please reopen the inquiry and try again.' }
        }
        return { success: true, message: existing as InquiryMessage }
    }

    try {
        const { data, error } = await emails.send({
            from: 'Lionel Yu <system@updates.musicalbasics.com>',
            to: lead.email,
            replyTo: auth.admin.email,
            subject: 'Re: Piano Lesson Inquiry',
            text: body,
        }, { idempotencyKey: `inquiry-reply/${inquiryId}/${requestId}` })
        if (error || !data) {
            console.error('Inquiry reply email rejected:', error)
            return { success: false, error: 'Email could not be sent. Your draft has been kept; please try again.' }
        }
    } catch (error) {
        console.error('Inquiry reply email failed:', error)
        return { success: false, error: 'Could not confirm the send. Retry this draft to avoid sending a duplicate.' }
    }

    // Once email is accepted, report bookkeeping failures as warnings so the
    // admin does not resend a message that already went out.
    const warnings: string[] = []
    let savedMessage: InquiryMessage | undefined
    try {
        const { data, error } = await client.from('crm_messages').upsert({
            id: requestId,
            student_id: inquiryId,
            sender_role: 'instructor',
            body_text: body,
        }, { onConflict: 'id' }).select('id, body_text, sender_role, created_at').single()
        if (error) throw error
        savedMessage = data as InquiryMessage
    } catch (error) {
        console.error('Inquiry reply history failed:', error)
        warnings.push('The email was sent, but its history could not be saved. Do not resend it.')
    }
    try {
        const { error } = await client.from('crm_students')
            .update({ status: 'Contacted', last_contacted_at: new Date().toISOString() })
            .eq('id', inquiryId).eq('status', 'Lead')
        if (error) throw error
    } catch (error) {
        console.error('Inquiry reply status failed:', error)
        warnings.push('The inquiry status could not be updated.')
    }
    return { success: true, message: savedMessage, warning: warnings.join(' ') || undefined }
}
