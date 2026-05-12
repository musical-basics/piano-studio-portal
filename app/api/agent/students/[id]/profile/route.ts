import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { updateStudentProfileCore } from '@/lib/core/students'

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

    const result = await updateStudentProfileCore(ctx.client, id, body ?? {})

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
            phone: s.phone,
            parent_email: s.parent_email,
            status: s.status,
            timezone: s.timezone,
            lesson_day: s.lesson_day,
            lesson_time: s.lesson_time,
            lesson_duration: s.lesson_duration,
            updated_at: s.updated_at,
        },
    })
}
