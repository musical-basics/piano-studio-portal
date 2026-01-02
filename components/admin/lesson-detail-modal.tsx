"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Calendar, Clock, Download, Music } from "lucide-react"
import { VideoPlayer } from "@/components/video-player"
import type { Lesson } from "@/lib/mock-data"

interface LessonDetailModalProps {
  lesson: Lesson
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LessonDetailModal({ lesson, open, onOpenChange }: LessonDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Lesson Details</DialogTitle>
          <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{lesson.date}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{lesson.time}</span>
            </div>
            <div className="flex items-center gap-1">
              <Music className="h-4 w-4" />
              <span>{lesson.duration} minutes</span>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Teacher Notes */}
          {lesson.teacher_notes && (
            <div>
              <h3 className="font-semibold text-lg mb-3 font-serif">Teacher Notes</h3>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm leading-relaxed whitespace-pre-line">{lesson.teacher_notes}</p>
              </div>
            </div>
          )}

          {/* Homework */}
          {lesson.homework && (
            <div>
              <h3 className="font-semibold text-lg mb-3 font-serif">Homework</h3>
              <div className="bg-accent p-4 rounded-lg border-l-4 border-primary">
                <p className="text-sm leading-relaxed">{lesson.homework}</p>
              </div>
            </div>
          )}

          <Separator />

          {/* Lesson Video */}
          {lesson.video_url && (
            <div>
              <h3 className="font-semibold text-lg mb-3 font-serif">Lesson Recording</h3>
              <VideoPlayer url={lesson.video_url} title={`Lesson - ${lesson.date}`} />
            </div>
          )}

          {/* Sheet Music */}
          {lesson.sheet_music_url && (
            <div>
              <h3 className="font-semibold text-lg mb-3 font-serif">Sheet Music</h3>
              <Button variant="outline" className="w-full bg-transparent" asChild>
                <a href={lesson.sheet_music_url} download>
                  <Download className="h-4 w-4 mr-2" />
                  Download Sheet Music (PDF)
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
