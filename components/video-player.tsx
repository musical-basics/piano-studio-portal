"use client"

import { useState } from "react"
import { Play, Pause } from "lucide-react"
import { Button } from "@/components/ui/button"

interface VideoPlayerProps {
  url: string
  title?: string
}

export function VideoPlayer({ url, title }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group">
      {/* Video element */}
      <video
        className="w-full h-full"
        src={url}
        controls
        controlsList="nodownload"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
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
            onClick={(e) => {
              const video = e.currentTarget.closest(".group")?.querySelector("video")
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
  )
}
