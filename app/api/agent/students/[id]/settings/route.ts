import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { updateStudentSettingsCore } from '@/lib/core/students'

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { id } = await params
    if (!id) return agentError('Missing student id', 400)

    let body: any
    try {
        body = await request.json()
    } catch {
        return agentError('Invalid JSON body', 400)
    }

    if (!body || typeof body !== 'object') {
        return agentError('Body must be a JSON object', 400)
    }

    const result = await updateStudentSettingsCore(ctx.client, id, {
        lesson_day: body.lesson_day,
        lesson_time: body.lesson_time,
        lesson_duration: body.lesson_duration,
        timezone: body.timezone,
        status: body.status,
    })

    if ('error' in result) {
        const isNotFound = result.error === 'Student not found'
        return agentError(result.error, isNotFound ? 404 : 400)
    }

    const s = result.student
    return agentOk({
        student: {
            id: s.id,
            name: s.name,
            email: s.email,
            lesson_day: s.lesson_day,
            lesson_time: s.lesson_time,
            lesson_duration: s.lesson_duration,
            timezone: s.timezone,
            status: s.status,
            updated_at: s.updated_at,
        },
    })
}
