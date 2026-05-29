import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { id } = await params
    if (!id) return agentError('Missing flag id', 400)

    let body: any
    try {
        body = await request.json()
    } catch {
        return agentError('Invalid JSON body', 400)
    }

    const { status, note, lesson_id: lessonId } = body ?? {}

    if (!status && !note && lessonId === undefined) {
        return agentError('At least one field to update (status, note, lesson_id) is required', 400)
    }

    const updateFields: any = {
        updated_at: new Date().toISOString()
    }

    if (status) {
        const allowedStatuses = ['active', 'resolved', 'dismissed']
        if (!allowedStatuses.includes(status)) {
            return agentError(`Invalid status. Allowed: ${allowedStatuses.join(', ')}`, 400)
        }
        updateFields.status = status

        if (status === 'resolved') {
            updateFields.resolved_at = new Date().toISOString()
            updateFields.resolved_by = ctx.admin.id
        } else if (status === 'dismissed') {
            updateFields.dismissed_at = new Date().toISOString()
            updateFields.dismissed_by = ctx.admin.id
        }
    }

    if (note !== undefined) {
        updateFields.note = note
    }

    if (lessonId !== undefined) {
        updateFields.lesson_id = lessonId
    }

    const { data: flag, error } = await ctx.client
        .from('lesson_intent_flags')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        return agentError(error.message, 400)
    }

    return agentOk({ flag })
}
