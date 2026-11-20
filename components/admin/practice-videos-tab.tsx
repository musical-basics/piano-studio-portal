"use client"

import { useEffect, useState } from "react"
import { Loader2, Play, Send, Video, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
    commentOnPracticeVideo,
    getPracticeVideoUrl,
    listPracticeVideosForAdmin,
    markPracticeVideoWatched,
    type AdminPracticeVideo,
} from "@/app/actions/practice-videos"
import { StudentLink } from "@/components/admin/student-panel"

function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        timeZone: "America/New_York", timeZoneName: "short",
    })
}

function formatLength(s: number | null): string {
    if (!s) return ""
    return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`
}

/**
 * #875: practice videos students uploaded, newest first. Play one in place;
 * a comment is saved on the video and sent to that family's portal chat
 * (the usual email notice), starting "About your practice video from <day>:".
 */
export function PracticeVideosTab({ onWaitingChange }: { onWaitingChange?: (n: number) => void }) {
    const { toast } = useToast()
    const [videos, setVideos] = useState<AdminPracticeVideo[] | null>(null)
    const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [busyId, setBusyId] = useState<string | null>(null)

    const load = async () => {
        const res = await listPracticeVideosForAdmin()
        if ("error" in res) {
            toast({ variant: "destructive", title: "Could not load practice videos", description: res.error })
            setVideos([])
            return
        }
        setVideos(res.videos)
        onWaitingChange?.(res.videos.filter((v) => !v.comment).length)
    }
    useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const play = async (v: AdminPracticeVideo) => {
        if (playing?.id === v.id) { setPlaying(null); return }
        setBusyId(v.id)
        const res = await getPracticeVideoUrl(v.id)
        setBusyId(null)
        if ("error" in res) {
            toast({ variant: "destructive", title: "Could not play it", description: res.error })
            return
        }
        setPlaying({ id: v.id, url: res.url })
        if (!v.watched_at) {
            markPracticeVideoWatched(v.id)
            setVideos((list) => list?.map((x) => (x.id === v.id ? { ...x, watched_at: new Date().toISOString() } : x)) ?? null)
        }
    }

    const send = async (v: AdminPracticeVideo) => {
        const text = (drafts[v.id] || "").trim()
        if (!text) return
        if (!window.confirm(`Send this comment to ${v.student_name}'s portal chat (1 family, the usual email notice)?`)) return
        setBusyId(v.id)
        const res = await commentOnPracticeVideo(v.id, text)
        setBusyId(null)
        if ("error" in res) {
            toast({ variant: "destructive", title: "Not sent", description: res.error })
            return
        }
        toast({ title: "Sent", description: `${v.student_name} got your comment in their portal chat.` })
        setDrafts((d) => ({ ...d, [v.id]: "" }))
        await load()
    }

    if (videos === null) {
        return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-serif font-semibold">Practice videos</h2>
                <p className="text-sm text-muted-foreground">
                    Short videos students upload between lessons. Your comment goes to their portal chat.
                </p>
            </div>
            {videos.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground">No practice videos yet.</CardContent></Card>
            ) : (
                videos.map((v) => (
                    <Card key={v.id} className={v.comment ? "" : "border-primary/40"}>
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-semibold flex items-center gap-2">
                                        <Video className="h-4 w-4 text-primary shrink-0" />
                                        <StudentLink id={v.student_id} name={v.student_name} />
                                        {!v.comment && <Badge variant="destructive" className="text-[10px]">New</Badge>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatWhen(v.created_at)}{v.duration_seconds ? ` · ${formatLength(v.duration_seconds)}` : ""}
                                        {v.watched_at && !v.comment ? " · watched" : ""}
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => play(v)} disabled={busyId === v.id}>
                                    {busyId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                    {playing?.id === v.id ? "Hide" : "Play"}
                                </Button>
                            </div>
                            {v.note && <p className="text-sm"><span className="text-muted-foreground">They wrote:</span> {v.note}</p>}
                            {playing?.id === v.id && (
                                <video src={playing.url} controls autoPlay playsInline className="w-full rounded-lg bg-black max-h-[60vh]" />
                            )}
                            {v.comment ? (
                                <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                                    <p className="whitespace-pre-wrap">{v.comment}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Textarea
                                        rows={3}
                                        value={drafts[v.id] || ""}
                                        onChange={(e) => setDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                                        placeholder="Your comment (goes to their portal chat)"
                                        maxLength={4000}
                                    />
                                    <Button size="sm" className="gap-1" onClick={() => send(v)} disabled={busyId === v.id || !(drafts[v.id] || "").trim()}>
                                        <Send className="h-3.5 w-3.5" />
                                        Send comment
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
    )
}
