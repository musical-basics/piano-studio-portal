// One-off onboarding: creates the new Quarterly tuition plan (Stripe price +
// pricing_plans/pricing_points rows) and the student Franz Chen.
//
// Plan: $635/quarter billed as 3 monthly installments of $211.67. Each paid
// installment grants 4 lesson credits (12 per quarter). 30-min weekly lessons.
// Modeled as a monthly recurring Stripe subscription; the existing Stripe
// webhook grants `credits` per checkout + per renewal cycle.
//
// Franz starts at 0 credits. Credits come ONLY from him paying the subscription
// via his student-portal CTA. Idempotent: safe to re-run.
//
// Usage: npx tsx scripts/setup_franz_and_quarterly_plan.ts
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { config } from 'dotenv'
config({ path: '.env.local' })

const PLAN_NAME = 'Quarterly Plan (30-min Weekly)'
const PLAN_DESCRIPTION =
  '$635/quarter billed as 3 monthly payments of $211.67. Each payment adds 4 lesson credits (12 per quarter). Each credit = 1 thirty-minute lesson. Subscription lasts for 3 months. 30-minute weekly lessons.'
const POINT_LABEL = 'Monthly Installment'
const POINT_DESCRIPTION =
  '$211.67/mo · 4 credits (each credit = 1 thirty-minute lesson) · subscription lasts for 3 months ($635 total)'
const INSTALLMENT_CENTS = 21167 // $211.67  (635 / 3, rounded)
const CREDITS_PER_INSTALLMENT = 4
const BILLING_CYCLES = 3 // subscription auto-cancels after 3 payments (one quarter)

const FRANZ = {
  name: 'Franz Chen',
  email: 'shunyingchen5@gmail.com',
  lessonDuration: 30,
  lessonDay: 'Sunday',
  lessonTime: '15:15',
  timezone: 'America/Los_Angeles',
}

function reqEnv(k: string): string {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env ${k}`)
  return v
}

async function run() {
  const supabase = createClient(reqEnv('NEXT_PUBLIC_SUPABASE_URL'), reqEnv('SUPABASE_SERVICE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const stripe = new Stripe(reqEnv('STRIPE_SECRET_KEY'), { apiVersion: '2025-11-17.clover' as any })

  // ---- 1. Stripe: recurring monthly Price (catalog object, charges nobody) ----
  // Find an existing product by name to stay idempotent (list + filter avoids
  // search-query syntax pitfalls with the parenthesized name).
  const productPages = await stripe.products.list({ active: true, limit: 100 })
  let product = productPages.data.find((p) => p.name === PLAN_NAME)
  if (!product) {
    product = await stripe.products.create({
      name: PLAN_NAME,
      description: PLAN_DESCRIPTION,
    })
    console.log(`Stripe product created: ${product.id}`)
  } else {
    console.log(`Stripe product exists: ${product.id}`)
  }

  // Reuse a matching active recurring price if one already exists.
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 })
  let price = prices.data.find(
    (p) =>
      p.unit_amount === INSTALLMENT_CENTS &&
      p.currency === 'usd' &&
      p.recurring?.interval === 'month',
  )
  const priceMetadata = {
    credits: String(CREDITS_PER_INSTALLMENT),
    billing_cycles: String(BILLING_CYCLES), // webhook cancels the sub after this many paid invoices
  }
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: INSTALLMENT_CENTS,
      recurring: { interval: 'month' },
      metadata: priceMetadata,
    })
    console.log(`Stripe price created: ${price.id} ($${(INSTALLMENT_CENTS / 100).toFixed(2)}/mo)`)
  } else {
    await stripe.prices.update(price.id, { metadata: priceMetadata })
    console.log(`Stripe price exists: ${price.id} (metadata synced)`)
  }

  // ---- 2. DB: pricing_plans + pricing_points ----
  let { data: plan } = await supabase
    .from('pricing_plans')
    .select('id')
    .eq('name', PLAN_NAME)
    .maybeSingle()
  if (!plan) {
    const { data, error } = await supabase
      .from('pricing_plans')
      .insert({ name: PLAN_NAME, description: PLAN_DESCRIPTION })
      .select('id')
      .single()
    if (error) throw error
    plan = data
    console.log(`pricing_plans row created: ${plan.id}`)
  } else {
    await supabase.from('pricing_plans').update({ description: PLAN_DESCRIPTION }).eq('id', plan.id)
    console.log(`pricing_plans row exists: ${plan.id} (description synced)`)
  }

  const { data: existingPoint } = await supabase
    .from('pricing_points')
    .select('id, stripe_price_id')
    .eq('plan_id', plan.id)
    .eq('type', 'subscription')
    .maybeSingle()
  if (!existingPoint) {
    const { error } = await supabase.from('pricing_points').insert({
      plan_id: plan.id,
      label: POINT_LABEL,
      price: INSTALLMENT_CENTS,
      credits: CREDITS_PER_INSTALLMENT,
      type: 'subscription',
      stripe_price_id: price.id,
      description: POINT_DESCRIPTION,
    })
    if (error) throw error
    console.log('pricing_points row created (subscription).')
  } else {
    // Keep the stripe_price_id + description in sync.
    await supabase
      .from('pricing_points')
      .update({ stripe_price_id: price.id, description: POINT_DESCRIPTION })
      .eq('id', existingPoint.id)
    console.log(`pricing_points row exists: ${existingPoint.id} (price id + description synced)`)
  }

  // ---- 3. Student: Franz Chen (0 credits; credits come from Stripe) ----
  // Find existing auth user by email.
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  let authUser = list?.users?.find((u) => u.email?.toLowerCase() === FRANZ.email.toLowerCase())
  if (!authUser) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: FRANZ.email,
      password: 'piano123',
      email_confirm: true,
      user_metadata: { name: FRANZ.name },
    })
    if (error) throw error
    authUser = created.user!
    console.log(`Auth user created: ${authUser.id} (temp password: piano123)`)
  } else {
    console.log(`Auth user exists: ${authUser.id}`)
  }

  const publicId = FRANZ.name.toLowerCase().replace(/ /g, '_')
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: authUser.id,
    name: FRANZ.name,
    email: FRANZ.email,
    role: 'student',
    status: 'active',
    balance_due: 0,
    lesson_duration: FRANZ.lessonDuration,
    lesson_day: FRANZ.lessonDay,
    lesson_time: FRANZ.lessonTime,
    timezone: FRANZ.timezone,
    pricing_plan_id: plan.id,
    public_id: publicId,
    // NOTE: credits intentionally omitted — never seed credits here. They are
    // granted by the Stripe webhook when Franz pays his subscription. On a fresh
    // profile the column defaults to 0.
  })
  if (profileErr) throw profileErr
  console.log(`Profile upserted for ${FRANZ.name} (plan assigned, 30-min Sunday 15:15 PT, 0 credits).`)

  // Sanity read-back.
  const { data: check } = await supabase
    .from('profiles')
    .select('name, email, credits, lesson_day, lesson_time, lesson_duration, timezone, pricing_plan_id')
    .eq('id', authUser.id)
    .single()
  console.log('\nFinal state:', JSON.stringify(check, null, 2))
  console.log('\nDone.')
}

run().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
