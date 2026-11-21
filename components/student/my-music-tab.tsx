"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, ExternalLink, FileMusic, FileText, Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getMyMusic } from "@/app/actions/my-music"
import { downloadAttachment } from "@/lib/download-attachment"
import type { MusicPiece, MusicSource, OtherFile } from "@/lib/my-music"
import { trackRollout } from "@/lib/rollout-track"

/** A search box only helps once the list is long. */
const SEARCH_FROM = 7

const SOURCE_LABEL: Record<MusicSource, string> = {
    library: "assigned to you",
    chat: "in Messages",
    lesson: "with your lesson",
}

function formatDay(date: string): string {
    if (!date) return ""
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    })
}

function FileActions({ url, fileName, title }: { url: string; fileName: string; title: string }) {
    const [saving, setSaving] = useState(false)
    const save = async () => {
        setSaving(true)
        trackRollout("my_music", "downloaded")
        try {
            await downloadAttachment(url, fileName)
        } finally {
            setSaving(false)
        }
    }
    return (
        <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${title}`} onClick={() => trackRollout("my_music", "opened")}>
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    Open
                </a>
            </Button>
            <Button size="sm" onClick={save} disabled={saving} aria-label={`Download ${title}`}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                Download
            </Button>
        </div>
    )
}

function PieceCard({ piece, teacherName }: { piece: MusicPiece; teacherName: string }) {
    return (
        <Card className="border-2 py-0 gap-0 hover:shadow-md transition-shadow">
            <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="h-12 w-12 shrink-0 bg-primary/10 rounded-lg flex items-center justify-center">
                        <FileMusic className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold leading-snug break-words">{piece.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Sent {formatDay(piece.sentOn)}, {SOURCE_LABEL[piece.source]}
                            {piece.timesSent > 1 && ` (sent ${piece.timesSent} times)`}
                        </p>
                        {piece.note && piece.noteKind === "instructions" && (
                            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800">
                                <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300 mb-1">
                                    {teacherName}&apos;s instructions
                                </p>
                                <p className="text-sm text-blue-900 dark:text-blue-100 whitespace-pre-wrap">{piece.note}</p>
                            </div>
                        )}
                        {piece.note && piece.noteKind !== "instructions" && (
                            <p className={`mt-1.5 text-sm text-muted-foreground line-clamp-2 ${piece.noteKind === "message" ? "italic" : ""}`}>
                                {piece.noteKind === "message" ? `"${piece.note}"` : piece.note}
                            </p>
                        )}
                    </div>
                </div>
                <FileActions url={piece.url} fileName={piece.fileName} title={piece.title} />
            </CardContent>
        </Card>
    )
}

function OtherFileRow({ file }: { file: OtherFile }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 border-t first:border-t-0">
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{file.title}</p>
                    <p className="text-xs text-muted-foreground">Sent {formatDay(file.sentOn)}</p>
                    {file.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{file.note}</p>}
                </div>
            </div>
            <FileActions url={file.url} fileName={file.fileName} title={file.title} />
        </div>
    )
}

/**
 * #1083: the family's "My music" tab. Every piece of sheet music Lionel has
 * sent (assigned from the library, attached in Messages, or attached to a
 * lesson), newest first, each listed once, so nothing gets lost in old
 * messages. It replaced the Downloads tab; library files that are not music
 * (the Zoom guide) sit under "Other files".
 */
export function MyMusicTab({ teacherName = "Your teacher" }: { teacherName?: string }) {
    const [pieces, setPieces] = useState<MusicPiece[] | null>(null)
    const [otherFiles, setOtherFiles] = useState<OtherFile[]>([])
    const [error, setError] = useState<string | null>(null)
    const [query, setQuery] = useState("")

    useEffect(() => {
        let live = true
        getMyMusic().then((res) => {
            if (!live) return
            if ("error" in res) {
                setError(res.error)
                setPieces([])
            } else {
                setPieces(res.pieces)
                setOtherFiles(res.otherFiles)
            }
        }).catch(() => {
            if (!live) return
            setError("Could not load your music. Please try again.")
            setPieces([])
        })
        return () => { live = false }
    }, [])

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!pieces || !q) return pieces ?? []
        return pieces.filter((p) => p.title.toLowerCase().includes(q) || (p.note ?? "").toLowerCase().includes(q))
    }, [pieces, query])

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-serif font-semibold">My music</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Every piece of sheet music {teacherName} has sent you, newest first.
                    </p>
                </div>
                {pieces && pieces.length > 0 && (
                    <Badge variant="secondary" className="shrink-0">
                        {pieces.length} {pieces.length === 1 ? "piece" : "pieces"}
                    </Badge>
                )}
            </div>

            {pieces === null ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading your music...
                </div>
            ) : error ? (
                <Card className="border-2">
                    <CardContent className="py-10 text-center text-sm text-destructive">{error}</CardContent>
                </Card>
            ) : pieces.length === 0 ? (
                <Card className="border-2">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FileMusic className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="font-semibold text-lg mb-2">No sheet music yet</h3>
                        <p className="text-muted-foreground max-w-sm">
                            When {teacherName} sends you a piece, in Messages or with a lesson, it will be kept here.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {pieces.length >= SEARCH_FROM && (
                        <div className="relative">
                            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value)
                                    // One "searched" per visit: typing is many keystrokes, one use.
                                    if (e.target.value.trim()) trackRollout("my_music", "searched", { once: true })
                                }}
                                placeholder="Find a piece"
                                aria-label="Find a piece"
                                className="pl-9"
                            />
                        </div>
                    )}
                    {shown.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">No piece matches &quot;{query}&quot;.</p>
                    ) : (
                        <div className="grid gap-3">
                            {shown.map((piece) => (
                                <PieceCard key={piece.key} piece={piece} teacherName={teacherName} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {otherFiles.length > 0 && (
                <Card className="border-2 py-0 gap-0">
                    <CardContent className="p-4 sm:p-5">
                        <h3 className="font-semibold mb-1">Other files</h3>
                        {otherFiles.map((file) => (
                            <OtherFileRow key={file.key} file={file} />
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
