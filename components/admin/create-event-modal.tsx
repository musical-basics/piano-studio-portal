"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Video, MapPin, Sparkles, Users } from "lucide-react"
import { getActiveStudents, createEvent, updateEvent, type CreateEventInput, type AdminEvent } from "@/app/actions/events"

// Helper to extract LOCAL date and time from an ISO string
const getLocalDateTime = (isoString: string) => {
  const date = new Date(isoString); // Creates a date object in User's Local Time (PST)

  // Manually build YYYY-MM-DD using local methods
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const localDate = `${year}-${month}-${day}`;

  // Manually build HH:mm using local methods
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const localTime = `${hours}:${minutes}`;

  return { localDate, localTime };
};

type Student = {
  id: string
  name: string
  email: string
}

type CreateEventModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEventCreated?: () => void
  eventToEdit?: AdminEvent | null
}

export function CreateEventModal({ open, onOpenChange, onEventCreated, eventToEdit }: CreateEventModalProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [isLoadingStudents, setIsLoadingStudents] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [duration, setDuration] = useState("60")
  const [locationType, setLocationType] = useState<"virtual" | "physical">("virtual")
  const [locationAddress, setLocationAddress] = useState("")
  const [rsvpDeadline, setRsvpDeadline] = useState("")
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setIsLoadingStudents(true)
      getActiveStudents().then((data) => {
        setStudents(data)
        setIsLoadingStudents(false)
      })

      if (eventToEdit) {
        setTitle(eventToEdit.title)
        setDescription(eventToEdit.description)

        // --- THE FIX: Convert UTC timestamp to Local Time before setting state ---
        const { localDate, localTime } = getLocalDateTime(eventToEdit.start_time || `${eventToEdit.date}T${eventToEdit.start_time}`)

        setDate(localDate)
        setStartTime(localTime)
        // ------------------------------------------------------------------------

        setDuration(eventToEdit.duration_minutes.toString())
        setLocationType(eventToEdit.location_type)
        setLocationAddress(eventToEdit.location_address || "")

        if (eventToEdit.rsvp_deadline) {
          const { localDate: rsvpDate } = getLocalDateTime(eventToEdit.rsvp_deadline)
          setRsvpDeadline(rsvpDate)
        } else {
          setRsvpDeadline("")
        }
        // Invitees
        const invitedIds = eventToEdit.invites.map(i => i.student_id)
        setSelectedStudents(invitedIds)
      } else {
        resetForm()
      }
    }
  }, [open, eventToEdit])

  const handleSelectAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([])
    } else {
      setSelectedStudents(students.map((s) => s.id))
    }
  }

  const toggleStudent = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    )
  }

  const resetForm = () => {
    setTitle("")
    setDescription("")
    setDate("")
    setStartTime("")
    setDuration("60")
    setLocationType("virtual")
    setLocationAddress("")
    setRsvpDeadline("")
    setSelectedStudents([])
  }

  const handleSubmit = async () => {
    if (!title || !date || !startTime || !rsvpDeadline || selectedStudents.length === 0) {
      return
    }

    setIsSubmitting(true)

    const input: CreateEventInput = {
      title,
      description,
      date,
      start_time: startTime,
      duration_minutes: Number.parseInt(duration),
      location_type: locationType,
      location_address: locationType === "physical" ? locationAddress : undefined,
      rsvp_deadline: rsvpDeadline,
      invited_student_ids: selectedStudents,
    }

    let result
    if (eventToEdit) {
      result = await updateEvent(eventToEdit.id, input)
    } else {
      result = await createEvent(input)
    }

    setIsSubmitting(false)

    if (result.success) {
      if (!eventToEdit) resetForm()
      onOpenChange(false)
      onEventCreated?.()
    }
  }

  // Calculate max RSVP date (must be before event date)
  const maxRsvpDate = date || undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">{eventToEdit ? 'Edit Event' : 'Create Event'}</DialogTitle>
          <DialogDescription>
            {eventToEdit ? 'Update event details and manage invites' : 'Schedule a recital, workshop, or group class for your students'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Winter Recital 2025"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the event..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Date & Time Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Start Time *</Label>
                <Input id="time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                </select>
              </div>
            </div>

            {/* Location Type */}
            <div className="space-y-3">
              <Label>Location *</Label>
              <RadioGroup
                value={locationType}
                onValueChange={(v) => setLocationType(v as "virtual" | "physical")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="virtual" id="virtual" />
                  <Label htmlFor="virtual" className="flex items-center gap-2 font-normal cursor-pointer">
                    <Video className="h-4 w-4" />
                    Virtual (Zoom)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="physical" id="physical" />
                  <Label htmlFor="physical" className="flex items-center gap-2 font-normal cursor-pointer">
                    <MapPin className="h-4 w-4" />
                    Physical Location
                  </Label>
                </div>
              </RadioGroup>

              {locationType === "virtual" ? (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  Zoom link will be {eventToEdit?.zoom_link ? 'updated' : 'auto-generated'}
                </Badge>
              ) : (
                <Input
                  placeholder="Enter address..."
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                />
              )}
            </div>

            {/* RSVP Deadline */}
            <div className="space-y-2">
              <Label htmlFor="rsvp">RSVP Deadline *</Label>
              <Input
                id="rsvp"
                type="date"
                value={rsvpDeadline}
                onChange={(e) => setRsvpDeadline(e.target.value)}
                max={maxRsvpDate}
              />
              <p className="text-xs text-muted-foreground">Students must respond by this date</p>
            </div>

            {/* Student Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Invite Students *</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
                  {selectedStudents.length === students.length ? "Deselect All" : "Select All"}
                </Button>
              </div>

              {isLoadingStudents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {students.map((student) => (
                    <label
                      key={student.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedStudents.includes(student.id)}
                        onCheckedChange={() => toggleStudent(student.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{student.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                      </div>
                      {eventToEdit?.invites.find(i => i.student_id === student.id) && (
                        <div className="text-xs text-muted-foreground mr-2">
                          {eventToEdit.invites.find(i => i.student_id === student.id)?.status}
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>
                  Inviting {selectedStudents.length} student{selectedStudents.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title || !date || !startTime || !rsvpDeadline || selectedStudents.length === 0 || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {eventToEdit ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              eventToEdit ? "Update Event" : "Create Event"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
