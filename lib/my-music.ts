/**
 * "My music" (#1083): every piece of sheet music Lionel has sent a family, in
 * one list, newest first, so nothing gets lost in old messages.
 *
 * Pieces reach a family three ways:
 *   - assigned from the library (resource_assignments, with an optional note),
 *   - attached to a chat message from Lionel (messages.attachments),
 *   - attached to a logged lesson (lessons.sheet_music_url).
 *
 * This file holds the pure rules (what counts as sheet music, how a file name
 * becomes a title, how repeats collapse); app/actions/my-music.ts reads the rows.
 */

export type MusicSource = 'library' | 'chat' | 'lesson'

/**
 * What the note beside a piece is: Lionel's per-assignment instructions, the
 * text of the chat message it came in, or the library file's description.
 */
export type NoteKind = 'instructions' | 'message' | 'description'

/** One piece as the family sees it. */
export type MusicPiece = {
    key: string
    title: string
    url: string
    /** File name to save the download under. */
    fileName: string
    /** Studio date it was last sent (YYYY-MM-DD). */
    sentOn: string
    source: MusicSource
    /** Short text that came with it (see NoteKind). Instructions win over the rest. */
    note: string | null
    noteKind: NoteKind | null
    /** How many times it was sent (the list shows it once). */
    timesSent: number
}

/** Library files that are not sheet music (the Zoom setup guide, say). */
export type OtherFile = {
    key: string
    title: string
    url: string
    fileName: string
    sentOn: string
    note: string | null
}

/** One send of one file, before repeats are merged. */
export type MusicCandidate = {
    title: string
    url: string
    /** Sort key: the instant it was sent. */
    sentAt: string
    sentOn: string
    source: MusicSource
    note: string | null
    noteKind: NoteKind | null
}

/** Chat puts this in the body when a message is only files. */
export const ATTACHMENT_PLACEHOLDER = '📎 Attachment'

const NOTE_MAX = 280

/**
 * Files Lionel sends that are not pieces: the Zoom setup guide and the
 * performance tips sheet. Matched on the title.
 */
const NOT_SHEET_MUSIC = /\b(zoom|setup|tips)\b/i

/** Hosts whose links cannot open: placeholders and an expiring file drop. */
const DEAD_HOSTS = new Set(['example.com', 'example.org', 'example.net', 'litter.catbox.moe'])

function pathOf(url: string): string {
    try {
        return decodeURIComponent(new URL(url).pathname)
    } catch {
        return ''
    }
}

/** Pieces go out as their original PDF, so a PDF is what counts (images, MusicXML and Word files do not). */
export function isPdf(url: string, name?: string | null): boolean {
    return /\.pdf$/i.test(pathOf(url)) || /\.pdf$/i.test((name ?? '').trim())
}

export function isSheetMusicTitle(title: string): boolean {
    return !NOT_SHEET_MUSIC.test(title)
}

/**
 * Whether a stored link can still open. Old rows point at a retired storage
 * project (any other *.supabase.co host) or at placeholder and expired hosts.
 */
export function isOpenableUrl(url: string, storageHost: string): boolean {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return false
    }
    if (parsed.protocol !== 'https:') return false
    const host = parsed.host.toLowerCase()
    if (DEAD_HOSTS.has(host)) return false
    if (host.endsWith('.supabase.co') && host !== storageHost.toLowerCase()) return false
    return true
}

/**
 * A readable title from a stored name or URL: no folder, no upload timestamp,
 * no ".pdf", no underscores, no " - Full Score" export suffix.
 * "1768799397219_Hanon_Exercise_Num_1_-_Full_Score.pdf" -> "Hanon Exercise Num 1".
 */
export function cleanTitle(raw: string): string {
    let t = raw.split('/').pop() ?? raw
    t = t.replace(/^\d{10,}_/, '')
    t = t.replace(/\.pdf$/i, '')
    t = t.replace(/_+/g, ' ')
    // A word with two or more hyphens is a slug ("someone-like-you"); a single
    // hyphen ("K-545") is kept.
    t = t.split(' ').map((w) => (/^[^-]+(-[^-]+){2,}$/.test(w) ? w.replace(/-/g, ' ') : w)).join(' ')
    t = t.replace(/\s+-\s+full score\s*$/i, '')
    t = t.replace(/\s+pdf\s*$/i, '')
    t = t.replace(/\s+/g, ' ').trim()
    // All-lowercase slugs read better with capitals.
    if (t && t === t.toLowerCase()) {
        t = t.replace(/\b[a-z]/g, (c) => c.toUpperCase())
    }
    return t || 'Sheet music'
}

/** Short message text to show beside a piece; null for the files-only placeholder. */
export function shortNote(text: string | null | undefined): string | null {
    const t = (text ?? '').trim()
    if (!t || t === ATTACHMENT_PLACEHOLDER) return null
    return t.length > NOTE_MAX ? `${t.slice(0, NOTE_MAX - 3).trimEnd()}...` : t
}

/** The save-as name: the clean title plus .pdf. */
export function downloadName(title: string): string {
    return `${title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet music'}.pdf`
}

function urlKey(url: string): string {
    try {
        const u = new URL(url)
        return `${u.host.toLowerCase()}${decodeURIComponent(u.pathname)}`
    } catch {
        return url
    }
}

function titleKey(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Library titles are the ones Lionel typed, so they win over file names. */
const TITLE_RANK: Record<MusicSource, number> = { library: 0, chat: 1, lesson: 2 }

/**
 * Collapse repeats and sort newest first. The same file (same link), or the
 * same piece uploaded again under the same name, shows once with the date and
 * link of its latest send. Lionel's assignment instructions beat message text.
 */
export function mergePieces(candidates: MusicCandidate[]): MusicPiece[] {
    const newestFirst = [...candidates].sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    const pieces: (MusicPiece & { titleRank: number })[] = []
    const byUrl = new Map<string, number>()
    const byTitle = new Map<string, number>()

    for (const c of newestFirst) {
        const uk = urlKey(c.url)
        const tk = titleKey(c.title)
        const found = byUrl.get(uk) ?? (tk ? byTitle.get(tk) : undefined)

        if (found === undefined) {
            const index = pieces.length
            pieces.push({
                key: uk,
                title: c.title,
                url: c.url,
                fileName: downloadName(c.title),
                sentOn: c.sentOn,
                source: c.source,
                note: c.note,
                noteKind: c.note ? c.noteKind : null,
                timesSent: 1,
                titleRank: TITLE_RANK[c.source],
            })
            byUrl.set(uk, index)
            if (tk) byTitle.set(tk, index)
            continue
        }

        // An older send of a piece already listed.
        const p = pieces[found]
        p.timesSent += 1
        byUrl.set(uk, found)
        if (tk && !byTitle.has(tk)) byTitle.set(tk, found)
        if (TITLE_RANK[c.source] < p.titleRank) {
            p.title = c.title
            p.fileName = downloadName(c.title)
            p.titleRank = TITLE_RANK[c.source]
        }
        if (c.note && c.noteKind === 'instructions' && p.noteKind !== 'instructions') {
            p.note = c.note
            p.noteKind = 'instructions'
        } else if (c.note && !p.note) {
            p.note = c.note
            p.noteKind = c.noteKind
        }
    }

    return pieces.map(({ titleRank: _rank, ...piece }) => piece)
}
