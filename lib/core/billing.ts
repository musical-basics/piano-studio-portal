/**
 * Dollar money: fees owed and credits given.
 *
 * Three unrelated things in this codebase are called some form of "credit". They
 * are not interchangeable, and picking the wrong one has real consequences:
 *
 *   1. `profiles.credits` is a count of LESSONS. Writing 25 there hands out 25 free
 *      lessons, not $25. Its ledger is `credit_transactions`.
 *   2. `profiles.balance_due` is dollars the family OWES for ad-hoc items (sheet
 *      music, the late-cancel fee). Settled by its own one-off Stripe Checkout
 *      (`createBalancePaymentSession`). It has no effect on a subscription.
 *   3. The Stripe customer balance is the only thing that reduces a recurring
 *      subscription charge, because Stripe bills the subscription straight off the
 *      price object and never consults our database when it does.
 *
 * So "give them $25 off their next payment" means (3), and is what
 * `issueAccountCreditCore` does. Everything here also writes a
 * `billing_transactions` row so the family can see the money move in the portal.
 */

import type { DbClient } from '@/lib/supabase/admin'
import { stripe, getOrCreateStripeCustomer, getAccountCreditCents } from '@/lib/stripe'
import { sendMessageCore } from '@/lib/core/messages'

export type BillingTransactionKind =
    | 'fee'
    | 'fee_waived'
    | 'balance_payment'
    | 'account_credit'

export type BillingTransaction = {
    id: string
    kind: BillingTransactionKind
    /** Signed cents: positive = the family owes more, negative = they owe less. */
    amount_cents: number
    description: string
    applies_to: 'balance' | 'subscription'
    created_at: string
}

export type RecordBillingTransactionArgs = {
    client: DbClient
    studentId: string
    kind: BillingTransactionKind
    amountCents: number
    description: string
    appliesTo: 'balance' | 'subscription'
    stripeBalanceTxnId?: string | null
    createdBy?: string | null
}

/**
 * Append one row to the ledger.
 *
 * Deliberately non-throwing: every caller has already moved real money by the time
 * it gets here, and losing a display row must never fail (or worse, half-undo) the
 * charge, waiver, payment or credit that actually happened. A failure is logged and
 * shows up as a gap in the portal's billing list, which is recoverable; an
 * exception thrown mid-way through `cancelLessonCore` is not.
 */
export async function recordBillingTransaction({
    client,
    studentId,
    kind,
    amountCents,
    description,
    appliesTo,
    stripeBalanceTxnId,
    createdBy,
}: RecordBillingTransactionArgs): Promise<void> {
    try {
        const { error } = await client.from('billing_transactions').insert({
            student_id: studentId,
            kind,
            amount_cents: Math.round(amountCents),
            description,
            applies_to: appliesTo,
            stripe_balance_txn_id: stripeBalanceTxnId ?? null,
            created_by: createdBy ?? null,
        })
        if (error) {
            // 23505 = the unique index on stripe_balance_txn_id. A replayed admin
            // click or a re-run script is trying to log a credit that is already
            // recorded, which is exactly what that index is there to stop.
            if ((error as any).code === '23505') {
                console.log(`recordBillingTransaction: ${stripeBalanceTxnId} already logged, skipping`)
                return
            }
            console.error('recordBillingTransaction failed (non-blocking):', error)
        }
    } catch (err) {
        console.error('recordBillingTransaction threw (non-blocking):', err)
    }
}

export type IssueAccountCreditArgs = {
    client: DbClient
    studentId: string
    /** Positive, in cents. $25 is 2500. */
    amountCents: number
    /** Shown to the parent verbatim, e.g. "Tournament prize". */
    description: string
    /** Admin profile id, used as the sender of the notification message. */
    createdBy: string
    /** Set false to apply the credit silently (the caller will explain it themselves). */
    notify?: boolean
}

export type IssueAccountCreditResult =
    | { error: string }
    | {
          success: true
          stripeBalanceTxnId: string
          /** The family's total credit after this one, in cents. */
          newCreditCents: number
      }

