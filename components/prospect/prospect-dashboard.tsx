"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessagesPanel } from "@/components/student/messages-panel"
import { logout } from "@/app/login/actions"
import { Music, FileText, Video, Calendar, Clock, MapPin, LogOut, ExternalLink } from "lucide-react"
import type { StudentEvent } from "@/app/actions/events"

interface ProspectProfile {
  id: string
  name: string | null
  email: string | null
}

interface ProspectDashboardProps {
  profile: ProspectProfile
  events: StudentEvent[]
  studioName: string
  teacherName: string
}

// The two setup guides live in /public. One is Zoom-only, the other is the
// fuller online-lessons guide that also covers camera angles.
const SETUP_GUIDES = [
  {
    title: "Online Lessons Setup (Full Guide)",
    description: "Everything you need: Zoom, audio, and camera angles for piano lessons.",
    href: "/online-lessons-setup.pdf",
    icon: Video,
  },
  {
    title: "Zoom Setup (Quick Guide)",
    description: "Just the essentials for getting Zoom installed and ready.",
    href: "/zoom-setup.pdf",
    icon: FileText,
  },
]

function formatEventDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD; render in the viewer's locale without TZ shifting.
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
}

function formatEventTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number)
  const ampm = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${displayHours}:${(minutes || 0).toString().padStart(2, "0")} ${ampm}`
}

export function ProspectDashboard({ profile, events, studioName, teacherName }: ProspectDashboardProps) {
  const firstName = (profile.name || "there").split(" ")[0]

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-primary rounded-full flex items-center justify-center">
              <Music className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-serif text-lg leading-tight">{studioName}</p>
              <p className="text-xs text-muted-foreground">Prospective Student</p>
            </div>
          </div>
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="font-serif text-3xl">Welcome, {firstName}!</h1>
          <p className="text-muted-foreground mt-1">
            Let's get you ready for your audition with {teacherName}. Review the setup guides below, check your meeting
            time, and message your teacher any time.
          </p>
        </div>

        {/* Setup guides */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Prepare for your audition</CardTitle>
            <CardDescription>Set up Zoom and your camera before your meeting.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {SETUP_GUIDES.map((guide) => {
              const Icon = guide.icon
              return (
                <a
                  key={guide.href}
                  href={guide.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:border-primary hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="font-medium">{guide.title}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-sm text-muted-foreground">{guide.description}</p>
                </a>
              )
            })}
          </CardContent>
        </Card>

        {/* Audition times */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Your audition</CardTitle>
            <CardDescription>Meeting times your teacher has scheduled with you.</CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No audition scheduled yet.</p>
                <p className="text-sm text-muted-foreground">
                  Your teacher will set a time soon. You can ask about it in the chat below.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{event.title}</p>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary">{event.location_type === "virtual" ? "Online" : "In person"}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatEventDate(event.date)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {formatEventTime(event.start_time)}
                      </span>
                      {event.location_type === "physical" && event.location_address && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {event.location_address}
                        </span>
                      )}
                    </div>
                    {event.location_type === "virtual" && event.zoom_link && (
                      <Button asChild className="mt-4">
                        <a href={event.zoom_link} target="_blank" rel="noopener noreferrer">
                          <Video className="h-4 w-4 mr-2" />
                          Join Zoom
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat */}
        <div>
          <h2 className="font-serif text-xl mb-3">Message {teacherName}</h2>
          <MessagesPanel studentId={profile.id} teacherName={teacherName} />
        </div>
      </main>
    </div>
  )
}
