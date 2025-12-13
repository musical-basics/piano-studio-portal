'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
    const lessonDay = formData.get('lessonDay') as string || null
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
    const supabaseAdmin = createSupabaseClient(
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
                lesson_duration: lessonDuration,
                lesson_day: lessonDay
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
    const lessonDay = formData.get('lessonDay') as string || null

    // Parse credits if present
    const creditsRaw = formData.get('credits')
    let credits: number | undefined = undefined
    if (creditsRaw !== null && creditsRaw !== '') {
        const parsed = parseInt(creditsRaw as string)
        if (!isNaN(parsed)) {
            credits = parsed
        }
    }


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

    // Create admin client for sensitive updates
    const supabaseAdmin = createSupabaseClient(
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
                lesson_day: lessonDay,
                ...(credits !== undefined && { credits }), // Only update if provided
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

/**
 * Update teacher profile settings (Admin only via UI, checks auth)
 */
export async function updateProfileSettings(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Not authenticated' }
    }

    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const timezone = formData.get('timezone') as string
    const availableHoursStr = formData.get('availableHours') as string
    const studioName = formData.get('studioName') as string
    const password = formData.get('password') as string

    // Create admin client for sensitive updates
    const supabaseAdmin = createSupabaseClient(
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
        const updates: any = {}
        const authUpdates: any = {}

        // 1. Update Profile Data
        if (name) updates.name = name
        if (timezone) updates.timezone = timezone
        if (studioName !== undefined) updates.studio_name = studioName
        if (availableHoursStr) {
            try {
                updates.available_hours = JSON.parse(availableHoursStr)
            } catch (e) {
                console.error("Invalid JSON for available_hours")
            }
        }

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)

        if (profileError) throw new Error('Profile update failed: ' + profileError.message)

        // 2. Update Auth Data (Email/Password)
        if (email && email !== user.email) authUpdates.email = email
        if (password) authUpdates.password = password

        if (Object.keys(authUpdates).length > 0) {
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, authUpdates)
            if (authError) throw new Error('Auth update failed: ' + authError.message)
        }

        revalidatePath('/admin')
        return { success: true, message: 'Settings updated successfully' }

    } catch (error: any) {
        console.error('Update settings error:', error)
        return { error: error.message || 'Failed to update settings' }
    }
}

/**
 * Delete a student (Admin only)
 * Uses SUPABASE_SERVICE_KEY to remove from auth and database
 */
export async function deleteStudent(studentId: string) {
    if (!studentId) {
        return { error: 'Student ID is required' }
    }

    // Create admin client with service key
    const supabaseAdmin = createSupabaseClient(
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
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(studentId)

        if (deleteError) {
            console.error('Delete user error:', deleteError)
            return { error: 'Failed to delete user: ' + deleteError.message }
        }

        revalidatePath('/admin')
        return { success: true, message: 'Student and associated data deleted successfully' }

    } catch (error) {
        console.error('Unexpected error:', error)
        return { error: 'An unexpected error occurred during deletion' }
    }
}
