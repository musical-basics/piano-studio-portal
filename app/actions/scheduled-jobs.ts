'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/require-admin'
import { previewJobRunCore, runJobNowCore, type RunNowResult } from '@/lib/run-job-now'

export type { RunNowResult }

// "Run now" on /admin/jobs (Lionel's #1076). Server actions can be called by
// anyone who has their id, so each checks the caller is the admin before
// touching anything; the job itself runs on the server with the cron secret
// (lib/run-job-now.ts), which never reaches the browser.

/** Runs a portal job now. `confirmed` is the page's yes for jobs that can email families. */
export async function runJobNow(job: string, confirmed = false): Promise<RunNowResult> {
    const denied = await requireAdmin()
    if (denied) return { ok: false, text: denied }
    const result = await runJobNowCore(String(job), { confirmed: confirmed === true })
    revalidatePath('/admin/jobs')
    return result
}

/** A dry run first (sends and changes nothing), for the question before a family-emailing job runs. */
export async function previewJobRun(job: string): Promise<RunNowResult> {
    const denied = await requireAdmin()
    if (denied) return { ok: false, text: denied }
    return previewJobRunCore(String(job))
}
