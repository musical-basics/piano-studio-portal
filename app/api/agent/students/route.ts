import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk } from '@/lib/agent/auth'

export async function GET(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { data, error } = await ctx.client
        .from('profiles')
        .select('id, name, email, phone, credits, credits_total, balance_due, status, timezone, created_at')
        .eq('role', 'student')
        .order('name', { ascending: true })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return agentOk({ students: data ?? [] })
}
