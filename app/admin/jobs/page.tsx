import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Clock } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatStudioTime } from "@/lib/backup-watchdog"
import { GROUP_TITLES, loadScheduledJobs, type JobGroup, type JobStatus, type JobView } from "@/lib/scheduled-jobs"
import { RunMarks } from "./run-marks"
import { RunNow } from "./run-now"

export const dynamic = "force-dynamic"
// "Run now" (#1076) runs a job inside this page's server action: give it the
// longest any cron route has.
export const maxDuration = 300

// Every scheduled job (Lionel's #777): the portal's crons (vercel.json) and the
// Mac's backup, restore test and family watcher, with when each last ran and
// whether it worked. Data from cron_heartbeats via lib/scheduled-jobs.ts.
// Since #1077 each job has a row of marks for its last 30 days (cron_runs).

const STATUS: Record<JobStatus, { label: string; dot: string; text: string }> = {
    ok: { label: "Worked", dot: "bg-green-500", text: "text-green-700 dark:text-green-400" },
    failed: { label: "Failed", dot: "bg-red-500", text: "text-red-700 dark:text-red-400" },
    late: { label: "Late", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
    never: { label: "Not recorded yet", dot: "bg-gray-300 dark:bg-gray-600", text: "text-muted-foreground" },
}

function ago(iso: string, now: Date): string {
    const min = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000))
    if (min < 1) return "just now"
    if (min < 60) return `${min} min ago`
    const hours = Math.round(min / 60)
    if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`
    const days = Math.round(hours / 24)
    return `${days} days ago`
}

function every(minutes: number): string {
    if (minutes < 60) return `every ${Math.round(minutes)} minutes`
    if (minutes < 24 * 60) return minutes === 60 ? "every hour" : `every ${Math.round(minutes / 60)} hours`
    if (minutes <= 24 * 60) return "daily"
    if (minutes <= 7 * 24 * 60) return "weekly"
    return "monthly"
}

function JobRow({ job, now }: { job: JobView; now: Date }) {
    const s = STATUS[job.status]
    const when = job.lastRunAt ? `${formatStudioTime(new Date(job.lastRunAt))} (${ago(job.lastRunAt, now)})` : null
    return (
        <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
            <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="font-medium">{job.name}</p>
                    <p className="text-xs text-muted-foreground">{job.schedule}</p>
                </div>
                <p className="text-sm text-muted-foreground">{job.what}</p>
                <p className="text-sm break-words">
                    <span className={`font-medium ${s.text}`}>{s.label}</span>
                    {job.status === "never" && <span className="text-muted-foreground">: shows here after its next run</span>}
                    {when && <span className="text-muted-foreground">{job.status === "late" ? ": last ran " : ", "}{when}</span>}
                    {job.status === "late" && <span className="text-muted-foreground">. It normally runs {every(job.intervalMinutes)}.</span>}
                    {job.status === "ok" && job.detail && <span className="text-muted-foreground">. {job.detail}</span>}
                </p>
                {job.status === "failed" && (
                    <div className="rounded-md bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
                        <p className="break-words">{job.detail || "No error text was recorded."}</p>
                        {job.lastWorkedAt && (
                            <p className="mt-1 text-xs">Last worked {formatStudioTime(new Date(job.lastWorkedAt))} ({ago(job.lastWorkedAt, now)}).</p>
                        )}
                    </div>
                )}
                {job.days && <RunMarks marks={job.days} />}
                <RunNow job={job.job} name={job.name} view={job.runNow} />
            </div>
        </li>
    )
}

function Summary({ jobs }: { jobs: JobView[] }) {
    const failed = jobs.filter(j => j.status === "failed")
    const late = jobs.filter(j => j.status === "late")
    const never = jobs.filter(j => j.status === "never")
    const problems = [...failed.map(j => `${j.name} failed`), ...late.map(j => `${j.name} is late`)]
    return (
        <div className={`rounded-lg border p-4 text-sm ${problems.length
            ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            : "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"}`}>
            <p className="font-medium">
                {problems.length
                    ? `${problems.length} need${problems.length === 1 ? "s" : ""} a look: ${problems.join(", ")}.`
                    : `All ${jobs.length - never.length} jobs with a recorded run are fine.`}
            </p>
            {never.length > 0 && (
                <p className="mt-1 opacity-80">
                    {never.length} {never.length === 1 ? "has" : "have"} no run recorded yet{never.length <= 4 ? ` (${never.map(j => j.name).join(", ")})` : ""}. Each shows up after its next run.
                </p>
            )}
        </div>
    )
}

export default async function ScheduledJobsPage() {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
    if (profile?.role !== "admin") redirect("/student")

    const now = new Date()
    let jobs: JobView[] = []
    let loadError: string | null = null
    try {
        jobs = await loadScheduledJobs(createAdminClient(), now)
    } catch (e) {
        loadError = e instanceof Error ? e.message : String(e)
    }

    const groups = (Object.keys(GROUP_TITLES) as JobGroup[])
        .map(group => ({ group, jobs: jobs.filter(j => j.group === group) }))
        .filter(g => g.jobs.length)

    return (
        <main className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Clock className="h-6 w-6 shrink-0 text-muted-foreground" />
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Scheduled jobs</h1>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/admin" className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to admin
                    </Link>
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                Everything the portal and the Mac do on their own: when each last ran and whether it worked.
                Times are Eastern. Late means no run in about twice its usual gap. The marks under each job are its last
                30 days: green worked, red at least one run failed, grey no run that day. Run now starts a job straight
                away; one that can email families asks first.
            </p>

            {loadError ? (
                <Card>
                    <CardContent className="pt-6 text-sm text-red-700 dark:text-red-400">
                        Couldn&apos;t load the jobs: {loadError}
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Summary jobs={jobs} />
                    {groups.map(({ group, jobs: list }) => (
                        <Card key={group}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg">{GROUP_TITLES[group]}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="divide-y">
                                    {list.map(job => <JobRow key={job.job} job={job} now={now} />)}
                                </ul>
                            </CardContent>
                        </Card>
                    ))}
                    <p className="text-xs text-muted-foreground">
                        The portal&apos;s jobs run on a fixed world clock (UTC), so their Eastern times move by an hour when the
                        clocks change; the times shown are for today. The Mac&apos;s jobs run by the Mac&apos;s own clock, and only
                        while it is awake (a missed one runs when it wakes up).
                    </p>
                </>
            )}
        </main>
    )
}
