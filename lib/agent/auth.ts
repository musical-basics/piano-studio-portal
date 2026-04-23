import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { getSingleAdmin, type AdminProfile } from '@/lib/core/admin'

export type AgentContext = {
    client: DbClient
    admin: AdminProfile
}

/**
 * Verifies an agent request:
 *   - requires Authorization: Bearer <AGENT_API_SECRET>
 *   - resolves the single admin profile (the agent acts on its behalf)
 *
 * Returns either the context to use, or a NextResponse to return directly.
 */
export async function verifyAgentRequest(
    request: NextRequest,
): Promise<AgentContext | NextResponse> {
    const expected = process.env.AGENT_API_SECRET
    if (!expected) {
        return NextResponse.json(
            { error: 'AGENT_API_SECRET is not configured on the server' },
            { status: 500 },
        )
    }

    const header = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
        return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
    }

    const provided = header.slice(7).trim()
    if (provided.length === 0 || provided !== expected) {
        return NextResponse.json({ error: 'Invalid bearer token' }, { status: 401 })
    }

    const client = createAdminClient()
    const admin = await getSingleAdmin(client)
    if (!admin) {
        return NextResponse.json({ error: 'No admin profile found' }, { status: 500 })
    }

    return { client, admin }
}

export function agentError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status })
}

export function agentOk<T>(data: T, status = 200) {
    return NextResponse.json(data, { status })
}
