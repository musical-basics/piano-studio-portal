import type { DbClient } from '@/lib/supabase/admin'
import { isoToStudioWallClock, studioWallClockToISO } from '@/lib/studio-timezone'
import {
    cleanTitle,
    downloadName,
    isOpenableUrl,
    isPdf,
    isSheetMusicTitle,
    mergePieces,
    shortNote,
    type MusicCandidate,
    type MusicPiece,
    type OtherFile,
} from '@/lib/my-music'

export type FamilyMusic = { pieces: MusicPiece[]; otherFiles: OtherFile[] }

type ResourceRow = {
    title: string | null
    description: string | null
    category: string | null
    file_url: string | null
}

type AssignmentRow = {
    notes: string | null
    created_at: string
    resource: ResourceRow | ResourceRow[] | null
}

type MessageRow = {
    content: string | null
    created_at: string
    attachments: { type?: string; url?: string; name?: string }[] | null
}

type LessonRow = { date: string; time: string | null; sheet_music_url: string | null }

function storageHostFromEnv(): string {
    try {
        return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host
    } catch {
        return ''
    }
}

/**
 * Everything Lionel has sent one student that is sheet music, newest first
 * (#1083). Reads with the service client, so the caller must already have
 * checked who is asking: only files sent TO this student by an admin account
 * are read, never files the family uploaded and never another family's.
 */
export async function loadFamilyMusic(
    db: DbClient,
    studentId: string,
    storageHost: string = storageHostFromEnv(),
): Promise<FamilyMusic> {
    const { data: admins, error: adminError } = await db.from('profiles').select('id').eq('role', 'admin')
    if (adminError) throw new Error(`admins: ${adminError.message}`)
    const adminIds = (admins ?? []).map((a: { id: string }) => a.id)

    const [assignmentsRes, messagesRes, lessonsRes] = await Promise.all([
        db.from('resource_assignments')
            .select('notes, created_at, resource:resources(title, description, category, file_url)')
            .eq('student_id', studentId),
        adminIds.length === 0
            ? Promise.resolve({ data: [] as MessageRow[], error: null })
            : db.from('messages')
                .select('content, created_at, attachments')
                .eq('recipient_id', studentId)
                .in('sender_id', adminIds)
                .is('deleted_at', null)
                .not('attachments', 'is', null)
                .order('created_at', { ascending: false })
                .limit(2000),
        db.from('lessons')
            .select('date, time, sheet_music_url')
            .eq('student_id', studentId)
            .not('sheet_music_url', 'is', null),
    ])
    if (assignmentsRes.error) throw new Error(`assignments: ${assignmentsRes.error.message}`)
    if (messagesRes.error) throw new Error(`messages: ${messagesRes.error.message}`)
    if (lessonsRes.error) throw new Error(`lessons: ${lessonsRes.error.message}`)

    const candidates: MusicCandidate[] = []
    const others = new Map<string, OtherFile & { sentAt: string }>()

    // Library assignments. A non-music file (the Zoom guide) goes under "Other
    // files" so nothing the old Downloads tab listed disappears.
    for (const row of (assignmentsRes.data ?? []) as AssignmentRow[]) {
        const resource = Array.isArray(row.resource) ? row.resource[0] : row.resource
        const url = resource?.file_url
        if (!resource || !url || !isOpenableUrl(url, storageHost)) continue
        const title = cleanTitle(resource.title || url)
        const sentOn = isoToStudioWallClock(row.created_at).localDate
        const instructions = shortNote(row.notes)
        const isMusic = isPdf(url) && resource.category !== 'Recording' && isSheetMusicTitle(title)
        if (!isMusic) {
            const existing = others.get(url)
            if (!existing || existing.sentAt < row.created_at) {
                others.set(url, {
                    key: url, title, url, fileName: downloadName(title), sentOn, sentAt: row.created_at,
                    note: instructions ?? shortNote(resource.description),
                })
            }
            continue
        }
        candidates.push({
            title, url, sentAt: row.created_at, sentOn, source: 'library',
            note: instructions ?? shortNote(resource.description),
            noteKind: instructions ? 'instructions' : resource.description ? 'description' : null,
        })
    }

    // PDFs attached to Lionel's chat messages.
    for (const m of (messagesRes.data ?? []) as MessageRow[]) {
        const sentOn = isoToStudioWallClock(m.created_at).localDate
        const text = shortNote(m.content)
        for (const a of m.attachments ?? []) {
            if (!a?.url || a.type === 'image' || !isPdf(a.url, a.name)) continue
            if (!isOpenableUrl(a.url, storageHost)) continue
            const title = cleanTitle(a.name || a.url)
            if (!isSheetMusicTitle(title)) continue
            candidates.push({ title, url: a.url, sentAt: m.created_at, sentOn, source: 'chat', note: text, noteKind: text ? 'message' : null })
        }
    }

    // Sheet music attached to a logged lesson.
    for (const l of (lessonsRes.data ?? []) as LessonRow[]) {
        const url = l.sheet_music_url
        if (!url || !isPdf(url) || !isOpenableUrl(url, storageHost)) continue
        const title = cleanTitle(decodeURIComponent(url.split('?')[0]))
        if (!isSheetMusicTitle(title)) continue
        const time = (l.time || '12:00').slice(0, 5)
        candidates.push({
            title, url, sentAt: studioWallClockToISO(l.date, time), sentOn: l.date, source: 'lesson',
            note: null, noteKind: null,
        })
    }

    const otherFiles = [...others.values()]
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
        .map(({ sentAt: _sentAt, ...file }) => file)

    return { pieces: mergePieces(candidates), otherFiles }
}
