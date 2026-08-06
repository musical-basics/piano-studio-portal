"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Loader2, AlertTriangle, Mail, ExternalLink } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { resolveRecitalAddressing } from "@/lib/recital-addressing"
import { updateStudentContactFields } from "@/app/actions/recital-review"

interface StudentRow {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    credits: number
    lesson_day: string | null
    lesson_time: string | null
    lesson_duration: number | null
    preferred_name: string | null
    parent_email: string | null
    parent_contact_name: string | null
    contact_salutation: string | null
    primary_contact_role: 'student' | 'parent' | null
    public_id: string | null
}

interface RecitalReviewProps {
    students: StudentRow[]
    recitalEventId: string | null
}

const NONE = "__none__"

function StudentCard({ student, recitalEventId }: { student: StudentRow; recitalEventId: string | null }) {
    const { toast } = useToast()
    const [parentName, setParentName] = useState(student.parent_contact_name || "")
    const [parentEmail, setParentEmail] = useState(student.parent_email || "")
    const [salutation, setSalutation] = useState(student.contact_salutation || "")
    const [contactRole, setContactRole] = useState<string>(student.primary_contact_role || NONE)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    // Live preview computed from the edited values, via the same function the
    // real send uses.
    const addressing = resolveRecitalAddressing({
        name: student.name,
        email: student.email,
        preferred_name: student.preferred_name,
        parent_email: parentEmail || null,
        parent_contact_name: parentName || null,
        contact_salutation: salutation || null,
    })

    const dirty =
        parentName !== (student.parent_contact_name || "") ||
        parentEmail !== (student.parent_email || "") ||
        salutation !== (student.contact_salutation || "") ||
        contactRole !== (student.primary_contact_role || NONE)

    const handleSave = async () => {
        setSaving(true)
        const res = await updateStudentContactFields(student.id, {
            parent_contact_name: parentName || null,
            parent_email: parentEmail || null,
            contact_salutation: salutation || null,
            primary_contact_role: contactRole === NONE ? null : (contactRole as 'student' | 'parent'),
        })
        setSaving(false)
        if (res.error) {
            toast({ variant: "destructive", title: "Save failed", description: res.error })
        } else {
            setSaved(true)
            toast({ title: "Saved", description: `${student.name}: contact info updated` })
        }
    }

    return (
        <Card className={addressing.needsAttention ? "border-warning" : ""}>
            <CardContent className="pt-6">
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Student info on file */}
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <p className="font-serif text-lg font-semibold">{student.name || "Unnamed"}</p>
                            {addressing.needsAttention && (
                                <AlertTriangle className="h-4 w-4 text-warning" aria-label="Needs attention" />
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">{student.email || "no email"}</p>
                        {student.phone && <p className="text-sm text-muted-foreground">{student.phone}</p>}
                        <p className="text-sm text-muted-foreground">
                            {student.lesson_day ? `${student.lesson_day} ${(student.lesson_time || "").slice(0, 5)} (${student.lesson_duration || 30}m)` : "No standing slot"}
                            {" · "}{student.credits} credits
                        </p>
                        {student.preferred_name && (
                            <p className="text-sm text-muted-foreground">Preferred name: {student.preferred_name}</p>
                        )}
                    </div>

                    {/* Editable contact routing */}
                    <div className="space-y-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor={`pn-${student.id}`} className="text-xs">Parent name</Label>
                            <Input id={`pn-${student.id}`} value={parentName} onChange={e => setParentName(e.target.value)} placeholder="e.g. Amanda" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={`pe-${student.id}`} className="text-xs">Parent email</Label>
                            <Input id={`pe-${student.id}`} type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@example.com" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={`sal-${student.id}`} className="text-xs">Salutation override (optional)</Label>
                            <Input id={`sal-${student.id}`} value={salutation} onChange={e => setSalutation(e.target.value)} placeholder='Overrides everything, e.g. "Dr. Chen"' />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-xs">Primary contact</Label>
                            <Select value={contactRole} onValueChange={setContactRole}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Not set</SelectItem>
                                    <SelectItem value="parent">Parent</SelectItem>
                                    <SelectItem value="student">Student (adult)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button size="sm" onClick={handleSave} disabled={saving || (!dirty && !saved)} className="w-full">
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {saved && !dirty ? "Saved" : "Save changes"}
                        </Button>
                    </div>

                    {/* Computed email preview */}
                    <div className="space-y-2 rounded-lg bg-secondary/50 p-4">
                        <div className="flex items-center gap-2">
                            <Badge variant={addressing.addressedTo === 'student' ? 'outline' : 'default'}>
                                {addressing.addressedTo === 'parent' ? 'To the parent'
                                    : addressing.addressedTo === 'override' ? 'Manual override'
                                    : 'To the student'}
                            </Badge>
                        </div>
                        <p className="font-medium">Hi {addressing.greetingName},</p>
                        <p className="text-sm">
                            <span className="text-muted-foreground">Sends to: </span>
                            {addressing.recipients.length > 0
                                ? addressing.recipients.join(", ")
                                : <span className="text-destructive font-medium">no email on file!</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{addressing.basis}</p>
                        {recitalEventId && student.public_id && (
                            <div className="pt-2 border-t space-y-1">
                                <Button variant="outline" size="sm" asChild className="w-full">
                                    <a
                                        href={`/recital/${recitalEventId}/${student.public_id}?a=yes`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="gap-2"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        View their RSVP page
                                    </a>
                                </Button>
                                <p className="text-[11px] text-muted-foreground text-center">
                                    View only: pressing Confirm on it records an RSVP as this family.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

export function RecitalReview({ students, recitalEventId }: RecitalReviewProps) {
    const summary = students.map(s => resolveRecitalAddressing({
        name: s.name, email: s.email, preferred_name: s.preferred_name,
        parent_email: s.parent_email, parent_contact_name: s.parent_contact_name,
        contact_salutation: s.contact_salutation,
    }))
    const toParents = summary.filter(a => a.addressedTo !== 'student').length
    const toStudents = summary.filter(a => a.addressedTo === 'student').length
    const needsAttention = summary.filter(a => a.needsAttention).length

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b bg-card sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4 flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/admin"><ArrowLeft className="h-5 w-5" /></Link>
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
                            <Mail className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div>
                            <h1 className="text-xl font-serif font-semibold">Recital Email Review</h1>
                            <p className="text-sm text-muted-foreground">How each family's invitation will be addressed</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl font-serif">Active students ({students.length})</CardTitle>
                        <CardDescription>
                            Rule: with a parent name or parent email on file, the email is addressed to the parent;
                            otherwise it's addressed to the student as an adult. A salutation override always wins.
                            Edits here update the student's profile and apply to all future outbound messages.
                        </CardDescription>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <Badge variant="secondary">{toParents} addressed to parents</Badge>
                            <Badge variant="secondary">{toStudents} addressed to students</Badge>
                            {needsAttention > 0 && (
                                <Badge variant="outline" className="border-warning text-warning-foreground">
                                    <AlertTriangle className="h-3 w-3 mr-1" />{needsAttention} need attention
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                </Card>

                {students.map(s => <StudentCard key={s.id} student={s} recitalEventId={recitalEventId} />)}
            </main>
        </div>
    )
}
