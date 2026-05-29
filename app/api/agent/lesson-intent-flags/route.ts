import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'

export async function GET(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const sp = request.nextUrl.searchParams
    const studentId = sp.get('student_id')
    const from = sp.get('from')
    const to = sp.get('to')
    const status = sp.get('status')

    let query = ctx.client
        .from('lesson_intent_flags')
        .select('*')

    if (studentId) query = query.eq('student_id', studentId)
    if (from) query = query.gte('target_date', from)
    if (to) query = query.lte('target_date', to)
    if (status) query = query.eq('status', status)

    query = query.order('created_at', { ascending: false })

    const { data: flags, error } = await query

    if (error) {
        return agentError(error.message, 500)
    }

    return agentOk({ flags: flags || [] })
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

    const {
        student_id: studentId,
        lesson_id: lessonId,
        target_date: targetDate,
        intent,
        source_message_id: sourceMessageId,
        source = 'agent',
        note,
    } = body ?? {}

    if (!studentId || typeof studentId !== 'string') return agentError('student_id is required', 400)
    if (!targetDate || typeof targetDate !== 'string') return agentError('target_date is required (YYYY-MM-DD)', 400)
    if (!intent || typeof intent !== 'string') return agentError('intent is required', 400)

    const allowedIntents = ['skip_requested', 'cancel_requested', 'reschedule_requested', 'schedule_requested', 'other']
    if (!allowedIntents.includes(intent)) {
        return agentError(`Invalid intent. Allowed: ${allowedIntents.join(', ')}`, 400)
    }

    const allowedSources = ['admin', 'agent', 'system']
    if (!allowedSources.includes(source)) {
        return agentError(`Invalid source. Allowed: ${allowedSources.join(', ')}`, 400)
    }

    const { data: flag, error } = await ctx.client
        .from('lesson_intent_flags')
        .insert({
            student_id: studentId,
            lesson_id: lessonId || null,
            target_date: targetDate,
            intent,
            source_message_id: sourceMessageId || null,
            source,
            note: note || null,
            status: 'active',
        })
        .select()
        .single()

    if (error) {
        return agentError(error.message, 400)
    }

    return agentOk({ flag }, 201)
}