/**
 * Give a student a dollar credit toward their next subscription payment.
 *
 * Writes to the Stripe customer balance, which Stripe applies automatically to the
 * next invoice it generates. Nothing is written to `profiles.credits` (lessons) or
 * `profiles.balance_due` (ad-hoc charges): neither of those can change what a
 * subscription charges.
 */
export async function issueAccountCreditCore({
    client,
    studentId,
    amountCents,
    description,
    createdBy,
    notify = true,
}: IssueAccountCreditArgs): Promise<IssueAccountCreditResult> {
    const amount = Math.round(amountCents)
    if (!Number.isFinite(amount) || amount <= 0) {
        return { error: 'Credit amount must be greater than $0.00' }
    }
    if (!description.trim()) {
        return { error: 'A reason is required so the family can see what the credit is for' }
    }

    const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id, name, email, stripe_customer_id')
        .eq('id', studentId)
        .single()

    if (profileError || !profile) return { error: 'Student not found' }
    if (!profile.email) return { error: 'Student has no email address, so no Stripe customer can be created' }

    let customerId: string
    try {
        customerId = profile.stripe_customer_id || (await getOrCreateStripeCustomer(studentId, profile.email))
    } catch (err: any) {
        console.error('issueAccountCreditCore: customer lookup failed:', err?.message)
        return { error: `Could not resolve a Stripe customer: ${err?.message ?? 'unknown error'}` }
    }

    let txn: any
    try {
        txn = await stripe.customers.createBalanceTransaction(customerId, {
            // Negative = Stripe owes the customer. This is the credit.
            amount: -amount,
            currency: 'usd',
            description,
            metadata: { studentId, issuedBy: createdBy },
        } as any)
    } catch (err: any) {
        console.error('issueAccountCreditCore: Stripe balance transaction failed:', err?.message)
        return { error: `Stripe rejected the credit: ${err?.message ?? 'unknown error'}` }
    }

    await recordBillingTransaction({
        client,
        studentId,
        kind: 'account_credit',
        amountCents: -amount,
        description,
        appliesTo: 'subscription',
        stripeBalanceTxnId: txn.id,
        createdBy,
    })

    const newCreditCents = txn.ending_balance < 0 ? Math.abs(txn.ending_balance) : 0

    if (notify) {
        await sendMessageCore({
            client,
            senderId: createdBy,
            recipientId: studentId,
            content:
                `A $${(amount / 100).toFixed(2)} credit has been added to your account for "${description}". ` +
                `It comes off your next subscription payment automatically.`,
        })
    }

    return { success: true, stripeBalanceTxnId: txn.id, newCreditCents }
}

export type BillingSummary = {
    /** Dollars owed for ad-hoc items, in cents. */
    balanceDueCents: number
    /** Dollars credited toward the next subscription payment, in cents. */
    accountCreditCents: number
    history: BillingTransaction[]
}

/**
 * Everything the portal's billing section needs for one student.
 *
 * `accountCreditCents` is read live from Stripe rather than from the ledger,
 * because Stripe is where the money actually is: if a credit gets consumed by an
 * invoice, or is adjusted in the Stripe dashboard, the portal should follow that
 * and not a stale local sum. A Stripe outage degrades to "no credit shown" rather
 * than to a broken dashboard.
 */
export async function getBillingSummaryCore(
    client: DbClient,
    studentId: string,
    historyLimit = 20,
): Promise<BillingSummary> {
    const { data: profile } = await client
        .from('profiles')
        .select('balance_due, stripe_customer_id')
        .eq('id', studentId)
        .single()

    const balanceDueCents = Math.round(Number(profile?.balance_due ?? 0) * 100)

    let accountCreditCents = 0
    if (profile?.stripe_customer_id) {
        try {
            accountCreditCents = await getAccountCreditCents(profile.stripe_customer_id)
        } catch (err: any) {
            console.error('getBillingSummaryCore: Stripe credit lookup failed:', err?.message)
        }
    }

    const { data: history, error } = await client
        .from('billing_transactions')
        .select('id, kind, amount_cents, description, applies_to, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(historyLimit)

    if (error) {
        console.error('getBillingSummaryCore: history fetch failed:', error)
    }

    return {
        balanceDueCents,
        accountCreditCents,
        history: (history ?? []) as BillingTransaction[],
    }
}
