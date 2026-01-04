"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Mail, Phone, Calendar, CheckCircle2, Archive, MessageSquare } from "lucide-react"
import type { Database } from "@/lib/supabase/database.types"
import { updateInquiryStatus } from "@/app/actions/inquiries"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

// Define a local type if not yet in database.types.ts explicitly
type Inquiry = {
    id: string
    name: string
    email: string
    phone: string | null
    experience: string
    goals: string
    status: 'new' | 'contacted' | 'student' | 'archived'
    created_at: string
}

interface InquiriesTabProps {
    inquiries: Inquiry[]
}

export function InquiriesTab({ inquiries }: InquiriesTabProps) {
    const { toast } = useToast()
    const router = useRouter()
    const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null)
    const [isStatusUpdating, setIsStatusUpdating] = useState(false)

    // Sort by status (new first) then date
    const sortedInquiries = [...inquiries].sort((a, b) => {
        if (a.status === 'new' && b.status !== 'new') return -1
        if (a.status !== 'new' && b.status === 'new') return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    const handleStatusUpdate = async (newStatus: Inquiry['status']) => {
        if (!selectedInquiry) return

        setIsStatusUpdating(true)
        const result = await updateInquiryStatus(selectedInquiry.id, newStatus)

        if (result.success) {
            toast({
                title: "Status Updated",
                description: `Inquiry marked as ${newStatus}.`
            })
            router.refresh()
            // Optionally close dialog if moving to archived/student
            if (newStatus === 'archived' || newStatus === 'student') {
                setSelectedInquiry(null)
            } else {
                // Update local state for immediate feedback in modal
                setSelectedInquiry(prev => prev ? { ...prev, status: newStatus } : null)
            }
        } else {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to update status."
            })
        }
        setIsStatusUpdating(false)
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'new': return <Badge className="bg-blue-500 hover:bg-blue-600">New</Badge>
            case 'contacted': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Contacted</Badge>
            case 'student': return <Badge className="bg-green-500 hover:bg-green-600">Enrolled</Badge>
            case 'archived': return <Badge variant="outline" className="text-muted-foreground">Archived</Badge>
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
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedInquiry(inquiry)}>
                                                View Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

            <Dialog open={!!selectedInquiry} onOpenChange={(open) => !open && setSelectedInquiry(null)}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Inquiry Details</DialogTitle>
                        <DialogDescription>
                            Received on {selectedInquiry && new Date(selectedInquiry.created_at).toLocaleString()}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedInquiry && (
                        <div className="grid gap-6 py-4">
                            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                <div className="space-y-1">
                                    <h3 className="font-semibold text-lg">{selectedInquiry.name}</h3>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <Mail className="h-3 w-3" />
                                            {selectedInquiry.email}
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
                                        onValueChange={(val: any) => handleStatusUpdate(val)}
                                        disabled={isStatusUpdating}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="new">New</SelectItem>
                                            <SelectItem value="contacted">Contacted</SelectItem>
                                            <SelectItem value="student">Enrolled</SelectItem>
                                            <SelectItem value="archived">Archived</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-muted-foreground">Musical Goals</Label>
                                <div className="p-4 bg-muted/30 rounded-md text-sm leading-relaxed whitespace-pre-wrap">
                                    {selectedInquiry.goals}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="outline" onClick={() => setSelectedInquiry(null)}>
                                    Close
                                </Button>
                                <Button asChild>
                                    <a href={`mailto:${selectedInquiry.email}?subject=Piano Lesson Inquiry`}>
                                        <Mail className="mr-2 h-4 w-4" />
                                        Reply via Email
                                    </a>
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    )
}
