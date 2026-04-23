import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk } from '@/lib/agent/auth'
import { listThreadsCore } from '@/lib/core/messages'

export async function GET(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { threads } = await listThreadsCore(ctx.client, ctx.admin.id)
    return agentOk({ threads })
}
