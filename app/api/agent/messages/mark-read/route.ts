import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { markMessagesReadCore } from '@/lib/core/messages'

export async function POST(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    let body: any
    try {
        body = await request.json()
    } catch {
        return agentError('Invalid JSON body', 400)
    }

    const { student_id: studentId } = body ?? {}
    if (!studentId || typeof studentId !== 'string') {
        return agentError('student_id is required', 400)
    }

    const result = await markMessagesReadCore(ctx.client, studentId, ctx.admin.id)
    if ('error' in result && result.error) return agentError(result.error, 500)

    return agentOk({ success: true })
}
