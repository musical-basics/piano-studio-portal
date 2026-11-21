"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { FlaskConical, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { saveRolloutResult, setRolloutStage } from "@/app/actions/rollouts"
import { ROLLOUT_STAGES, STAGE_LABEL, type RolloutArm, type RolloutStage } from "@/lib/rollouts"
import type { ArmUsage, RolloutReport, RolloutReportRow } from "@/lib/core/tests-report"

// The Tests card (protocol 1.20, "start small and feel the way"): each big
// family portal change on a half split, old against new, with how families
// used each version and a written result. The record of every test.

function day(iso: string | null): string {
    if (!iso) return "not recorded"
    return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" })
}

function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`
}

function UsageLine({ arm, label, families, usage, stage }: { arm: RolloutArm; label: string; families: number; usage: ArmUsage; stage: RolloutStage }) {
    const nobody = families === 0
    return (
        <div className="text-sm">
            <p>
                <span className={`font-medium ${arm === "new" ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground"}`}>
                    {arm === "new" ? "New" : "Old"}:
                </span>{" "}
                {label}.{" "}
                <span className="text-muted-foreground">
                    {nobody
                        ? (stage === "test" && arm === "new" ? "Test student only." : "No active family.")
                        : `${plural(families, "family", "families")}, used by ${usage.families} (${plural(usage.actions, "action")})`}
                    {!nobody && usage.byAction.length > 0 && `: ${usage.byAction.map(a => `${a.label} ${a.count}`).join(", ")}`}
                    {!nobody && "."}
                </span>
            </p>
        </div>
    )
}

/** The written result of a test: shown as text, with Write/Edit opening a small box. */
export function ResultNote({ label, saved, savedAt, onSave }: {
    label: string
    saved: string | null
    savedAt: string | null
    onSave: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
    const router = useRouter()
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(saved ?? "")
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    async function save() {
        setBusy(true)
        setMessage(null)
        const res = await onSave(text)
        setBusy(false)
        if (res.ok) {
            setEditing(false)
            router.refresh()
        } else setMessage(`Didn't save: ${res.error}`)
    }

    if (!editing) {
        return (
            <p className="text-sm">
                <span className="font-medium">Result: </span>
                {saved ? <span className="whitespace-pre-wrap">{saved}</span> : <span className="text-muted-foreground">not written yet.</span>}
                {savedAt && <span className="text-xs text-muted-foreground"> ({day(savedAt)})</span>}{" "}
                <button type="button" className="text-xs text-primary underline underline-offset-2" onClick={() => { setText(saved ?? ""); setEditing(true) }}>
                    {saved ? "Edit" : "Write it"}
                </button>
            </p>
        )
    }
    return (
        <div className="space-y-1.5">
            <Textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="What the test showed and what was decided"
                className="min-h-[60px] text-sm"
                aria-label={`Result for ${label}`}
                autoFocus
            />
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" className="h-8" disabled={busy} onClick={save}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save result"}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
                {message && <span className="text-xs text-red-700 dark:text-red-400">{message}</span>}
            </div>
        </div>
    )
}

function RolloutRow({ row }: { row: RolloutReportRow }) {
    const router = useRouter()
    const [stage, setStage] = useState<RolloutStage>(row.stage)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    async function changeStage(next: RolloutStage) {
        setBusy(true)
        setMessage(null)
        const res = await setRolloutStage(row.key, next)
        setBusy(false)
        if (res.ok) {
            setStage(next)
            setMessage(`Now: ${STAGE_LABEL[next]}. The test period starts again from today.`)
            router.refresh()
        } else setMessage(`Didn't change: ${res.error}`)
    }

    return (
        <li className="space-y-2 py-4 first:pt-0 last:pb-0" data-testid={`rollout-${row.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{row.label}</p>
                <div className="flex items-center gap-2">
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <select
                        aria-label={`Stage for ${row.label}`}
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={stage}
                        disabled={busy}
                        onChange={e => changeStage(e.target.value as RolloutStage)}
                    >
                        {ROLLOUT_STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                    </select>
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                Since {day(row.startedAt)}
                {message && <span>. {message}</span>}
            </p>
            <UsageLine arm="new" label={row.newArm} families={row.families.new} usage={row.usage.new} stage={stage} />
            <UsageLine arm="old" label={row.oldArm} families={row.families.old} usage={row.usage.old} stage={stage} />
            <ResultNote label={row.label} saved={row.result} savedAt={row.resultAt} onSave={text => saveRolloutResult(row.key, text)} />
        </li>
    )
}

export function TestsCard({ report, children }: { report: RolloutReport; children?: ReactNode }) {
    return (
        <Card data-testid="tests-card">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <FlaskConical className="h-5 w-5 text-muted-foreground" />
                    Tests (start small)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Big changes to the family portal go to half the families first, old against new; each family always sees the
                    same version. With {plural(report.activeFamilies, "active family", "active families")}, each half is only a few
                    families, so a split mostly keeps a broken change from reaching everyone at once and shows whether families use
                    the new thing at all; it can&apos;t prove which version is better. Small fixes go to everyone. Usage counts active
                    families since the stage began (not the test student, not your previews).
                </p>
                {report.error && (
                    <p className="text-sm text-red-700 dark:text-red-400">Couldn&apos;t read the rollouts ({report.error}); the portal is using the safe stages.</p>
                )}
                <ul className="divide-y">
                    {report.rows.map(row => <RolloutRow key={row.key} row={row} />)}
                </ul>
                {children}
            </CardContent>
        </Card>
    )
}
