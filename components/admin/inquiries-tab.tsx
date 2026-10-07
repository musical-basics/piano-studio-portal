"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Mail, Phone, Send, UserCheck, Loader2 } from "lucide-react"
import type { Inquiry } from "@/types/admin"
import { updateInquiryStatus, approveProspect, sendInquiryReply } from "@/app/actions/inquiries"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { useRouter } from "next/navigation"

interface InquiriesTabProps {
    inquiries: Inquiry[]
    error?: string
}

export function InquiriesTab({ inquiries, error }: InquiriesTabProps) {
    const { toast } = useToast()
    const router = useRouter()
    const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null)
    const [isStatusUpdating, setIsStatusUpdating] = useState(false)
    const [isApproving, setIsApproving] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const sendingRef = useRef(false)
    const [drafts, setDrafts] = useState<Record<string, { content: string; requestId: string }>>({})
    const [replyFeedback, setReplyFeedback] = useState<{ error?: string; message?: string } | null>(null)
    const isBusy = isSending || isStatusUpdating || isApproving
    const draft = selectedInquiry ? drafts[selectedInquiry.id] : undefined

    useEffect(() => {
        setSelectedInquiry(current => current ? inquiries.find(inquiry => inquiry.id === current.id) || null : null)
    }, [inquiries])

    const handleReply = async () => {
        if (!selectedInquiry || !draft?.content.trim() || sendingRef.current) return
        sendingRef.current = true
        setIsSending(true)
        setReplyFeedback(null)
        try {
            const result = await sendInquiryReply(selectedInquiry.id, draft.content, draft.requestId)
            if (!result.success) {
                setReplyFeedback({ error: result.error || 'Could not send your reply. Please try again.' })
                return
            }
            setDrafts(current => ({ ...current, [selectedInquiry.id]: { content: '', requestId: crypto.randomUUID() } }))
            setReplyFeedback({ message: result.warning || `Reply sent to ${selectedInquiry.email}.` })
            router.refresh()
        } catch {
            setReplyFeedback({ error: 'Could not confirm the send. Your draft is saved here; retry it to avoid sending a duplicate.' })
        } finally {
            sendingRef.current = false
            setIsSending(false)
        }
    }

    // Sort by status (fresh leads first) then date
    const sortedInquiries = [...inquiries].sort((a, b) => {
        const aNew = a.status === 'Lead'
        const bNew = b.status === 'Lead'
        if (aNew && !bNew) return -1
        if (!aNew && bNew) return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    const handleApprove = async () => {
        if (!selectedInquiry) return
        setIsApproving(true)
        try {
            const result = await approveProspect(selectedInquiry.id)
            if (result.success) {
                toast({
                    title: "Prospect approved",
                    description: result.warning
                        ? `${result.warning} Temp password: ${result.tempPassword}`
                        : `${selectedInquiry.name} can now log in. A welcome email with login details was sent.`
                })
                router.refresh()
                setSelectedInquiry(null)
            } else {
                toast({
                    variant: "destructive",
                    title: "Approval failed",
                    description: result.error || "Could not create prospect account."
                })
            }
        } catch {
            toast({ variant: 'destructive', title: 'Approval failed', description: 'Please try again.' })
        } finally {
            setIsApproving(false)
        }
    }

    const handleStatusUpdate = async (newStatus: Inquiry['status']) => {
        if (!selectedInquiry) return

        setIsStatusUpdating(true)
        try {
            const result = await updateInquiryStatus(selectedInquiry.id, newStatus)

            if (result.success) {
                toast({
                    title: "Status Updated",
                    description: `Inquiry marked as ${newStatus}.`
                })
                router.refresh()
                // Optionally close dialog if moving to a terminal status
                if (newStatus === 'Archived' || newStatus === 'Student' || newStatus === 'Prospect') {
                    setSelectedInquiry(null)
                } else {
                    // Update local state for immediate feedback in modal
                    setSelectedInquiry(prev => prev ? { ...prev, status: newStatus } : null)
                }
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: result.error || "Failed to update status."
                })
            }
        } catch {
            toast({ variant: 'destructive', title: 'Status update failed', description: 'Please try again.' })
        } finally {
            setIsStatusUpdating(false)
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Lead': return <Badge className="bg-blue-500 hover:bg-blue-600">New</Badge>
            case 'Contacted': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Contacted</Badge>
            case 'Prospect': return <Badge className="bg-purple-500 hover:bg-purple-600">Prospect</Badge>
            case 'Student': return <Badge className="bg-green-500 hover:bg-green-600">Enrolled</Badge>
            case 'Archived': return <Badge variant="outline" className="text-muted-foreground">Archived</Badge>
            default: return <Badge variant="outline">{status}</Badge>
        }
    }

    return (
        <Card className="h-full border-none shadow-none">
            <CardHeader className="px-0 pt-0">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-2xl font-serif">Inquiries</CardTitle>
                        <CardDescription>Manage new lesson requests</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-0">
                {error ? (
                    <div role="alert" className="rounded-md border border-destructive p-4 text-sm text-destructive">
                        {error}
                        <Button variant="outline" size="sm" className="ml-3" onClick={() => router.refresh()}>Retry</Button>
                    </div>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Experience</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedInquiries.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                            No inquiries yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sortedInquiries.map((inquiry) => (
                                        <TableRow key={inquiry.id}>
                                            <TableCell className="whitespace-nowrap">
                                                {new Date(inquiry.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{inquiry.name}</span>
                                                    <span className="text-xs text-muted-foreground">{inquiry.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{inquiry.experience}</TableCell>
                                            <TableCell>{getStatusBadge(inquiry.status)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => {
                                                    setSelectedInquiry(inquiry)
                                                    setReplyFeedback(null)
                                                }}>
                                                    View & Reply
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                )}
            </CardContent>

            <Dialog open={!!selectedInquiry} onOpenChange={(open) => !open && !isBusy && setSelectedInquiry(null)}>
                <DialogContent className="sm:max-w-[700px]" showCloseButton={!isBusy}>
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Inquiry Details</DialogTitle>
                        <DialogDescription>
                            Received on {selectedInquiry && new Date(selectedInquiry.created_at).toLocaleString()}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedInquiry && (
                        <div className="grid gap-6 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-muted/50 rounded-lg">
                                <div className="min-w-0 space-y-1">
                                    <h3 className="font-semibold text-lg">{selectedInquiry.name}</h3>
                                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                        <div className="flex min-w-0 items-center gap-1">
                                            <Mail className="h-3 w-3 shrink-0" />
                                            <span className="break-all">{selectedInquiry.email}</span>
                                        </div>
                                        {selectedInquiry.phone && (
                                            <div className="flex items-center gap-1">
                                                <Phone className="h-3 w-3" />
                                                {selectedInquiry.phone}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {getStatusBadge(selectedInquiry.status)}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground">Experience Level</Label>
                                    <div className="font-medium">{selectedInquiry.experience}</div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground">Current Status</Label>
                                    <Select
                                        value={selectedInquiry.status}
                                        onValueChange={handleStatusUpdate}
                                        disabled={isBusy}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Lead">New</SelectItem>
                                            <SelectItem value="Contacted">Contacted</SelectItem>
                                            <SelectItem value="Prospect">Prospect</SelectItem>
                                            <SelectItem value="Student">Enrolled</SelectItem>
                                            <SelectItem value="Archived">Archived</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {selectedInquiry.notes && selectedInquiry.notes !== selectedInquiry.goals && (
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground">Inquiry Information</Label>
                                    <div className="whitespace-pre-wrap break-words text-sm">{selectedInquiry.notes.replace(/\*\*/g, '')}</div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-muted-foreground">Musical Goals</Label>
                                <div className="p-4 bg-muted/30 rounded-md text-sm leading-relaxed whitespace-pre-wrap break-words">
                                    {selectedInquiry.goals}
                                </div>
                            </div>

                            {selectedInquiry.messages.some(message => message.sender_role === 'instructor') && (
                                <div className="space-y-3">
                                    <Label className="text-muted-foreground">Sent Replies</Label>
                                    {selectedInquiry.messages.filter(message => message.sender_role === 'instructor').map(message => (
                                        <div key={message.id} className="rounded-md border p-4 text-sm">
                                            <p className="mb-2 text-xs text-muted-foreground">{new Date(message.created_at).toLocaleString()}</p>
                                            <p className="whitespace-pre-wrap break-words">{message.body_text}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <form className="space-y-3 border-t pt-4" onSubmit={event => { event.preventDefault(); void handleReply() }}>
                                <Label htmlFor="inquiry-reply">Reply by email</Label>
                                <p className="text-xs text-muted-foreground">Send directly to {selectedInquiry.email || 'the inquirer'}. Their email replies go to your inbox.</p>
                                <Textarea
                                    id="inquiry-reply"
                                    placeholder="Write your reply..."
                                    rows={7}
                                    maxLength={10000}
                                    value={draft?.content || ''}
                                    disabled={isBusy || !selectedInquiry.email}
                                    onChange={event => {
                                        setDrafts(current => ({ ...current, [selectedInquiry.id]: { content: event.target.value, requestId: crypto.randomUUID() } }))
                                        setReplyFeedback(null)
                                    }}
                                />
                                {replyFeedback?.error && <p role="alert" className="text-sm text-destructive">{replyFeedback.error}</p>}
                                {replyFeedback?.message && <p role="status" className="text-sm">{replyFeedback.message}</p>}
                                <Button type="submit" disabled={isBusy || !selectedInquiry.email || !draft?.content.trim()}>
                                    {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                    {isSending ? 'Sending...' : 'Send Reply'}
                                </Button>
                            </form>

                            <div className="flex flex-wrap justify-end gap-2 pt-4">
                                <Button variant="outline" disabled={isBusy} onClick={() => setSelectedInquiry(null)}>
                                    Close
                                </Button>
                                <Button variant="outline" asChild>
                                    <a href={`mailto:${selectedInquiry.email}?subject=Piano%20Lesson%20Inquiry`}>
                                        <Mail className="mr-2 h-4 w-4" />
                                        Open Email App
                                    </a>
                                </Button>
                                {selectedInquiry.status !== 'Prospect' && selectedInquiry.status !== 'Student' && (
                                    <Button onClick={handleApprove} disabled={isBusy || !selectedInquiry.email}>
                                        {isApproving
                                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            : <UserCheck className="mr-2 h-4 w-4" />}
                                        Approve as Prospect
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            <Toaster />
        </Card>
    )
}
