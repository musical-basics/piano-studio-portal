import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { rescheduleLessonCore, cancelLessonCore } from '@/lib/core/lessons'

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { id } = await params
    if (!id) return agentError('Missing lesson id', 400)

    let body: any
    try {
        body = await request.json()
    } catch {
        return agentError('Invalid JSON body', 400)
    }

    const { date, time, duration, confirm_override } = body ?? {}
    if (!date || typeof date !== 'string') return agentError('date is required (YYYY-MM-DD)', 400)
    if (!time || typeof time !== 'string') return agentError('time is required (HH:MM 24h)', 400)

    const parsedDuration = typeof duration === 'number' ? duration : 60

    const result = await rescheduleLessonCore({
        client: ctx.client,
        adminId: ctx.admin.id,
        lessonId: id,
        newDate: date,
        newTime: time,
        newDuration: parsedDuration,
        confirmOverride: confirm_override === true,
    })

    if ('error' in result) {
        if (result.error === 'lesson_intent_conflict') {
            return NextResponse.json({
                error: 'lesson_intent_conflict',
                conflicts: result.conflicts
            }, { status: 409 })
        }
        return agentError(result.error ?? 'Request failed', 400)
    }

    return agentOk({ 
        success: true, 
        message: result.message,
        warning: result.warning,
        conflicts: result.conflicts
    })
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { id } = await params
    if (!id) return agentError('Missing lesson id', 400)

    const result = await cancelLessonCore({
        client: ctx.client,
        actorId: ctx.admin.id,
        actorRole: 'admin',
        lessonId: id,
    })

    if ('error' in result) return agentError(result.error ?? 'Request failed', 400)
    return agentOk({ success: true, refunded: result.refunded, message: result.message })
}
