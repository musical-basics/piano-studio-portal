"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Send } from "lucide-react"
import { sendAnnouncement } from "@/app/actions/announcements"
import { useToast } from "@/hooks/use-toast"
import type { StudentRoster } from "@/types/admin"

interface AnnouncementTabProps {
    students: StudentRoster[]
}

export function AnnouncementTab({ students }: AnnouncementTabProps) {
    const { toast } = useToast()
    const [subject, setSubject] = useState("")
    const [body, setBody] = useState("")
    const [selectedStudents, setSelectedStudents] = useState<string[]>([])
    const [isSending, setIsSending] = useState(false)

    const allSelected = selectedStudents.length === students.length && students.length > 0

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

    const handleSend = async () => {
        if (!subject.trim() || !body.trim() || selectedStudents.length === 0) return

        setIsSending(true)
        const result = await sendAnnouncement(subject.trim(), body.trim(), selectedStudents)
        setIsSending(false)

        if (result.error) {
            toast({
                variant: "destructive",
                title: "Send Failed",
                description: result.error
            })
        } else {
            toast({
                title: "Announcement Sent",
                description: result.message
            })
            setSubject("")
            setBody("")
            setSelectedStudents([])
        }
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-serif">Draft Announcement</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Subject */}
                    <div className="space-y-2">
                        <Label htmlFor="ann-subject" className="text-base">Subject</Label>
                        <Input
                            id="ann-subject"
                            placeholder="e.g. Classroom is officially working!"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
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
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSelectAll}
                            >
                                {allSelected ? "Deselect All" : "Select All"}
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto border rounded-md p-3">
                            {students.map(student => (
                                <div
                                    key={student.id}
                                    className="flex items-center gap-2 p-1.5 hover:bg-accent rounded cursor-pointer"
                                    onClick={() => handleToggleStudent(student.id, !selectedStudents.includes(student.id))}
                                >
                                    <Checkbox
                                        checked={selectedStudents.includes(student.id)}
                                        onCheckedChange={(checked) =>
                                            handleToggleStudent(student.id, !!checked)
                                        }
                                    />
                                    <span className="text-sm truncate">
                                        {student.name || student.email}
                                    </span>
                                </div>
                            ))}
                            {students.length === 0 && (
                                <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                                    No students found
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Send Button */}
                    <div className="flex justify-end pt-2">
                        <Button
                            onClick={handleSend}
                            disabled={isSending || !subject.trim() || !body.trim() || selectedStudents.length === 0}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                            {isSending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4 mr-2" />
                                    Send Announcement
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
