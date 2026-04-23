import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

// Self-documenting discovery endpoint.
// Any agent that GETs /api/agent (no auth) receives the full API reference as
// markdown. The doc is the single source of truth: update docs/agent-api.md,
// push, and the next deploy serves the new version.
export const dynamic = 'force-dynamic'

const FALLBACK = `# Agent API

Discovery endpoint is online, but the reference doc could not be loaded at runtime.

Auth: \`Authorization: Bearer <AGENT_API_SECRET>\`
Base: this URL's parent path (\`/api/agent\`)

Core endpoints:
- GET /students
- GET /students/:id
- PATCH /students/:id           body: { status: "active" | "inactive" }
- POST /students/:id/credits    body: { delta: integer } or { set: integer >= 0 }
- GET /threads
- GET /messages?student_id=<uuid>
- POST /messages                body: { student_id, content, attachments? }
- POST /messages/mark-read      body: { student_id }
- GET /lessons?from=&to=&student_id=
- POST /lessons                 body: { student_id, date, time, duration? }
- PATCH /lessons/:id            body: { date, time, duration? }
- DELETE /lessons/:id
`

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'docs', 'agent-api.md')
        const markdown = await fs.readFile(filePath, 'utf-8')
        return new NextResponse(markdown, {
            status: 200,
            headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
                'Cache-Control': 'public, max-age=60, s-maxage=60',
            },
        })
    } catch (err) {
        console.error('Agent docs read failed:', err)
        return new NextResponse(FALLBACK, {
            status: 200,
            headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
                'X-Fallback': 'true',
            },
        })
    }
}
