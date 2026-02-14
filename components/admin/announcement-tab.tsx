"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Megaphone, Plus, Trash2, Loader2 } from "lucide-react"
import { getAnnouncements, deleteAnnouncementDraft } from "@/app/actions/announcements"
import { AnnouncementModal, type AnnouncementData } from "@/components/admin/announcement-modal"
import { useToast } from "@/hooks/use-toast"
import type { StudentRoster } from "@/types/admin"

interface AnnouncementTabProps {
    students: StudentRoster[]
}

type AnnouncementRow = {
    id: string
    subject: string
    body: string
    status: 'draft' | 'sent'
    created_at: string
    sent_at: string | null
    recipient_count: number
    recipient_ids: string[]
}

export function AnnouncementTab({ students }: AnnouncementTabProps) {
    const { toast } = useToast()
    const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editData, setEditData] = useState<AnnouncementData | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const fetchList = async () => {
        setIsLoading(true)
        const data = await getAnnouncements()
        setAnnouncements(data)
        setIsLoading(false)
    }

    useEffect(() => { fetchList() }, [])

    const handleNew = () => {
        setEditData(null)
        setShowModal(true)
    }

    const handleRowClick = (row: AnnouncementRow) => {
        setEditData({
            id: row.id,
            subject: row.subject,
            body: row.body,
            status: row.status,
            recipient_ids: row.recipient_ids
        })
        setShowModal(true)
    }

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (!confirm("Delete this draft?")) return
        setDeletingId(id)
        const result = await deleteAnnouncementDraft(id)
        setDeletingId(null)
        if (result.error) {
            toast({ variant: "destructive", title: "Error", description: result.error })
        } else {
            toast({ title: "Draft Deleted" })
            fetchList()
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        })
    }

    return (
        <div className="space-y-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Megaphone className="h-6 w-6 text-indigo-600" />
                    <h2 className="text-2xl font-serif font-semibold">Announcements</h2>
                </div>
                <Button onClick={handleNew} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                    <Plus className="h-4 w-4 mr-2" />
                    New Announcement
                </Button>
            </div>

            {/* History List */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : announcements.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <Megaphone className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <h3 className="font-semibold text-lg mb-2">No Announcements Yet</h3>
                        <p className="text-muted-foreground max-w-sm">
                            Click &quot;New Announcement&quot; to draft your first message to students.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {announcements.map(a => (
                        <Card
                            key={a.id}
                            className="hover:shadow-md transition-shadow cursor-pointer border"
                            onClick={() => handleRowClick(a)}
                        >
                            <CardContent className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    {/* Status Badge */}
                                    <Badge
                                        variant={a.status === 'sent' ? 'default' : 'secondary'}
                                        className={a.status === 'sent'
                                            ? 'bg-green-100 text-green-700 hover:bg-green-100 border-green-200 shrink-0'
                                            : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200 shrink-0'
                                        }
                                    >
                                        {a.status === 'sent' ? 'Sent' : 'Draft'}
                                    </Badge>

                                    {/* Subject */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{a.subject || "(No subject)"}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(a.sent_at || a.created_at)} · {a.recipient_count} recipient{a.recipient_count === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                </div>

                                {/* Delete button for drafts */}
                                {a.status === 'draft' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
                                        onClick={(e) => handleDelete(e, a.id)}
                                        disabled={deletingId === a.id}
                                    >
                                        {deletingId === a.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Modal */}
            <AnnouncementModal
                open={showModal}
                onOpenChange={setShowModal}
                students={students}
                initial={editData}
                onComplete={fetchList}
            />
        </div>
    )
}
