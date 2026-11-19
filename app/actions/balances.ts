'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/require-admin'
import { loadBalances } from '@/lib/core/balances'
import type { BalanceRow } from '@/lib/balances'

/**
 * Admin: every active family's lessons left, last and next lesson, and next
 * payment, for the Balances tab (#935). Read only.
 */
export async function getBalances(): Promise<{ rows: BalanceRow[]; loadedAt: string } | { error: string }> {
    const denied = await requireAdmin()
    if (denied) return { error: denied }
    try {
        return { rows: await loadBalances(createAdminClient()), loadedAt: new Date().toISOString() }
    } catch (err: any) {
        console.error('[getBalances] failed:', err?.message)
        return { error: err?.message ?? 'Could not load balances' }
    }
}
