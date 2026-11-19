import type { DbClient } from '@/lib/supabase/admin'

/**
 * Label the credit_transactions row the ledger trigger just wrote for a change
 * made over the REST API (the trigger can't see app.credit_source set from
 * there). The same pairing undo-log, no-show and late-log use: this student,
 * these balances, written in the last minute. Never throws: a missing label
 * only makes the History tab say "lessons added" without the why.
 */
export async function labelLedgerChange(
    client: DbClient,
    studentId: string,
    previous: number,
    next: number,
    source: string,
    startedMs: number = Date.now(),
): Promise<void> {
    try {
        const { data: rows } = await client
            .from('credit_transactions')
            .select('id')
            .eq('student_id', studentId)
            .eq('previous_credits', previous)
            .eq('new_credits', next)
            .is('source', null)
            .gte('changed_at', new Date(startedMs - 60_000).toISOString())
            .order('changed_at', { ascending: false })
            .limit(1)
        if (!rows?.[0]) {
            console.error(`[credit-labels] no ledger row to label "${source}" for ${studentId} (${previous} to ${next})`)
            return
        }
        const { error } = await client.from('credit_transactions').update({ source }).eq('id', rows[0].id)
        if (error) console.error('[credit-labels] label not saved:', error.message)
    } catch (e) {
        console.error('[credit-labels] failed:', e)
    }
}
