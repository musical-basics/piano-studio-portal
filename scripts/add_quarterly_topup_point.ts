// Adds a one-time "extra lesson" top-up option to the Quarterly Plan.
//
// Why: the Quarterly Plan had exactly one pricing point, the $211.67 monthly
// installment subscription. createCheckoutSession refuses to sell a second
// subscription to a customer who already has one running (the duplicate-charge
// guard), so a parent mid-quarter had no purchasable option at all: the only
// button in the portal always returned an error. A one-time point is not blocked
// by that guard, so this gives them a real way to buy an extra lesson.
//
// Price is set to the plan's own effective per-lesson rate ($635 / 12 credits =
// $52.92, rounded to $53). Change TOPUP_CENTS below if you want a different rate.
//
// Idempotent: safe to re-run. Updates the row in place if it already exists.
//
// Usage: npx tsx scripts/add_quarterly_topup_point.ts
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const PLAN_NAME = 'Quarterly Plan (30-min Weekly)'
const POINT_LABEL = 'One Extra 30-Minute Lesson'
const POINT_DESCRIPTION = 'Add a single 30-minute lesson on top of your quarterly plan. Credits never expire.'
const TOPUP_CENTS = 5300 // $53.00, matching the plan's $52.92/lesson effective rate
const TOPUP_CREDITS = 1

function reqEnv(k: string): string {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env ${k}`)
  return v
}

async function run() {
  const supabase = createClient(reqEnv('NEXT_PUBLIC_SUPABASE_URL'), reqEnv('SUPABASE_SERVICE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: plan, error: planErr } = await supabase
    .from('pricing_plans')
    .select('id, name')
    .eq('name', PLAN_NAME)
    .single()

  if (planErr || !plan) {
    throw new Error(`Could not find plan "${PLAN_NAME}": ${planErr?.message || 'no row'}`)
  }

  const { data: existing } = await supabase
    .from('pricing_points')
    .select('id')
    .eq('plan_id', plan.id)
    .eq('label', POINT_LABEL)
    .maybeSingle()

  const row = {
    plan_id: plan.id,
    label: POINT_LABEL,
    price: TOPUP_CENTS,
    credits: TOPUP_CREDITS,
    type: 'one_time' as const,
    // one_time points bill through inline price_data, so no stripe_price_id is needed.
    stripe_price_id: null,
    description: POINT_DESCRIPTION,
  }

  if (existing) {
    const { error } = await supabase.from('pricing_points').update(row).eq('id', existing.id)
    if (error) throw new Error(`Update failed: ${error.message}`)
    console.log(`Updated existing top-up point ${existing.id} on "${plan.name}"`)
  } else {
    const { data, error } = await supabase.from('pricing_points').insert(row).select('id').single()
    if (error) throw new Error(`Insert failed: ${error.message}`)
    console.log(`Created top-up point ${data.id} on "${plan.name}"`)
  }

  const { data: points } = await supabase
    .from('pricing_points')
    .select('label, price, credits, type')
    .eq('plan_id', plan.id)
    .order('price')

  console.log(`\n"${plan.name}" now offers:`)
  for (const p of (points || []) as any[]) {
    console.log(`  ${p.label} | $${(p.price / 100).toFixed(2)} | ${p.credits} credit(s) | ${p.type}`)
  }
}

run().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
