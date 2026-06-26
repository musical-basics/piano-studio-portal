import { type NextRequest, NextResponse } from 'next/server'
import { verifyAgentRequest, agentOk, agentError } from '@/lib/agent/auth'

const VALID_CATEGORIES = ['Sheet Music', 'Theory', 'Scales', 'Exercises', 'Recording']
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

/**
 * GET /api/agent/library-files?query=hanon&category=Exercises&limit=25
 *
 * Searches the studio's uploaded document library (the same files the admin UI
 * shows under Sheet Music / Exercises / Theory / Scales / Recording) and returns
 * matching files. Each result includes a ready-to-use `attachment` object that
 * can be dropped straight into `POST /messages` to send the existing file to a
 * student. No need to upload or re-host anything; library files are already
 * served from public URLs.
 *
 * Query params (all optional):
 *   - query:    case-insensitive substring match on the file title
 *   - category: one of "Sheet Music" | "Theory" | "Scales" | "Exercises" | "Recording"
 *   - limit:    max results (default 25, max 100)
 */
export async function GET(request: NextRequest) {
    const ctx = await verifyAgentRequest(request)
    if (ctx instanceof NextResponse) return ctx

    const params = request.nextUrl.searchParams
    const query = params.get('query')?.trim() || ''
    const category = params.get('category')?.trim() || ''

    if (category && !VALID_CATEGORIES.includes(category)) {
        return agentError(
            `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
            400,
        )
    }

    let limit = DEFAULT_LIMIT
    const rawLimit = params.get('limit')
    if (rawLimit) {
        const parsed = parseInt(rawLimit, 10)
        if (Number.isNaN(parsed) || parsed < 1) {
            return agentError('limit must be a positive integer', 400)
        }
        limit = Math.min(parsed, MAX_LIMIT)
    }

    let builder = ctx.client
        .from('resources')
        .select('id, title, description, category, file_url, file_type, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (category) builder = builder.eq('category', category)
    if (query) {
        // Escape PostgREST ilike wildcards so a literal query matches literally.
        const escaped = query.replace(/[%_]/g, (m) => `\\${m}`)
        builder = builder.ilike('title', `%${escaped}%`)
    }

    const { data, error } = await builder
    if (error) return agentError(error.message, 500)

    const files = (data ?? []).map((row: any) => {
        const fileType: string = row.file_type || 'pdf'
        return {
            id: row.id,
            title: row.title,
            description: row.description ?? null,
            category: row.category,
            file_type: fileType,
            url: row.file_url,
            created_at: row.created_at,
            // Ready-to-use attachment for POST /messages. Drop this object
            // straight into the `attachments` array; no edits needed.
            attachment: {
                type: fileType.includes('image') ? 'image' : 'file',
                url: row.file_url,
                name: row.title,
                size: 0,
            },
        }
    })

    return agentOk({ files, count: files.length })
}
