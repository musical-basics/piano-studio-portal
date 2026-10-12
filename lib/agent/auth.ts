import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { getSingleAdmin, type AdminProfile } from '@/lib/core/admin'

export type AgentContext = {
    client: DbClient
    admin: AdminProfile
    /** 'elephant' keys may only log lessons; 'agent' keys have full access. */
    caller: 'agent' | 'elephant'
}

/** Compare fixed-length digests so the check does not leak secret length or prefix. */
function secretMatches(provided: string, expected: string | undefined): boolean {
    if (!expected) return false
    return timingSafeEqual(
        createHash('sha256').update(provided).digest(),
        createHash('sha256').update(expected).digest(),
    )
}

/**
 * Verifies an agent request:
 *   - requires Authorization: Bearer <AGENT_API_SECRET>
 *   - or, where `allowElephant` is set, Bearer <ELEPHANT_LESSON_LOG_SECRET>,
 *     a separate key for the Elephant app that can be revoked on its own
 *   - resolves the single admin profile (the agent acts on its behalf)
 *
 * Returns either the context to use, or a NextResponse to return directly.
 */
export async function verifyAgentRequest(
    request: NextRequest,
    { allowElephant = false }: { allowElephant?: boolean } = {},
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
    const caller = provided.length === 0
        ? null
        : secretMatches(provided, expected)
            ? 'agent'
            : allowElephant && secretMatches(provided, process.env.ELEPHANT_LESSON_LOG_SECRET)
                ? 'elephant'
                : null
    if (!caller) {
        return NextResponse.json({ error: 'Invalid bearer token' }, { status: 401 })
    }

    const client = createAdminClient()
    const admin = await getSingleAdmin(client)
    if (!admin) {
        return NextResponse.json({ error: 'No admin profile found' }, { status: 500 })
    }

    return { client, admin, caller }
}

export function agentError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status })
}

export function agentOk<T>(data: T, status = 200) {
    return NextResponse.json(data, { status })
}
