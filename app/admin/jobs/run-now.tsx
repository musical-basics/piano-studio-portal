"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { previewJobRun, runJobNow, type RunNowResult } from "@/app/actions/scheduled-jobs"
import type { RunNowView } from "@/lib/scheduled-jobs"

// "Run now" for one job (Lionel's #1076). Jobs that only read, fix or email
// Lionel run straight away; a job that can email families asks first, saying
// who would get an email (with a dry run's numbers when the job has one). The
// Mac's jobs can't be started from here. The result shows under the button.

function took(ms?: number): string {
    if (ms == null) return ""
    if (ms < 1000) return " Took under a second."
    if (ms < 60_000) return ` Took ${Math.round(ms / 1000)} seconds.`
    return ` Took ${Math.round(ms / 60_000)} min.`
}

export function RunNow({ job, name, view }: { job: string; name: string; view: RunNowView }) {
    const router = useRouter()
    const [step, setStep] = useState<"idle" | "checking" | "asking" | "running">("idle")
    const [check, setCheck] = useState<RunNowResult | null>(null)
    const [result, setResult] = useState<RunNowResult | null>(null)

    if (view.mode === "mac") {
        return <p className="text-xs text-muted-foreground">Runs on the Mac, so it can&apos;t be started from here.</p>
    }

    async function go(confirmed: boolean) {
        setStep("running")
        setResult(null)
        try {
            setResult(await runJobNow(job, confirmed))
        } catch {
            setResult({ ok: false, text: "No answer came back (it may still be running). Reload the page in a minute to see how it went." })
        } finally {
            setStep("idle")
            setCheck(null)
            router.refresh()
        }
    }

    async function start() {
        setResult(null)
        if (view.mode === "run") return go(false)
        if (view.mode === "confirm" && view.preview) {
            setStep("checking")
            try {
                setCheck(await previewJobRun(job))
            } catch {
                setCheck({ ok: false, text: "The check did not answer." })
            }
        }
        setStep("asking")
    }

    const busy = step === "checking" || step === "running"
    return (
        <div className="space-y-2 pt-1">
            {step !== "asking" && (
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={busy} onClick={start}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {step === "checking" ? "Checking first..." : step === "running" ? "Running..." : "Run now"}
                </Button>
            )}
            {step === "asking" && view.mode === "confirm" && (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="font-medium">Run {name} now?</p>
                    <p>{view.confirm}</p>
                    {check && <p className={check.ok ? "font-medium" : "text-red-700 dark:text-red-400"}>{check.ok ? check.text : `Couldn't check first: ${check.text}`}</p>}
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="h-8" onClick={() => go(true)}>Run it</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setStep("idle"); setCheck(null) }}>Cancel</Button>
                    </div>
                </div>
            )}
            {result && (
                <p className={`text-sm break-words ${result.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    <span className="font-medium">{result.ok ? "Worked" : result.ms != null ? "Failed" : "Didn't run"}:</span> {result.text}{took(result.ms)}
                </p>
            )}
        </div>
    )
}
