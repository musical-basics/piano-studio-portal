import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk } from '@/lib/agent/auth'
import { resolveSalutation } from '@/lib/core/students'

export async function GET(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { data, error } = await ctx.client
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('name', { ascending: true })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const students = (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        credits: row.credits,
        credits_total: row.credits_total,
        balance_due: row.balance_due,
        status: row.status,
        timezone: row.timezone,
        preferred_name: row.preferred_name ?? null,
        parent_contact_name: row.parent_contact_name ?? null,
        contact_salutation: row.contact_salutation ?? null,
        primary_contact_role: row.primary_contact_role ?? null,
        salutation: resolveSalutation(row),
        created_at: row.created_at,
    }))

    return agentOk({ students })
}
