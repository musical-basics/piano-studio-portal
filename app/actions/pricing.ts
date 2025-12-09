'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Get all pricing tiers
 */
export async function getPricingTiers() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('pricing_tiers')
        .select('*')
        .order('duration')

    if (error) {
        console.error('Get pricing tiers error:', error)
        return { tiers: [] }
    }

    return { tiers: data }
}

/**
 * Get pricing for a specific duration
 */
export async function getPricingForDuration(duration: number) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('duration', duration)
        .single()

    if (error) {
        console.error('Get pricing error:', error)
        return { pricing: null }
    }

    return { pricing: data }
}

/**
 * Update pricing tier (Admin only)
 */
export async function updatePricingTier(
    duration: number,
    singlePrice: number,
    packPrice: number
) {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        return { error: 'Admin access required' }
    }

    // Update the pricing tier
    const { error } = await supabase
        .from('pricing_tiers')
        .upsert({
            duration,
            single_price: singlePrice,
            pack_price: packPrice,
            updated_at: new Date().toISOString()
        })

    if (error) {
        console.error('Update pricing error:', error)
        return { error: error.message }
    }

    revalidatePath('/admin')
    revalidatePath('/student')

    return { success: true }
}

/**
 * Get current user's profile with lesson duration
 */
export async function getCurrentUserPricing() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { profile: null, pricing: null }
    }

    // Get user's lesson duration
    const { data: profile } = await supabase
        .from('profiles')
        .select('lesson_duration')
        .eq('id', user.id)
        .single()

    const lessonDuration = profile?.lesson_duration || 30

    // Get pricing for that duration
    const { data: pricing } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('duration', lessonDuration)
        .single()

    return {
        lessonDuration,
        pricing
    }
}
