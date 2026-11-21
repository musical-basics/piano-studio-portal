import { createAdminClient } from '@/lib/supabase/admin'
import { emptySendLog, type RecitalSendLog } from '@/lib/recital-send'

/**
 * The recital send log (what went to whom, the program, the audience list):
 * a JSON file in the private `studio_private` storage bucket at
 * recital/{eventId}/send-log.json, service key only. Shared by the review
 * page's server actions (app/actions/recital-send.ts) and the staged send
 * (lib/staged-send-runner.ts), which marks the rest as sent when it goes out.
 * Server code only.
 */

const BUCKET = 'studio_private'
const logPath = (eventId: string) => `recital/${eventId}/send-log.json`

export async function readRecitalLog(eventId: string): Promise<RecitalSendLog> {
    const admin = createAdminClient()
    const { data } = await admin.storage.from(BUCKET).download(logPath(eventId))
    if (!data) return emptySendLog()
    try {
        const parsed = JSON.parse(await data.text())
        return { ...emptySendLog(), ...parsed }
    } catch {
        return emptySendLog()
    }
}

export async function writeRecitalLog(eventId: string, log: RecitalSendLog): Promise<void> {
    const admin = createAdminClient()
    const { error } = await admin.storage
        .from(BUCKET)
        .upload(logPath(eventId), JSON.stringify(log, null, 2), {
            contentType: 'application/json',
            upsert: true,
        })
    if (error) throw new Error(`send-log write failed: ${error.message}`)
}
