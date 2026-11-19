"use client"

import { useRef, useState } from "react"
import { Play, Pause, Bookmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RecordingMarker } from "@/lib/recording-markers"

interface VideoPlayerProps {
  url: string
  title?: string
  /** Moments Lionel marked during the lesson (#874); tapping one jumps there. */
  markers?: RecordingMarker[]
}

/** Seconds of lead-in before a marked moment: he taps just after it happens. */
const MARKER_LEAD_IN_S = 5

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatMarkerTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  const mmss = `${h ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`
  return h ? `${h}:${mmss}` : mmss
}

/**
 * Convert Dropbox share URLs to direct-streaming URLs.
 * Share links (dl=0) serve an HTML preview; we need a raw binary stream.
 */
function toDirectUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.includes('dropbox.com')) {
      // Switch to the direct-content host and force raw download
      u.hostname = 'dl.dropboxusercontent.com'
      u.searchParams.set('raw', '1')
      u.searchParams.delete('dl')
      return u.toString()
    }
  } catch {
    // Not a valid URL – fall through
  }
  return url
}

export function VideoPlayer({ url, title, markers = [] }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const videoSrc = toDirectUrl(url)

  const jumpTo = (offsetSeconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, offsetSeconds - MARKER_LEAD_IN_S)
    video.play().catch(() => { /* autoplay refused: the position is still set */ })
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group">
        {/* Video element */}
        <video
          ref={videoRef}
          className="w-full h-full"
          src={videoSrc}
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        >
          <track kind="captions" />
        </video>

        {/* Custom overlay controls */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 pointer-events-auto">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => {
                const video = videoRef.current
                if (video) {
                  isPlaying ? video.pause() : video.play()
                }
              }}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            {title && <span className="text-sm text-white font-medium">{title}</span>}
          </div>
        </div>
      </div>

      {markers.length > 0 && (
        <div className="space-y-2" data-testid="lesson-markers">
          {/* Where each mark falls in the lesson, once the video's length is known */}
          {duration > 0 && (
            <div className="relative h-2 rounded-full bg-muted" aria-hidden>
              {markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  tabIndex={-1}
                  title={`${formatMarkerTime(m.offset_seconds)}${m.label ? ` ${m.label}` : ""}`}
                  onClick={() => jumpTo(m.offset_seconds)}
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background hover:scale-125 transition-transform"
                  style={{ left: `${Math.min(100, (m.offset_seconds / duration) * 100)}%` }}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Moments marked in this lesson, tap one to jump there:</p>
          <div className="flex flex-wrap gap-2">
            {markers.map((m) => (
              <Button
                key={m.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => jumpTo(m.offset_seconds)}
              >
                <Bookmark className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono">{formatMarkerTime(m.offset_seconds)}</span>
                {m.label && <span className="text-muted-foreground">{m.label}</span>}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
