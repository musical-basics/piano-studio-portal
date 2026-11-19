"use client"

import { useEffect, useRef, useState } from "react"
import { Upload, Video, Loader2, Trash2, MessageCircle, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import {
    deleteMyPracticeVideo,
    finishPracticeUpload,
    getPracticeVideoUrl,
    listMyPracticeVideos,
    startPracticeUpload,
    type PracticeVideo,
} from "@/app/actions/practice-videos"

const MAX_BYTES = 1024 * 1024 * 1024
const MAX_SECONDS = 6 * 60

/** The video's length from its metadata, or null when the browser can't read it (e.g. HEVC). */
function readDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file)
        const v = document.createElement("video")
        const done = (d: number | null) => { URL.revokeObjectURL(url); resolve(d) }
        v.preload = "metadata"
        v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null)
        v.onerror = () => done(null)
        setTimeout(() => done(null), 8000)
        v.src = url
    })
}

/** PUT straight to storage with progress (fetch has no upload progress). */
function putWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", url)
        xhr.setRequestHeader("Content-Type", contentType)
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)))
        xhr.onerror = () => reject(new Error("the connection dropped"))
        xhr.send(file)
    })
}

function formatLength(s: number | null): string {
    if (!s) return ""
    return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`
}

function formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

/**
 * #875: the student's Practice tab. Upload a short video (phone or computer,
 * about 5 minutes); Lionel watches it and his comment shows here (and arrives as
 * a portal message).
 */
export function PracticeTab() {
    const { toast } = useToast()
    const fileInput = useRef<HTMLInputElement>(null)
    const [videos, setVideos] = useState<PracticeVideo[] | null>(null)
    const [file, setFile] = useState<File | null>(null)
    const [duration, setDuration] = useState<number | null>(null)
    const [note, setNote] = useState("")
    const [progress, setProgress] = useState<number | null>(null)
    const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)

    const load = async () => {
        const res = await listMyPracticeVideos()
        if ("error" in res) {
            toast({ variant: "destructive", title: "Could not load", description: res.error })
            setVideos([])
        } else {
            setVideos(res.videos)
        }
    }
    useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const choose = async (f: File | undefined) => {
        if (!f) return
        if (f.size > MAX_BYTES) {
            toast({ variant: "destructive", title: "That video is too big", description: "Please trim it to about 5 minutes (under 1 GB)." })
            return
        }
        const d = await readDuration(f)
        if (d && d > MAX_SECONDS) {
            toast({ variant: "destructive", title: "That video is too long", description: "Please keep practice videos to about 5 minutes." })
            return
        }
        setFile(f)
        setDuration(d)
    }

    const upload = async () => {
        if (!file) return
        setProgress(0)
        try {
            const start = await startPracticeUpload({
                fileName: file.name,
                contentType: file.type,
                sizeBytes: file.size,
                durationSeconds: duration,
                note,
            })
            if ("error" in start) throw new Error(start.error)
            await putWithProgress(start.uploadUrl, file, start.contentType, setProgress)
            const done = await finishPracticeUpload(start.id)
            if ("error" in done) throw new Error(done.error)
            toast({ title: "Uploaded!", description: "Lionel will watch it and leave you a comment." })
            setFile(null)
            setNote("")
            if (fileInput.current) fileInput.current.value = ""
            await load()
        } catch (e) {
            toast({ variant: "destructive", title: "Upload failed", description: e instanceof Error ? e.message : "Please try again." })
        } finally {
            setProgress(null)
        }
    }

    const play = async (id: string) => {
        if (playing?.id === id) { setPlaying(null); return }
        setBusyId(id)
        const res = await getPracticeVideoUrl(id)
        setBusyId(null)
        if ("error" in res) toast({ variant: "destructive", title: "Could not play it", description: res.error })
        else setPlaying({ id, url: res.url })
    }

    const remove = async (id: string) => {
        if (!window.confirm("Delete this practice video?")) return
        setBusyId(id)
        const res = await deleteMyPracticeVideo(id)
        setBusyId(null)
        if ("error" in res) toast({ variant: "destructive", title: "Not deleted", description: res.error })
        else {
            if (playing?.id === id) setPlaying(null)
            await load()
        }
    }

    const uploading = progress !== null

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-serif font-semibold">Practice Videos</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Send Lionel a short video of your practice (about 5 minutes) and he&apos;ll watch it and leave you a comment.
                </p>
            </div>

            <Card className="border-2 border-dashed">
                <CardContent className="p-6 space-y-4">
                    <input
                        ref={fileInput}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        data-testid="practice-file"
                        onChange={(e) => choose(e.target.files?.[0])}
                    />
                    {!file ? (
                        <Button onClick={() => fileInput.current?.click()} className="w-full sm:w-auto gap-2" size="lg">
                            <Upload className="h-4 w-4" />
                            Upload a practice video
                        </Button>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm">
                                <Video className="h-4 w-4 text-primary shrink-0" />
                                <span className="font-medium truncate">{file.name}</span>
                                <span className="text-muted-foreground shrink-0">
                                    {formatLength(duration)}{duration ? ", " : ""}{(file.size / 1024 / 1024).toFixed(0)} MB
                                </span>
                            </div>
                            <Textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={500}
                                placeholder="Anything Lionel should listen for? (optional)"
                                rows={2}
                                disabled={uploading}
                            />
                            {uploading && (
                                <div className="space-y-1">
                                    <Progress value={progress ?? 0} />
                                    <p className="text-xs text-muted-foreground">Uploading... {progress}% (keep this page open)</p>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <Button onClick={upload} disabled={uploading} className="gap-2">
                                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    Send to Lionel
                                </Button>
                                <Button
                                    variant="ghost"
                                    disabled={uploading}
                                    onClick={() => { setFile(null); setNote(""); if (fileInput.current) fileInput.current.value = "" }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        On a phone you can record right away or pick a video you already have. Only you and Lionel can see these.
                    </p>
                </CardContent>
            </Card>

            {videos === null ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No practice videos yet.</p>
            ) : (
                <div className="grid gap-3">
                    {videos.map((v) => (
                        <Card key={v.id} data-testid="practice-video">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-medium">Practice video, {formatDay(v.created_at)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatLength(v.duration_seconds)}
                                            {v.comment ? " · Lionel commented" : v.watched_at ? " · Lionel watched it" : " · waiting for Lionel"}
                                        </p>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <Button variant="outline" size="sm" className="gap-1" onClick={() => play(v.id)} disabled={busyId === v.id}>
                                            {busyId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                            {playing?.id === v.id ? "Hide" : "Play"}
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => remove(v.id)} disabled={busyId === v.id} title="Delete">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                {v.note && <p className="text-sm text-muted-foreground">You wrote: {v.note}</p>}
                                {playing?.id === v.id && (
                                    <video src={playing.url} controls autoPlay playsInline className="w-full rounded-lg bg-black max-h-[60vh]" />
                                )}
                                {v.comment && (
                                    <div className="flex gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
                                        <MessageCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                        <p className="text-sm whitespace-pre-wrap">{v.comment}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
