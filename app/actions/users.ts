'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

/**
 * Create a new student (Admin only)
 * Uses SUPABASE_SERVICE_KEY to create auth user
 */
export async function createStudent(formData: FormData) {
    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const phone = formData.get('phone') as string | null
    const credits = parseInt(formData.get('credits') as string) || 0
    const lessonDuration = parseInt(formData.get('lessonDuration') as string) || 30
    const password = formData.get('password') as string || 'piano123'

    // Validate required fields
    if (!name || !email) {
        return { error: 'Name and email are required' }
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
        return { error: 'Invalid email format' }
    }

    // Validate lesson duration
    if (![30, 45, 60].includes(lessonDuration)) {
        return { error: 'Invalid lesson duration. Must be 30, 45, or 60 minutes.' }
    }

    // Create admin client with service key
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    try {
        // Step 1: Create user in Auth system
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm so they can log in immediately
            user_metadata: { name }
        })

        if (authError) {
            console.error('Auth creation error:', authError)
            if (authError.message.includes('already been registered')) {
                return { error: 'A user with this email already exists' }
            }
            return { error: authError.message }
        }

        if (!authData.user) {
            return { error: 'Failed to create user' }
        }

        // Step 2: Create profile in public.profiles
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: authData.user.id,
                name,
                email,
                phone: phone || null,
                role: 'student',
                credits,
                credits_total: credits,
                balance_due: 0,
                lesson_duration: lessonDuration
            })

        if (profileError) {
            console.error('Profile creation error:', profileError)
            // Try to clean up the auth user if profile creation fails
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
            return { error: 'Failed to create student profile: ' + profileError.message }
        }

        revalidatePath('/admin')

        return {
            success: true,
            message: `Student "${name}" created successfully!`,
            tempPassword: password
        }
    } catch (error) {
        console.error('Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

/**
 * Update an existing student (Admin only)
 * Uses SUPABASE_SERVICE_KEY to update auth and profile
 */
export async function updateStudent(formData: FormData) {
    const id = formData.get('id') as string
    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const lessonDuration = parseInt(formData.get('lessonDuration') as string) || 30

    // Validate required fields
    if (!id) {
        return { error: 'Student ID is required' }
    }

    if (!name || !email) {
        return { error: 'Name and email are required' }
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
        return { error: 'Invalid email format' }
    }

    // Validate lesson duration
    if (![30, 45, 60].includes(lessonDuration)) {
        return { error: 'Invalid lesson duration. Must be 30, 45, or 60 minutes.' }
    }

    // Create admin client with service key
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    try {
        // Step 1: Update user email in Auth system
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
            email,
        })

        if (authError) {
            console.error('Auth update error:', authError)
            // Continue if it's just an email conflict (might be same email)
            if (!authError.message.includes('email already exists')) {
                return { error: authError.message }
            }
        }

        // Step 2: Update profile in public.profiles
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({
                name,
                email,
                lesson_duration: lessonDuration,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)

        if (profileError) {
            console.error('Profile update error:', profileError)
            return { error: 'Failed to update student profile: ' + profileError.message }
        }

        revalidatePath('/admin')

        return {
            success: true,
            message: `Student "${name}" updated successfully!`
        }
    } catch (error) {
        console.error('Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

