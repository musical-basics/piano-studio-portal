'use server'

import { requireAdmin } from '@/lib/require-admin'
import { listRecordingsForAdmin, type RecordingsView, type RecordingsViewRow } from '@/lib/admin-recordings'

export type { RecordingsView, RecordingsViewRow }

/** Default window of the admin Recordings view; "Show older" asks for everything. */
const RECENT_DAYS = 90

/**
 * Admin Recordings view (#1916): classroom and Zoom recordings in one list,
 * newest first. all = false: the last 90 days. Uses the service key, so it
 * checks the caller is the admin first.
 */
export async function getRecordingsView(all = false): Promise<RecordingsView | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    try {
        return await listRecordingsForAdmin({ days: all ? null : RECENT_DAYS })
    } catch (err: any) {
        console.error('[recordings] list failed:', err?.message || err)
        return { error: 'Could not load the recordings' }
    }
}
