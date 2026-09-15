'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEffectiveUserId } from '@/lib/impersonate'
import { revalidatePath } from 'next/cache'
import { sendMessage } from '@/app/messages/actions'
import { LATE_CANCEL_FEE } from '@/lib/billing-policy'
import {
    recordBillingTransaction,
    issueAccountCreditCore,
    getBillingSummaryCore,
    type BillingSummary,
} from '@/lib/core/billing'

export type { BillingSummary }

/**
 * Resolve the calling admin, or return an error.
 *
 * Discriminated on `ok` rather than on the presence of `error`: TypeScript infers
 * the success branch as `{ error?: undefined, ... }`, so an `'error' in auth`
 * check matches both branches and leaves `auth.error` as `string | undefined`.
 */
type AdminAuth =
    | { ok: false; error: string }
    | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; adminId: string }

async function requireAdmin(): Promise<AdminAuth> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Unauthorized' }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') return { ok: false, error: 'Only admins can do that' }
    return { ok: true, supabase, adminId: user.id }
}

/**
 * Admin: Add an ad-hoc charge to a student's balance
 */
export async function addAdHocCharge(studentId: string, amount: number, description: string) {
    const auth = await requireAdmin()
    if (!auth.ok) return { error: auth.error }
    const { supabase, adminId } = auth

    // 2. Get current balance
    const { data: profile } = await supabase
        .from('profiles')
        .select('balance_due, name')
        .eq('id', studentId)
        .single()

    if (!profile) return { error: 'Student not found' }

    // 3. Update Balance
    const newBalance = Number(profile.balance_due) + amount

    const { error } = await supabase
        .from('profiles')
        .update({ balance_due: newBalance })
        .eq('id', studentId)

    if (error) return { error: error.message }

    // 4. Record it so the family can see what the charge was for in the portal,
    //    rather than just watching the lump sum change.
    await recordBillingTransaction({
        client: createAdminClient(),
        studentId,
        kind: 'fee',
        amountCents: Math.round(amount * 100),
        description,
        appliesTo: 'balance',
        createdBy: adminId,
    })

    // 5. Send a system message to notify the student
    await sendMessage(
        studentId,
        `New Charge Added: $${amount.toFixed(2)} for "${description}".\nCurrent Balance Due: $${newBalance.toFixed(2)}.`
    )

    revalidatePath('/admin')
    revalidatePath('/student')

    return { success: true, message: `Charged $${amount} to ${profile.name}` }
}

/**
 * Admin: Waive a late-cancellation fee (or any amount) from a student's
 * balance. Subtracts from balance_due, clamped at $0, and notifies the student.
 * Use this to reverse the automatic $15 late-cancel fee on a case-by-case basis.
 */
export async function waiveLateCancelFee(studentId: string, amount: number = LATE_CANCEL_FEE) {
    const auth = await requireAdmin()
    if (!auth.ok) return { error: auth.error }
    const { supabase, adminId } = auth

    // 2. Get current balance
    const { data: profile } = await supabase
        .from('profiles')
        .select('balance_due, name')
        .eq('id', studentId)
        .single()

    if (!profile) return { error: 'Student not found' }

    // 3. Update Balance (never go below $0)
    const newBalance = Math.max(0, Number(profile.balance_due) - amount)

    const { error } = await supabase
        .from('profiles')
        .update({ balance_due: newBalance })
        .eq('id', studentId)

    if (error) return { error: error.message }

    // 4. Log the actual movement, which the $0 clamp above can make smaller than
    //    `amount` (waiving $15 against a $5 balance only moves $5).
    await recordBillingTransaction({
        client: createAdminClient(),
        studentId,
        kind: 'fee_waived',
        amountCents: -Math.round((Number(profile.balance_due) - newBalance) * 100),
        description: 'Late cancellation fee waived',
        appliesTo: 'balance',
        createdBy: adminId,
    })

    // 5. Notify the student that the fee was waived
    await sendMessage(
        studentId,
        `Good news: your $${amount.toFixed(2)} late cancellation fee has been waived.\nUpdated Balance Due: $${newBalance.toFixed(2)}.`
    )

    revalidatePath('/admin')
    revalidatePath('/student')

    return { success: true, message: `Waived $${amount.toFixed(2)} for ${profile.name}` }
}

/**
 * Admin: give a student a dollar credit toward their next subscription payment.
 *
 * This is NOT `addAdHocCharge` with a negative number. A negative balance_due
 * would sit in a pot the family settles through a separate one-off checkout and
 * would never reduce what Stripe bills for the subscription. The credit has to go
 * on the Stripe customer balance, which is what issueAccountCreditCore does.
 */
export async function issueAccountCredit(studentId: string, amount: number, description: string) {
    const auth = await requireAdmin()
    if (!auth.ok) return { error: auth.error }
    const { adminId } = auth

    const result = await issueAccountCreditCore({
        client: createAdminClient(),
        studentId,
        amountCents: Math.round(amount * 100),
        description,
        createdBy: adminId,
    })

    if ('error' in result) return { error: result.error }

    revalidatePath('/admin')
    revalidatePath('/student')

    return {
        success: true,
        message: `Credited $${amount.toFixed(2)}, their next payment drops by this amount`,
        newCreditCents: result.newCreditCents,
    }
}

/**
 * Portal: the signed-in student's fees, credits and history.
 *
 * Reads through the service-role client scoped to the effective user id, matching
 * how the rest of the student-facing actions handle admin impersonation. The
 * ledger table itself is RLS deny-all, so this action is the only way in.
 */
export async function getBillingSummary(): Promise<BillingSummary> {
    const empty: BillingSummary = { balanceDueCents: 0, accountCreditCents: 0, history: [] }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return empty

    const effectiveUserId = await resolveEffectiveUserId(supabase, user.id)

    try {
        return await getBillingSummaryCore(createAdminClient(), effectiveUserId)
    } catch (err: any) {
        console.error('[getBillingSummary] failed:', err?.message)
        return empty
    }
}

/**
 * Admin: the same summary for any student, for the roster/profile view.
 */
export async function getBillingSummaryForStudent(studentId: string): Promise<BillingSummary | { error: string }> {
    const auth = await requireAdmin()
    if (!auth.ok) return { error: auth.error }

    try {
        return await getBillingSummaryCore(createAdminClient(), studentId)
    } catch (err: any) {
        console.error('[getBillingSummaryForStudent] failed:', err?.message)
        return { error: err?.message ?? 'Lookup failed' }
    }
}
