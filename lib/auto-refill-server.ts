import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { dbStore } from '@/lib/auto-refill-db'
import { autoRefillStripe, type LayerWithCustomer } from '@/lib/auto-refill-stripe'
import { sendCronAlert } from '@/lib/cron-alerts'
import { inRollout, recordRolloutEventFor } from '@/lib/rollouts-server'
import { autoRefillChargedEmail, autoRefillDeclinedEmail } from '@/lib/family-emails'
import { appBaseUrl } from '@/lib/lesson-action-links'
import { decideOffer, type AutoRefillDeps, type AutoRefillOffer, type FamilyEmail } from '@/lib/auto-refill'

/**
 * Auto-refill (lib/auto-refill.ts) wired to the real database, Stripe (or
 * its fake, see lib/auto-refill-stripe.ts), Resend and the Tests card.
 * Server code only: it uses the service key.
 */

const FAMILY_FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'

async function sendFamilyEmail(to: string, email: FamilyEmail): Promise<boolean> {
    if (!process.env.RESEND_API_KEY) return false
    try {
        const { Resend } = await import('resend')
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: FAMILY_FROM, to, subject: email.subject, html: email.html })
        if (error) {
            console.error('[auto-refill] family email failed:', error)
            return false
        }
        return true
    } catch (e) {
        console.error('[auto-refill] family email threw:', e instanceof Error ? e.message : e)
        return false
    }
}

export type ServerDeps = AutoRefillDeps & { stripe: LayerWithCustomer }

export function autoRefillDeps(client: DbClient = createAdminClient(), layer: LayerWithCustomer = autoRefillStripe()): ServerDeps {
    return {
        store: dbStore(client),
        stripe: layer,
        notify: {
            family: sendFamilyEmail,
            studio: email => sendCronAlert(client, email),
            track: (studentId, action) => recordRolloutEventFor('auto_refill', studentId, action),
        },
        emails: { charged: autoRefillChargedEmail, declined: autoRefillDeclinedEmail },
        appUrl: appBaseUrl(),
    }
}

/**
 * Is auto-refill offered to this family, and how (decideOffer)? The monthly
 * price comes from their pricing plan's monthly point, the same place the
 * monthly plan's checkout takes it from. Families outside the rollout's new
 * half get no Stripe calls at all.
 */
export async function offerFor(
    client: DbClient,
    layer: LayerWithCustomer,
    studentId: string,
    { preview = false }: { preview?: boolean } = {},
): Promise<AutoRefillOffer> {
    const { data: p, error } = await client.from('profiles').select('*').eq('id', studentId).maybeSingle()
    if (error || !p) return { show: false, reason: 'no profile' }
    const existing = await dbStore(client).plan(studentId)
    if (existing?.status === 'on') return { show: false, reason: 'already on', on: true }
    if (!(await inRollout('auto_refill', studentId, { preview }))) return { show: false, reason: 'not in this half' }
    if (!p.pricing_plan_id) return { show: false, reason: 'no pricing plan' }

    const { data: points } = await client
        .from('pricing_points')
        .select('id, credits, price, type, stripe_price_id')
        .eq('plan_id', p.pricing_plan_id)
        .eq('type', 'subscription')
        .order('price', { ascending: true })
    const point = (points ?? []).find((pt: any) => Number(pt.credits) > 0 && Number(pt.price) >= 50) as
        | { id: string; credits: number; price: number; stripe_price_id: string | null }
        | undefined
    const monthlyFixedLength = point?.stripe_price_id ? await layer.priceIsFixedLength(point.stripe_price_id) : false
    const running = p.stripe_customer_id ? await layer.runningPlan(p.stripe_customer_id) : null

    return decideOffer({
        inRollout: true,
        role: p.role ?? null,
        status: p.status ?? null,
        credits: Number(p.credits) || 0,
        monthly: point ? { id: point.id, credits: Number(point.credits), price: Number(point.price) } : null,
        monthlyFixedLength,
        running,
        existing,
    })
}
