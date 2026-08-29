"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
    ArrowLeft, ArrowDown, ArrowUp, AlertTriangle, Bell, BellOff, Check, Copy,
    Loader2, Mail, Megaphone, Music, Plus, RotateCcw, Send, Trash2, Video,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { resolveRecitalAddressing } from "@/lib/recital-addressing"
import {
    buildAnnouncementDraft, buildAudienceDraft, buildGuestDraft, buildNoResponseDraft,
    buildNotGoingDraft, buildPerformerDraft, buildReminderDrafts, firstWord,
    formatProgramText, formatRecitalWhen, parseRsvpNotes,
    type AudienceMember, type ProgramEntry, type RecitalSendLog,
} from "@/lib/recital-send"
import {
    cancelRecitalReminder, scheduleRecitalReminders, sendRecitalEmails,
    updateRecitalSendMeta, type RecitalSendItem,
} from "@/app/actions/recital-send"
import { saveAnnouncementDraft, sendAnnouncement } from "@/app/actions/announcements"

export type SendPageStudent = {
    id: string
    name: string | null
    preferred_name: string | null
    email: string | null
    parent_email: string | null
    parent_contact_name: string | null
    contact_salutation: string | null
    public_id: string | null
    rsvpStatus: string | null
    rsvpNotes: string | null
}

type EventInfo = {
    id: string
    title: string
    start_time: string
    zoomUrl: string
    zoomMeetingId: string | null
}

type CardOverride = { subject?: string; body?: string; to?: string; include?: boolean }

type EmailCard = {
    key: string
    group: 'performer' | 'noResponse' | 'notGoing' | 'guest' | 'audience'
    title: string
    subtitle: string
    flags: string[]
    rsvpNotes: string | null
    defaultTo: string
    defaultSubject: string
    defaultBody: string
    trackPublicId?: string
}

const GROUP_LABEL: Record<EmailCard['group'], string> = {
    performer: 'Performers',
    noResponse: 'No RSVP yet',
    notGoing: 'Not attending',
    guest: 'Family guests',
    audience: 'YouTube audience',
}

function parseToList(to: string): string[] {
    return to.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
}

function studioTimeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
}

