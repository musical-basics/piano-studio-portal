import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'
import { logLessonCore } from '@/lib/core/lessons'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const { id } = await params
    if (!id) return agentError('Missing lesson id', 400)

    let body: any
    try {
        body = await request.json()
    } catch {
        return agentError('Invalid JSON body', 400)
    }

    const notes = body?.notes ?? ''
    const videoUrl = body?.video_url
    const sheetMusicUrl = body?.sheet_music_url

    if (typeof notes !== 'string') {
        return agentError('notes must be a string', 400)
    }

    if (videoUrl !== undefined && videoUrl !== null && typeof videoUrl !== 'string') {
        return agentError('video_url must be a string when provided', 400)
    }

    if (sheetMusicUrl !== undefined && sheetMusicUrl !== null && typeof sheetMusicUrl !== 'string') {
        return agentError('sheet_music_url must be a string when provided', 400)
    }

    const result = await logLessonCore({
        client: ctx.client,
        adminId: ctx.admin.id,
        lessonId: id,
        notes,
        videoUrl: videoUrl || undefined,
        sheetMusicUrl: sheetMusicUrl || undefined,
        awaitNotifications: true,
    })

    if ('error' in result) {
        const isNotFound = result.error === 'Lesson not found'
        return agentError(result.error ?? 'Request failed', isNotFound ? 404 : 400)
    }

    return agentOk({
        success: true,
        lesson: result.lesson,
        next_lesson: result.next_lesson,
        credit_deducted: result.credit_deducted,
        previous_credits: result.previous_credits,
        new_credits: result.new_credits,
        message: result.message,
    })
}
