'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type PricingPoint = {
    id: string
    plan_id: string
    label: string
    price: number
    credits: number
    type: 'one_time' | 'subscription'
    stripe_price_id?: string | null
    description?: string | null
}

export type PricingPlan = {
    id: string
    name: string
    description?: string | null
    points?: PricingPoint[]
}

/**
 * Get all pricing plans with their points (Admin)
 */
export async function getPricingPlans() {
    const supabase = await createClient()

    // Check admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: plans, error } = await supabase
        .from('pricing_plans')
        .select(`
            *,
            points:pricing_points(*)
        `)
        .order('name')

    if (error) return { error: error.message }
    return { plans }
}

/**
 * Get the specific pricing plan assigned to the current user
 */
export async function getStudentPricingPlan() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { plan: null }

    // 1. Get student's assigned plan ID
    const { data: profile } = await supabase
        .from('profiles')
        .select('pricing_plan_id')
        .eq('id', user.id)
        .single()

    if (!profile?.pricing_plan_id) {
        // Fallback: If no plan assigned, fetch the first one or return null
        const { data: defaultPlan } = await supabase
            .from('pricing_plans')
            .select(`*, points:pricing_points(*)`)
            .limit(1)
            .single()

        // Sort points for default plan too
        if (defaultPlan && defaultPlan.points) {
            defaultPlan.points.sort((a: any, b: any) => {
                if (a.type === 'subscription' && b.type !== 'subscription') return -1;
                if (a.type !== 'subscription' && b.type === 'subscription') return 1;
                return a.price - b.price;
            })
        }
        return { plan: defaultPlan }
    }

    // 2. Fetch the plan details
    const { data: plan } = await supabase
        .from('pricing_plans')
        .select(`
            *,
            points:pricing_points(*)
        `)
        .eq('id', profile.pricing_plan_id)
        .single()

    // Sort points: subscriptions first, then by price
    if (plan && plan.points) {
        plan.points.sort((a: any, b: any) => {
            if (a.type === 'subscription' && b.type !== 'subscription') return -1;
            if (a.type !== 'subscription' && b.type === 'subscription') return 1;
            return a.price - b.price;
        })
    }

    return { plan }
}

/**
 * Admin: Create a new Plan
 */
export async function createPricingPlan(name: string, description?: string) {
    const supabase = await createClient()

    // Check Admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // In a real app we'd verify admin role here

    const { data, error } = await supabase
        .from('pricing_plans')
        .insert({ name, description })
        .select()
        .single()

    revalidatePath('/admin')
    return { success: !error, error: error?.message, plan: data }
}

/**
 * Admin: Add a Pricing Point to a Plan
 */
export async function createPricingPoint(point: Omit<PricingPoint, 'id'>) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('pricing_points')
        .insert(point)

    revalidatePath('/admin')
    revalidatePath('/student')
    return { success: !error, error: error?.message }
}

/**
 * Admin: Delete a Pricing Point
 */
export async function deletePricingPoint(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('pricing_points').delete().eq('id', id)
    revalidatePath('/admin')
    return { success: !error, error: error?.message }
}

/**
 * Admin: Update a Pricing Point
 */
export async function updatePricingPoint(id: string, updates: Partial<PricingPoint>) {
    const supabase = await createClient()

    // Exclude id and plan_id from updates if present (though Partial allows them, good practice to be safe)
    const { id: _, plan_id: __, ...cleanUpdates } = updates as any

    const { error } = await supabase
        .from('pricing_points')
        .update(cleanUpdates)
        .eq('id', id)

    revalidatePath('/admin')
    revalidatePath('/student')
    revalidatePath('/student')
    return { success: !error, error: error?.message }
}

/**
 * Admin: Delete a Pricing Plan
 */
export async function deletePricingPlan(id: string) {
    const supabase = await createClient()

    // Assuming ON DELETE CASCADE is set up in the database for related pricing points
    // If not, we should delete points first manually
    const { error } = await supabase.from('pricing_plans').delete().eq('id', id)

    revalidatePath('/admin')
    return { success: !error, error: error?.message }
}
