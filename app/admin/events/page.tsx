"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Music, Plus, Video, MapPin, Calendar, Clock, CheckCircle2, HelpCircle, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { getAdminEvents, type AdminEvent } from "@/app/actions/events"
import { CreateEventModal } from "@/components/admin/create-event-modal"

export default function EventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadEvents = async () => {
    setIsLoading(true)
    const data = await getAdminEvents()
    setEvents(data)
    setIsLoading(false)
  }

  useEffect(() => {
    loadEvents()
  }, [])

  const today = new Date().toISOString().split("T")[0]
  const upcomingEvents = events.filter((e) => e.date >= today)
  const previousEvents = events.filter((e) => e.date < today)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return {
      month: date.toLocaleString("en-US", { month: "short" }).toUpperCase(),
      day: date.getDate(),
      weekday: date.toLocaleString("en-US", { weekday: "short" }),
    }
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":")
    const h = Number.parseInt(hours)
    const ampm = h >= 12 ? "PM" : "AM"
    const hour12 = h % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  const getRsvpStats = (invites: AdminEvent["invites"]) => {
    const going = invites.filter((i) => i.status === "going").length
    const pending = invites.filter((i) => i.status === "pending").length
    const declined = invites.filter((i) => i.status === "declined").length
    return { going, pending, declined }
  }

  const EventCard = ({ event }: { event: AdminEvent }) => {
    const { month, day } = formatDate(event.date)
    const { going, pending } = getRsvpStats(event.invites)

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-0">
          <div className="flex items-stretch">
            {/* Date Column */}
            <div className="flex flex-col items-center justify-center px-6 py-4 bg-primary text-primary-foreground min-w-[100px]">
              <span className="text-xs font-medium tracking-wider">{month}</span>
              <span className="text-3xl font-serif font-bold">{day}</span>
            </div>

            {/* Content Column */}
            <div className="flex-1 p-4 flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{event.title}</h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatTime(event.start_time)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {event.location_type === "virtual" ? (
                      <>
                        <Video className="h-3.5 w-3.5" />
                        <span>Zoom</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[200px]">{event.location_address}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* RSVP Stats */}
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {going} Going
                </Badge>
                {pending > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <HelpCircle className="h-3 w-3" />
                    {pending} Pending
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const EmptyState = ({ type }: { type: "upcoming" | "previous" }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <Calendar className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-1">
        {type === "upcoming" ? "No upcoming events scheduled" : "No previous events"}
      </h3>
      <p className="text-muted-foreground text-sm max-w-sm">
        {type === "upcoming"
          ? "Create your first event to invite students to recitals, workshops, and group classes."
          : "Your past events will appear here for reference."}
      </p>
      {type === "upcoming" && (
        <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Event
        </Button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link href="/admin">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
                <Music className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-serif font-semibold">Event Management</h1>
                <p className="text-sm text-muted-foreground">Schedule and manage studio events</p>
              </div>
            </div>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="upcoming" className="gap-2">
              Upcoming
              {upcomingEvents.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">
                  {upcomingEvents.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="previous">Previous</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-0">
                      <div className="flex items-stretch">
                        <div className="w-[100px] h-[88px] bg-muted" />
                        <div className="flex-1 p-4 space-y-2">
                          <div className="h-5 bg-muted rounded w-1/3" />
                          <div className="h-4 bg-muted rounded w-1/2" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : upcomingEvents.length === 0 ? (
              <EmptyState type="upcoming" />
            ) : (
              <div className="space-y-4">
                {upcomingEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="previous" className="space-y-4">
            {previousEvents.length === 0 ? (
              <EmptyState type="previous" />
            ) : (
              <div className="space-y-4 opacity-75">
                {previousEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Create Event Modal */}
      <CreateEventModal open={showCreateModal} onOpenChange={setShowCreateModal} onEventCreated={loadEvents} />
    </div>
  )
}
