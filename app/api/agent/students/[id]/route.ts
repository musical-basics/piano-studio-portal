import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import {
    ALLOWED_STUDENT_STATUSES,
    updateStudentStatusCore,
    resolveSalutation,
    type StudentStatus,
} from '@/lib/core/students'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { id } = await params
    if (!id) return agentError('Missing student id', 400)

    const { data: studentRow, error } = await ctx.client
        .from('profiles')
        .select('*')
        .eq('id', id)
        .eq('role', 'student')
        .single()

    if (error || !studentRow) {
        return agentError('Student not found', 404)
    }

    const row = studentRow as any
    const student = {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        credits: row.credits,
        credits_total: row.credits_total,
        balance_due: row.balance_due,
        status: row.status,
        timezone: row.timezone,
        parent_email: row.parent_email,
        lesson_day: row.lesson_day,
        lesson_time: row.lesson_time,
        lesson_duration: row.lesson_duration,
        preferred_name: row.preferred_name ?? null,
        parent_contact_name: row.parent_contact_name ?? null,
        contact_salutation: row.contact_salutation ?? null,
        primary_contact_role: row.primary_contact_role ?? null,
        salutation: resolveSalutation(row),
        created_at: row.created_at,
    }

    const today = new Date().toISOString().slice(0, 10)
    const { data: upcoming } = await ctx.client
        .from('lessons')
        .select('id, date, time, duration, status, zoom_link, notes')
        .eq('student_id', id)
        .gte('date', today)
        .neq('status', 'cancelled')
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(50)

    return agentOk({ student, upcomingLessons: upcoming ?? [] })
}

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

    const { status } = body ?? {}
    if (!ALLOWED_STUDENT_STATUSES.includes(status)) {
        return agentError(
            `status must be one of: ${ALLOWED_STUDENT_STATUSES.join(', ')}`,
            400,
        )
    }

    const result = await updateStudentStatusCore(ctx.client, id, status as StudentStatus)
    if ('error' in result) {
        const isNotFound = result.error === 'Student not found'
        return agentError(result.error, isNotFound ? 404 : 400)
    }

    return agentOk({ student: result.student })
}
