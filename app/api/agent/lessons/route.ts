import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { listLessonsCore, scheduleLessonCore } from '@/lib/core/lessons'

function defaultRange() {
    const today = new Date()
    const start = today.toISOString().slice(0, 10)
    const end = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return { start, end }
}

export async function GET(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const sp = request.nextUrl.searchParams
    const { start, end } = defaultRange()
    const from = sp.get('from') || start
    const to = sp.get('to') || end
    const studentId = sp.get('student_id') || undefined

    const { lessons, events } = await listLessonsCore(ctx.client, from, to, studentId)
    return agentOk({ from, to, lessons, events })
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

    const { student_id: studentId, date, time, duration } = body ?? {}
    if (!studentId || typeof studentId !== 'string') return agentError('student_id is required', 400)
    if (!date || typeof date !== 'string') return agentError('date is required (YYYY-MM-DD)', 400)
    if (!time || typeof time !== 'string') return agentError('time is required (HH:MM 24h)', 400)

    const parsedDuration = typeof duration === 'number' ? duration : 60

    const result = await scheduleLessonCore({
        client: ctx.client,
        adminId: ctx.admin.id,
        studentId,
        date,
        time,
        duration: parsedDuration,
    })

    if ('error' in result) return agentError(result.error ?? 'Request failed', 400)
    return agentOk({ lesson: result.lesson, message: result.message }, 201)
}
