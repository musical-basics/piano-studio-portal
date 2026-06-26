'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendMessage } from '@/app/messages/actions'
import { LATE_CANCEL_FEE } from '@/lib/billing-policy'

/**
 * Admin: Add an ad-hoc charge to a student's balance
 */
export async function addAdHocCharge(studentId: string, amount: number, description: string) {
    const supabase = await createClient()

    // 1. Verify Admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can add charges' }
    }

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

    // 4. Send a system message to notify the student
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
    const supabase = await createClient()

    // 1. Verify Admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can waive fees' }
    }

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

    // 4. Notify the student that the fee was waived
    await sendMessage(
        studentId,
        `Good news: your $${amount.toFixed(2)} late cancellation fee has been waived.\nUpdated Balance Due: $${newBalance.toFixed(2)}.`
    )

    revalidatePath('/admin')
    revalidatePath('/student')

    return { success: true, message: `Waived $${amount.toFixed(2)} for ${profile.name}` }
}
