import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { adjustStudentCreditsCore, type AdjustCreditsArgs } from '@/lib/core/students'

export async function POST(
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

    const hasDelta = typeof body?.delta === 'number'
    const hasSet = typeof body?.set === 'number'

    if (hasDelta === hasSet) {
        return agentError(
            'provide exactly one of { "delta": integer } or { "set": integer >= 0 }',
            400,
        )
    }

    const args: AdjustCreditsArgs = hasDelta
        ? { mode: 'delta', amount: body.delta }
        : { mode: 'set', amount: body.set }

    const result = await adjustStudentCreditsCore(ctx.client, id, args)
    if ('error' in result) {
        const isNotFound = result.error === 'Student not found'
        return agentError(result.error, isNotFound ? 404 : 400)
    }

    return agentOk({
        student: result.student,
        previous_credits: result.previous_credits,
        new_credits: result.new_credits,
    })
}
