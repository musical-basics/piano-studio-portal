"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Send, Save } from "lucide-react"
import { sendAnnouncement, saveAnnouncementDraft } from "@/app/actions/announcements"
import { useToast } from "@/hooks/use-toast"
import type { StudentRoster } from "@/types/admin"

export interface AnnouncementData {
    id?: string
    subject: string
    body: string
    status: 'draft' | 'sent'
    recipient_ids: string[]
}

interface AnnouncementModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    students: StudentRoster[]
    /** Pre-fill for editing a draft or viewing a sent announcement */
    initial?: AnnouncementData | null
    onComplete: () => void
}

export function AnnouncementModal({ open, onOpenChange, students, initial, onComplete }: AnnouncementModalProps) {
    const { toast } = useToast()
    const [subject, setSubject] = useState(initial?.subject || "")
    const [body, setBody] = useState(initial?.body || "")
    const [selectedStudents, setSelectedStudents] = useState<string[]>(initial?.recipient_ids || [])
    const [isSaving, setIsSaving] = useState(false)
    const [isSending, setIsSending] = useState(false)

    // Sync form state when initial data changes (clicking a different row)
    useEffect(() => {
        if (initial) {
            setSubject(initial.subject)
            setBody(initial.body)
            setSelectedStudents(initial.recipient_ids || [])
        } else {
            setSubject("")
            setBody("")
            setSelectedStudents([])
        }
    }, [initial])

    const isViewOnly = initial?.status === 'sent'
    const allSelected = selectedStudents.length === students.length && students.length > 0

    // Reset form when initial data changes (modal re-opens with different data)
    const handleOpenChange = (open: boolean) => {
        if (!open) {
            // Reset on close
            setSubject("")
            setBody("")
            setSelectedStudents([])
        }
        onOpenChange(open)
    }

    const handleSelectAll = () => {
        if (allSelected) {
            setSelectedStudents([])
        } else {
            setSelectedStudents(students.map(s => s.id))
        }
    }

    const handleToggleStudent = (studentId: string, checked: boolean) => {
        if (checked) {
            setSelectedStudents(prev => [...prev, studentId])
        } else {
            setSelectedStudents(prev => prev.filter(id => id !== studentId))
        }
    }

    const handleSaveDraft = async () => {
        if (!subject.trim()) return
        setIsSaving(true)
        const result = await saveAnnouncementDraft(subject.trim(), body.trim(), selectedStudents, initial?.id)
        setIsSaving(false)

        if (result.error) {
            toast({ variant: "destructive", title: "Error", description: result.error })
        } else {
            toast({ title: "Draft Saved", description: "You can resume editing anytime." })
            onComplete()
            handleOpenChange(false)
        }
    }

    const handleSend = async () => {
        if (!subject.trim() || !body.trim() || selectedStudents.length === 0) return
        setIsSending(true)
        const result = await sendAnnouncement(subject.trim(), body.trim(), selectedStudents, initial?.id)
        setIsSending(false)

        if (result.error) {
            toast({ variant: "destructive", title: "Send Failed", description: result.error })
        } else {
            toast({ title: "📢 Announcement Sent!", description: result.message })
            onComplete()
            handleOpenChange(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-serif">
                        {isViewOnly ? "View Announcement" : initial?.id ? "Edit Draft" : "New Announcement"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 pt-2">
                    {/* Subject */}
                    <div className="space-y-2">
                        <Label htmlFor="ann-subject" className="text-base">Subject</Label>
                        <Input
                            id="ann-subject"
                            placeholder="e.g. Recital next Saturday!"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            disabled={isViewOnly}
                        />
                    </div>

                    {/* Body */}
                    <div className="space-y-2">
                        <Label htmlFor="ann-body" className="text-base">Message</Label>
                        <Textarea
                            id="ann-body"
                            placeholder="Write your announcement here..."
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            rows={6}
                            className="resize-none"
                            disabled={isViewOnly}
                        />
                    </div>

                    {/* Recipients */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-base">
                                Recipients {selectedStudents.length > 0 && (
                                    <span className="text-muted-foreground font-normal">
                                        ({selectedStudents.length} selected)
                                    </span>
                                )}
                            </Label>
                            {!isViewOnly && (
                                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                                    {allSelected ? "Deselect All" : "Select All"}
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto border rounded-md p-3">
                            {students.map(student => {
                                const isSelected = selectedStudents.includes(student.id)
                                return (
                                    <div
                                        key={student.id}
                                        className={`flex items-center gap-2 p-1.5 rounded ${isViewOnly ? '' : 'hover:bg-accent cursor-pointer'}`}
                                        onClick={() => !isViewOnly && handleToggleStudent(student.id, !isSelected)}
                                    >
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={(checked) =>
                                                !isViewOnly && handleToggleStudent(student.id, !!checked)
                                            }
                                            disabled={isViewOnly}
                                        />
                                        <span className="text-sm truncate">
                                            {student.name || student.email}
                                        </span>
                                    </div>
                                )
                            })}
                            {students.length === 0 && (
                                <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                                    No students found
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    {!isViewOnly && (
                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={handleSaveDraft}
                                disabled={isSaving || isSending || !subject.trim()}
                            >
                                {isSaving ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                                ) : (
                                    <><Save className="h-4 w-4 mr-2" /> Save Draft</>
                                )}
                            </Button>
                            <Button
                                onClick={handleSend}
                                disabled={isSending || isSaving || !subject.trim() || !body.trim() || selectedStudents.length === 0}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white"
                            >
                                {isSending ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                                ) : (
                                    <><Send className="h-4 w-4 mr-2" /> Send Announcement</>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
