import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { getConversationCore, sendMessageCore } from '@/lib/core/messages'

export async function GET(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const studentId = request.nextUrl.searchParams.get('student_id')
    if (!studentId) return agentError('student_id query param is required', 400)

    const result = await getConversationCore(ctx.client, ctx.admin.id, studentId)
    if (result.error) return agentError(result.error, 500)

    return agentOk({ messages: result.messages })
}

export async function POST(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    let body: any
    try {
        body = await request.json()
    } catch {
        return agentError('Invalid JSON body', 400)
    }

    const { student_id: studentId, content, attachments } = body ?? {}
    if (!studentId || typeof studentId !== 'string') {
        return agentError('student_id is required', 400)
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return agentError('content is required', 400)
    }

    const result = await sendMessageCore({
        client: ctx.client,
        senderId: ctx.admin.id,
        recipientId: studentId,
        content,
        attachments: Array.isArray(attachments) ? attachments : undefined,
    })

    if (result.error) return agentError(result.error, 400)
    return agentOk({ message: result.message }, 201)
}