export function RecitalSend({ event, students, initialLog }: {
    event: EventInfo
    students: SendPageStudent[]
    initialLog: RecitalSendLog
}) {
    const { toast } = useToast()
    const [log, setLog] = useState<RecitalSendLog>(initialLog)

    // Program: persisted order/pieces if saved, else derived from the RSVPs.
    const derivedProgram = useMemo<ProgramEntry[]>(() =>
        students
            .filter(s => s.rsvpStatus === 'going')
            .map(s => ({
                key: `student:${s.id}`,
                performer: s.name || 'Unnamed',
                piece: parseRsvpNotes(s.rsvpNotes).piece || 'TBD',
            })),
        [students])
    const [program, setProgram] = useState<ProgramEntry[]>(
        initialLog.program.length > 0 ? initialLog.program : derivedProgram
    )
    const [audience, setAudience] = useState<AudienceMember[]>(initialLog.audience)
    const [newAudience, setNewAudience] = useState({ name: '', email: '' })

    const [overrides, setOverrides] = useState<Record<string, CardOverride>>({})
    const [busy, setBusy] = useState<Record<string, boolean>>({})
    const setBusyKey = (k: string, v: boolean) => setBusy(prev => ({ ...prev, [k]: v }))

    const whenLine = useMemo(() => formatRecitalWhen(event.start_time), [event.start_time])
    const ctx = useMemo(() => ({
        zoomUrl: event.zoomUrl,
        whenLine,
        programText: formatProgramText(program),
    }), [event.zoomUrl, whenLine, program])

    // Default drafts recompute whenever the program changes; cards Lionel has
    // edited keep his text (with a Reset button back to the template).
    const cards = useMemo<EmailCard[]>(() => {
        const out: EmailCard[] = []
        for (const s of students) {
            const addressing = resolveRecitalAddressing(s)
            const parsed = parseRsvpNotes(s.rsvpNotes)
            const first = firstWord(s.preferred_name) || firstWord(s.name) || 'your student'
            const group: EmailCard['group'] =
                s.rsvpStatus === 'going' ? 'performer'
                : s.rsvpStatus === 'not_going' ? 'notGoing'
                : 'noResponse'
            const programPiece = program.find(p => p.key === `student:${s.id}`)?.piece || parsed.piece
            const draft =
                group === 'performer' ? buildPerformerDraft(addressing.greetingName, first, programPiece, ctx)
                : group === 'notGoing' ? buildNotGoingDraft(addressing.greetingName, first, ctx)
                : buildNoResponseDraft(addressing.greetingName, first, ctx)
            const flags: string[] = []
            if (addressing.needsAttention) flags.push('Check contact info')
            if (group === 'performer' && (!programPiece || programPiece.trim().toLowerCase() === 'tbd')) flags.push('Piece TBD')
            if (group === 'notGoing') flags.push("RSVP'd not attending")
            if (group === 'noResponse') flags.push('Never responded to the invite')
            out.push({
                key: `student:${s.id}`,
                group,
                title: s.name || 'Unnamed',
                subtitle: `Addressed to ${addressing.greetingName} (${addressing.basis})`,
                flags,
                rsvpNotes: s.rsvpNotes,
                defaultTo: addressing.recipients.join(', '),
                defaultSubject: draft.subject,
                defaultBody: draft.body,
                trackPublicId: s.public_id || undefined,
            })
            for (const guestEmail of parsed.guests) {
                const gd = buildGuestDraft(first, ctx)
                out.push({
                    key: `guest:${guestEmail.toLowerCase()}`,
                    group: 'guest',
                    title: guestEmail,
                    subtitle: `Guest added by ${s.name || 'a student'} on their RSVP`,
                    flags: [],
                    rsvpNotes: null,
                    defaultTo: guestEmail,
                    defaultSubject: gd.subject,
                    defaultBody: gd.body,
                })
            }
        }
        for (const a of audience) {
            const ad = buildAudienceDraft(firstWord(a.name) || 'there', ctx)
            out.push({
                key: `audience:${a.email.toLowerCase()}`,
                group: 'audience',
                title: a.name || a.email,
                subtitle: 'Signed up via the YouTube form',
                flags: [],
                rsvpNotes: null,
                defaultTo: a.email,
                defaultSubject: ad.subject,
                defaultBody: ad.body,
            })
        }
        return out
    }, [students, audience, program, ctx])

    const cardState = (c: EmailCard) => {
        const o = overrides[c.key] || {}
        return {
            to: o.to ?? c.defaultTo,
            subject: o.subject ?? c.defaultSubject,
            body: o.body ?? c.defaultBody,
            include: o.include ?? true,
            edited: o.subject !== undefined || o.body !== undefined || o.to !== undefined,
            sent: log.sent[c.key] || null,
        }
    }
    const setOverride = (key: string, patch: CardOverride) =>
        setOverrides(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
    const resetOverride = (key: string) =>
        setOverrides(prev => {
            const next = { ...prev }
            const include = next[key]?.include
            next[key] = include === undefined ? {} : { include }
            return next
        })

    const toItem = (c: EmailCard): RecitalSendItem => {
        const st = cardState(c)
        return { key: c.key, to: parseToList(st.to), subject: st.subject, body: st.body, trackPublicId: c.trackPublicId }
    }

    const handleSendOne = async (c: EmailCard) => {
        setBusyKey(c.key, true)
        const res = await sendRecitalEmails(event.id, [toItem(c)])
        setBusyKey(c.key, false)
        if (res.error) toast({ variant: 'destructive', title: 'Send failed', description: res.error })
        else toast({ title: 'Sent', description: `${c.title}: email sent.` })
        if (res.log) setLog(res.log)
    }

    const pendingIncluded = cards.filter(c => cardState(c).include && !cardState(c).sent)
    const handleSendAll = async () => {
        if (pendingIncluded.length === 0) return
        if (!window.confirm(`Send ${pendingIncluded.length} emails now? Already-sent and excluded recipients are skipped.`)) return
        setBusyKey('all', true)
        const res = await sendRecitalEmails(event.id, pendingIncluded.map(toItem))
        setBusyKey('all', false)
        if (res.error) toast({ variant: 'destructive', title: 'Send failed', description: res.error })
        else toast({ title: 'Sent', description: `${res.sentCount} emails sent${res.skipped ? `, ${res.skipped} already sent were skipped` : ''}.` })
        if (res.log) setLog(res.log)
    }

    const handleSaveProgram = async () => {
        setBusyKey('program', true)
        const res = await updateRecitalSendMeta(event.id, { program })
        setBusyKey('program', false)
        if ('error' in res && res.error) toast({ variant: 'destructive', title: 'Save failed', description: res.error })
        else toast({ title: 'Program saved' })
    }
    const moveProgram = (i: number, dir: -1 | 1) => {
        setProgram(prev => {
            const next = [...prev]
            const j = i + dir
            if (j < 0 || j >= next.length) return prev
            ;[next[i], next[j]] = [next[j], next[i]]
            return next
        })
    }

    const handleSaveAudience = async (next: AudienceMember[]) => {
        setAudience(next)
        const res = await updateRecitalSendMeta(event.id, { audience: next })
        if ('error' in res && res.error) toast({ variant: 'destructive', title: 'Save failed', description: res.error })
    }

    // Announcement (portal + notification email via the existing announcements flow)
    const announcementDefault = useMemo(() => buildAnnouncementDraft(ctx), [ctx])
    const [annOverride, setAnnOverride] = useState<{ subject?: string; body?: string }>({})
    const annSubject = annOverride.subject ?? announcementDefault.subject
    const annBody = annOverride.body ?? announcementDefault.body
    const handleAnnouncement = async (mode: 'draft' | 'send') => {
        if (mode === 'send' && !window.confirm(`Post the announcement and email it to ${students.length} active students?`)) return
        setBusyKey('announcement', true)
        const res = mode === 'draft'
            ? await saveAnnouncementDraft(annSubject, annBody, students.map(s => s.id))
            : await sendAnnouncement(annSubject, annBody, students.map(s => s.id))
        setBusyKey('announcement', false)
        const annError = 'error' in res ? res.error : undefined
        if (annError) toast({ variant: 'destructive', title: 'Announcement failed', description: annError })
        else toast({ title: mode === 'draft' ? 'Draft saved' : 'Announcement posted', description: 'message' in res ? res.message : undefined })
    }

    // Reminders (Resend scheduled sends, BCC to everyone included above)
    const reminderDefaults = useMemo(() => buildReminderDrafts(ctx), [ctx])
    const [remOverride, setRemOverride] = useState<Record<string, { subject?: string; body?: string }>>({})
    const start = new Date(event.start_time).getTime()
    const reminderPlan = [
        { key: '1h', label: '1 hour before', scheduledFor: new Date(start - 60 * 60 * 1000).toISOString() },
        { key: '15m', label: '15 minutes before', scheduledFor: new Date(start - 15 * 60 * 1000).toISOString() },
    ] as const
    const reminderRecipients = useMemo(() => {
        const set = new Set<string>()
        for (const c of cards) {
            const st = cardState(c)
            if (st.include) parseToList(st.to).forEach(e => set.add(e.toLowerCase()))
        }
        return [...set]
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cards, overrides, log])
    const handleSchedule = async (keys: string[]) => {
        const plan = reminderPlan.filter(r => keys.includes(r.key))
        setBusyKey('reminders', true)
        const res = await scheduleRecitalReminders(
            event.id,
            plan.map(r => ({
                key: r.key,
                subject: remOverride[r.key]?.subject ?? reminderDefaults[r.key].subject,
                body: remOverride[r.key]?.body ?? reminderDefaults[r.key].body,
                scheduledFor: r.scheduledFor,
            })),
            reminderRecipients
        )
        setBusyKey('reminders', false)
        if (res.error) toast({ variant: 'destructive', title: 'Scheduling failed', description: res.error })
        else toast({ title: 'Reminders scheduled', description: Object.entries(res.results || {}).map(([k, v]) => `${k}: ${v}`).join('; ') })
        if (res.log) setLog(res.log)
    }
    const handleCancelReminder = async (key: string) => {
        setBusyKey('reminders', true)
        const res = await cancelRecitalReminder(event.id, key)
        setBusyKey('reminders', false)
        if (res.error) toast({ variant: 'destructive', title: 'Cancel failed', description: res.error })
        else toast({ title: 'Reminder canceled' })
        if (res.log) setLog(res.log)
    }

    const sentCount = cards.filter(c => cardState(c).sent).length
    const groups: EmailCard['group'][] = ['performer', 'noResponse', 'notGoing', 'guest', 'audience']

    return (
        <div className="min-h-screen bg-background">
            <header className="border-b bg-card sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4 flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/admin"><ArrowLeft className="h-5 w-5" /></Link>
                    </Button>
                    <div className="flex items-center gap-3 flex-1">
                        <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
                            <Music className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div>
                            <h1 className="text-xl font-serif font-semibold">Recital Send Console</h1>
                            <p className="text-sm text-muted-foreground">{event.title}: {whenLine}</p>
                        </div>
                    </div>
                    <Button onClick={handleSendAll} disabled={busy['all'] || pendingIncluded.length === 0}>
                        {busy['all'] ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        Send all included ({pendingIncluded.length})
                    </Button>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 space-y-8 max-w-5xl">
                {/* Zoom */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg"><Video className="h-5 w-5" /> Zoom meeting</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm bg-secondary rounded px-2 py-1 break-all">{event.zoomUrl || 'No link on the event yet'}</code>
                            {event.zoomUrl && (
                                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(event.zoomUrl); toast({ title: 'Copied' }) }}>
                                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                                </Button>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Meeting ID {event.zoomMeetingId || 'n/a'} · waiting room on (you admit arrivals) · everyone muted on entry · cloud recording starts automatically.
                        </p>
                    </CardContent>
                </Card>

                {/* Program */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Program</CardTitle>
                        <CardDescription>
                            Built from the recital signups. Reorder or fix pieces here; email drafts you haven&apos;t hand-edited update automatically.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {program.map((entry, i) => (
                            <div key={entry.key} className="flex items-center gap-2">
                                <span className="w-6 text-sm text-muted-foreground text-right">{i + 1}.</span>
                                <Input className="w-44" value={entry.performer}
                                    onChange={e => setProgram(p => p.map((x, j) => j === i ? { ...x, performer: e.target.value } : x))} />
                                <Input className="flex-1" value={entry.piece}
                                    onChange={e => setProgram(p => p.map((x, j) => j === i ? { ...x, piece: e.target.value } : x))} />
                                {entry.piece.trim().toLowerCase() === 'tbd' && (
                                    <Badge variant="outline" className="border-warning text-warning-foreground shrink-0">TBD</Badge>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => moveProgram(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => moveProgram(i, 1)} disabled={i === program.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setProgram(p => p.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                            <Button variant="outline" size="sm" onClick={() => setProgram(p => [...p, { key: `manual:${p.length}`, performer: '', piece: '' }])}>
                                <Plus className="h-4 w-4 mr-1" /> Add row
                            </Button>
                            <Button size="sm" onClick={handleSaveProgram} disabled={busy['program']}>
                                {busy['program'] ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Save program
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Announcement */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg"><Megaphone className="h-5 w-5" /> Studio announcement</CardTitle>
                        <CardDescription>
                            Posts to every active student&apos;s portal dashboard and emails them a copy (the standard announcement flow).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid gap-1.5">
                            <Label className="text-xs">Subject</Label>
                            <Input value={annSubject} onChange={e => setAnnOverride(o => ({ ...o, subject: e.target.value }))} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-xs">Body</Label>
                            <Textarea rows={10} value={annBody} onChange={e => setAnnOverride(o => ({ ...o, body: e.target.value }))} />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleAnnouncement('draft')} disabled={busy['announcement']}>Save as draft</Button>
                            <Button size="sm" onClick={() => handleAnnouncement('send')} disabled={busy['announcement']}>
                                {busy['announcement'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Post + email {students.length} students
                            </Button>
                            {(annOverride.subject !== undefined || annOverride.body !== undefined) && (
                                <Button variant="ghost" size="sm" onClick={() => setAnnOverride({})}><RotateCcw className="h-4 w-4 mr-1" /> Reset</Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Reminders */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5" /> Reminders</CardTitle>
                        <CardDescription>
                            Scheduled through Resend and delivered automatically. Each goes to all {reminderRecipients.length} included
                            addresses above (BCC, one email). Schedule these AFTER you&apos;re happy with the include toggles.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {reminderPlan.map(r => {
                            const rec = log.reminders[r.key]
                            const active = rec && !rec.canceledAt
                            return (
                                <div key={r.key} className="space-y-2 border rounded-lg p-4">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-medium">{r.label}</p>
                                        <Badge variant="outline">fires at {studioTimeLabel(r.scheduledFor)}</Badge>
                                        {active && <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" variant="outline">Scheduled to {rec.recipientCount}</Badge>}
                                        {rec?.canceledAt && <Badge variant="secondary">Canceled</Badge>}
                                    </div>
                                    <Input value={remOverride[r.key]?.subject ?? reminderDefaults[r.key].subject}
                                        onChange={e => setRemOverride(o => ({ ...o, [r.key]: { ...o[r.key], subject: e.target.value } }))} disabled={!!active} />
                                    <Textarea rows={4} value={remOverride[r.key]?.body ?? reminderDefaults[r.key].body}
                                        onChange={e => setRemOverride(o => ({ ...o, [r.key]: { ...o[r.key], body: e.target.value } }))} disabled={!!active} />
                                    {active ? (
                                        <Button variant="outline" size="sm" onClick={() => handleCancelReminder(r.key)} disabled={busy['reminders']}>
                                            <BellOff className="h-4 w-4 mr-1" /> Cancel this reminder
                                        </Button>
                                    ) : (
                                        <Button size="sm" onClick={() => handleSchedule([r.key])} disabled={busy['reminders'] || new Date(r.scheduledFor) <= new Date()}>
                                            {busy['reminders'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                            Schedule
                                        </Button>
                                    )}
                                </div>
                            )
                        })}
                    </CardContent>
                </Card>

                {/* Emails */}
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-serif font-semibold flex items-center gap-2"><Mail className="h-5 w-5" /> Zoom link emails</h2>
                        <Badge variant="secondary">{sentCount}/{cards.length} sent</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Review every email below. Edit anything inline; Send buttons send exactly the text shown. Student emails include the open-tracking pixel.
                    </p>
                </div>

                {groups.map(group => {
                    const groupCards = cards.filter(c => c.group === group)
                    if (groupCards.length === 0) return null
                    return (
                        <section key={group} className="space-y-4">
                            <h3 className="font-medium text-muted-foreground">{GROUP_LABEL[group]} ({groupCards.length})</h3>
                            {groupCards.map(c => {
                                const st = cardState(c)
                                return (
                                    <Card key={c.key} className={c.flags.length > 0 && !st.sent ? 'border-warning' : ''}>
                                        <CardContent className="pt-6 space-y-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-serif text-lg font-semibold">{c.title}</p>
                                                {c.flags.map(f => (
                                                    <Badge key={f} variant="outline" className="border-warning text-warning-foreground">
                                                        <AlertTriangle className="h-3 w-3 mr-1" />{f}
                                                    </Badge>
                                                ))}
                                                {st.sent && (
                                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" variant="outline">
                                                        Sent {new Date(st.sent.at).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })} PT
                                                    </Badge>
                                                )}
                                                <div className="ml-auto flex items-center gap-2">
                                                    <Label className="text-xs text-muted-foreground">Include</Label>
                                                    <Switch checked={st.include} onCheckedChange={v => setOverride(c.key, { include: v })} disabled={!!st.sent} />
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">{c.subtitle}</p>
                                            {c.rsvpNotes && (
                                                <p className="text-xs bg-secondary/60 rounded px-2 py-1.5">Signup response: {c.rsvpNotes}</p>
                                            )}
                                            <div className="grid gap-1.5">
                                                <Label className="text-xs">To</Label>
                                                <Input value={st.to} onChange={e => setOverride(c.key, { to: e.target.value })} disabled={!!st.sent} />
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label className="text-xs">Subject</Label>
                                                <Input value={st.subject} onChange={e => setOverride(c.key, { subject: e.target.value })} disabled={!!st.sent} />
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label className="text-xs">Body</Label>
                                                <Textarea rows={Math.min(16, st.body.split('\n').length + 1)} value={st.body}
                                                    onChange={e => setOverride(c.key, { body: e.target.value })} disabled={!!st.sent} />
                                            </div>
                                            <div className="flex gap-2">
                                                {!st.sent && (
                                                    <Button size="sm" onClick={() => handleSendOne(c)} disabled={busy[c.key] || !st.include}>
                                                        {busy[c.key] ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                                                        Send this email
                                                    </Button>
                                                )}
                                                {st.edited && !st.sent && (
                                                    <Button variant="ghost" size="sm" onClick={() => resetOverride(c.key)}>
                                                        <RotateCcw className="h-4 w-4 mr-1" /> Reset to template
                                                    </Button>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </section>
                    )
                })}

                {/* Audience management */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Add audience member</CardTitle>
                        <CardDescription>Adds another YouTube viewer to the list above (saved immediately).</CardDescription>
                    </CardHeader>
                    <CardContent className="flex gap-2 flex-wrap">
                        <Input className="w-52" placeholder="Name" value={newAudience.name} onChange={e => setNewAudience(a => ({ ...a, name: e.target.value }))} />
                        <Input className="w-64" placeholder="email@example.com" value={newAudience.email} onChange={e => setNewAudience(a => ({ ...a, email: e.target.value }))} />
                        <Button size="sm" onClick={() => {
                            const email = newAudience.email.trim()
                            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                                toast({ variant: 'destructive', title: 'Invalid email' })
                                return
                            }
                            if (audience.some(a => a.email.toLowerCase() === email.toLowerCase())) {
                                toast({ variant: 'destructive', title: 'Already on the list' })
                                return
                            }
                            handleSaveAudience([...audience, { name: newAudience.name.trim(), email }])
                            setNewAudience({ name: '', email: '' })
                        }}>
                            <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
