import type { DbClient } from '@/lib/supabase/admin'
import { resolveNotificationEmail } from '@/lib/notification-email'
import { loadRolloutStages } from '@/lib/rollouts'
import { OPEN_STATUSES, type AutoRefillStore, type Family, type PlanRow, type RefillRow } from '@/lib/auto-refill'

/**
 * The auto-refill tables (migration 20261121090000) for lib/auto-refill.ts.
 * `client` must be the service-role client. Every change that could race
 * (two cron runs, the webhook and the return page) is a conditional update:
 * it only applies to the row as it was read.
 */

function fail(what: string, error: { message: string } | null): never {
    throw new Error(`auto-refill ${what}: ${error?.message ?? 'unknown error'}`)
}

export function dbStore(client: DbClient): AutoRefillStore {
    const plans = () => client.from('auto_refill_plans')
    const refills = () => client.from('auto_refills')

    return {
        async plan(studentId) {
            const { data, error } = await plans().select('*').eq('student_id', studentId).maybeSingle()
            if (error) fail('plan read', error)
            return (data as PlanRow) ?? null
        },

        async plansOn() {
            const { data, error } = await plans().select('*').eq('status', 'on')
            if (error) fail('plans read', error)
            return (data ?? []) as PlanRow[]
        },

        async family(studentId): Promise<Family | null> {
            const { data, error } = await client.from('profiles').select('*').eq('id', studentId).maybeSingle()
            if (error) fail('profile read', error)
            if (!data) return null
            const p = data as any
            return {
                id: p.id,
                name: p.name ?? null,
                parentName: p.parent_contact_name ?? null,
                email: resolveNotificationEmail(p),
                credits: Number(p.credits) || 0,
                status: p.status ?? null,
                role: p.role ?? null,
                stripeCustomerId: p.stripe_customer_id ?? null,
            }
        },

        async openRefill(studentId) {
            const { data, error } = await refills().select('*').eq('student_id', studentId).in('status', OPEN_STATUSES).maybeSingle()
            if (error) fail('open refill read', error)
            return (data as RefillRow) ?? null
        },

        async refill(id) {
            const { data, error } = await refills().select('*').eq('id', id).maybeSingle()
            if (error) fail('refill read', error)
            return (data as RefillRow) ?? null
        },

        async refillByPaymentIntent(paymentIntentId) {
            const { data, error } = await refills().select('*').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
            if (error) fail('refill read', error)
            return (data as RefillRow) ?? null
        },

        async lastRunOutAfter(studentId, sinceIso) {
            const { data, error } = await client
                .from('credit_transactions')
                .select('changed_at')
                .eq('student_id', studentId)
                .lt('delta', 0)
                .lte('new_credits', 0)
                .gt('changed_at', sinceIso)
                .order('changed_at', { ascending: false })
                .limit(1)
            if (error) fail('ledger read', error)
            return (data?.[0] as { changed_at: string } | undefined)?.changed_at ?? null
        },

        async paidSince(studentId, sinceIso) {
            const { data, error } = await refills()
                .select('id')
                .eq('student_id', studentId)
                .eq('kind', 'refill')
                .eq('status', 'paid')
                .gte('paid_at', sinceIso)
                .limit(1)
            if (error) fail('recent refill read', error)
            return (data ?? []).length > 0
        },

        async insertDueRefill(plan, triggeredAt) {
            const { data, error } = await refills()
                .insert({
                    student_id: plan.student_id,
                    kind: 'refill',
                    status: 'due',
                    credits: plan.credits,
                    price_cents: plan.price_cents,
                    amount_cents: plan.price_cents,
                    triggered_at: triggeredAt,
                })
                .select('*')
                .single()
            if (error) {
                // 23505: the one-open-refill index; another run made it first.
                if ((error as any).code === '23505') return null
                fail('refill insert', error)
            }
            return data as RefillRow
        },

        async insertStartRefill(r) {
            const now = new Date().toISOString()
            const { error } = await refills().insert({
                student_id: r.studentId,
                kind: 'start',
                status: 'paid',
                credits: r.credits,
                price_cents: r.priceCents,
                amount_cents: r.amountCents,
                account_credit_cents: r.accountCreditCents,
                checkout_session_id: r.sessionId,
                stripe_payment_intent_id: r.paymentIntentId,
                attempts: 1,
                paid_at: now,
            })
            if (error && (error as any).code !== '23505') fail('start insert', error)
            const { data, error: readError } = await refills().select('*').eq('checkout_session_id', r.sessionId).single()
            if (readError) fail('start read', readError)
            return data as RefillRow
        },

        async openRefills() {
            const { data, error } = await refills().select('*').in('status', OPEN_STATUSES).order('created_at', { ascending: true })
            if (error) fail('open refills read', error)
            return (data ?? []) as RefillRow[]
        },

        async paidUncredited() {
            const { data, error } = await refills().select('*').eq('status', 'paid').is('credited_at', null)
            if (error) fail('uncredited read', error)
            return (data ?? []) as RefillRow[]
        },

        async transition(r, patch) {
            const { data, error } = await refills()
                .update(patch)
                .eq('id', r.id)
                .eq('status', r.status)
                .eq('updated_at', r.updated_at)
                .select('*')
            if (error) {
                if ((error as any).code === '23505') return null
                fail('refill update', error)
            }
            return ((data ?? [])[0] as RefillRow) ?? null
        },

        async credit(refillId) {
            const { data, error } = await client.rpc('credit_auto_refill', { p_refill: refillId })
            if (error) fail('credit', error)
            const row = (Array.isArray(data) ? data[0] : data) as { previous_credits: number; new_credits: number; already: boolean }
            return { previous: row.previous_credits, next: row.new_credits, already: row.already }
        },

        async applyStart(p) {
            const now = new Date().toISOString()
            const fields = {
                status: 'on',
                stripe_customer_id: p.customerId,
                payment_method_id: p.paymentMethodId,
                card_brand: p.card?.brand ?? null,
                card_last4: p.card?.last4 ?? null,
                credits: p.credits,
                price_cents: p.priceCents,
                pricing_point_id: p.pointId,
                started_at: now,
                armed_at: now,
                start_session_id: p.sessionId,
                ended_subscription_id: p.endedSubscriptionId,
                stopped_at: null,
                stopped_by: null,
                updated_at: now,
            }
            const { data: inserted, error: insertError } = await plans()
                .insert({ student_id: p.studentId, ...fields })
                .select('*')
            if (!insertError) return ((inserted ?? [])[0] as PlanRow) ?? null
            if ((insertError as any).code !== '23505') fail('plan insert', insertError)
            // The row exists (on before, or off): apply this checkout once.
            const { data, error } = await plans()
                .update(fields)
                .eq('student_id', p.studentId)
                .or(`start_session_id.is.null,start_session_id.neq.${p.sessionId}`)
                .select('*')
            if (error) fail('plan update', error)
            return ((data ?? [])[0] as PlanRow) ?? null
        },

        async applyCard(p) {
            const { data, error } = await plans()
                .update({
                    payment_method_id: p.paymentMethodId,
                    card_brand: p.card?.brand ?? null,
                    card_last4: p.card?.last4 ?? null,
                    card_session_id: p.sessionId,
                    updated_at: new Date().toISOString(),
                })
                .eq('student_id', p.studentId)
                .or(`card_session_id.is.null,card_session_id.neq.${p.sessionId}`)
                .select('*')
            if (error) fail('card update', error)
            return ((data ?? [])[0] as PlanRow) ?? null
        },

        async turnOff(studentId, by) {
            const now = new Date().toISOString()
            const { data, error } = await plans()
                .update({ status: 'off', stopped_at: now, stopped_by: by, updated_at: now })
                .eq('student_id', studentId)
                .eq('status', 'on')
                .select('*')
            if (error) fail('turn off', error)
            return ((data ?? [])[0] as PlanRow) ?? null
        },

        async rearm(studentId) {
            const now = new Date().toISOString()
            const { error } = await plans().update({ armed_at: now, updated_at: now }).eq('student_id', studentId)
            if (error) fail('re-arm', error)
        },

        async chargingAllowed() {
            const stages = await loadRolloutStages(client)
            return stages.auto_refill !== 'off'
        },
    }
}
