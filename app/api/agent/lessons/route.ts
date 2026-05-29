import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { listLessonsCore, scheduleLessonCore } from '@/lib/core/lessons'
import { studioToday } from '@/lib/studio-timezone'

function defaultRange() {
    const start = studioToday()
    // Default: today + 60 days in studio time
    const startDate = new Date(start + 'T00:00:00')
    const endDate = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000)
    const end = endDate.toISOString().slice(0, 10)
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

    const { student_id: studentId, date, time, duration, confirm_override } = body ?? {}
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
        confirmOverride: confirm_override === true,
    })

    if ('error' in result) {
        if (result.error === 'lesson_intent_conflict') {
            return NextResponse.json({
                error: 'lesson_intent_conflict',
                conflicts: result.conflicts
            }, { status: 409 })
        }
        return agentError(result.error ?? 'Request failed', 400)
    }

    return agentOk({ 
        lesson: result.lesson, 
        message: result.message,
        warning: result.warning,
        conflicts: result.conflicts
    }, 201)
}
