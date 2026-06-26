'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { logAuthEvent } from '@/lib/logger'

export async function login(formData: FormData) {
    const supabase = await createClient()

    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
        await logAuthEvent(data.email, 'failed_login', 'failure', error.message)
        return { error: error.message }
    }

    await logAuthEvent(data.email, 'login', 'success')

    // Get user profile to determine redirect
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        revalidatePath('/', 'layout')

        if (profile?.role === 'admin') {
            redirect('/admin')
        } else if (profile?.role === 'prospect') {
            redirect('/prospect')
        } else {
            redirect('/student')
        }
    }

    revalidatePath('/', 'layout')
    redirect('/student')
}

export async function logout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/login')
}

export async function sendResetLink(formData: FormData) {
    const supabase = await createClient()
    const email = formData.get('email') as string

    if (!email) {
        return { error: 'Email is required' }
    }

    // Get the origin from headers (handles SSL termination and reverse proxies)
    const headersList = await headers()
    const xForwardedHost = headersList.get('x-forwarded-host')
    const hostHeader = headersList.get('host')
    const xForwardedProto = headersList.get('x-forwarded-proto')
    const originHeader = headersList.get('origin')

    console.log('[VERBOSE PASSWORD RESET LOG - ACTIONS.TS]')
    console.log('  email:', email)
    console.log('  x-forwarded-host:', xForwardedHost)
    console.log('  host:', hostHeader)
    console.log('  x-forwarded-proto:', xForwardedProto)
    console.log('  origin header:', originHeader)

    const host = xForwardedHost || hostHeader || 'localhost:3000'
    const proto = xForwardedProto || (host.includes('localhost') ? 'http' : 'https')
    const origin = `${proto}://${host}`
    const redirectTo = `${origin}/auth/callback?next=/reset-password`

    console.log('  resolved host:', host)
    console.log('  resolved proto:', proto)
    console.log('  resolved origin:', origin)
    console.log('  redirectTo passed to Supabase:', redirectTo)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
    })

    if (error) {
        console.error('  Supabase resetPasswordForEmail error:', error.message)
        return { error: error.message }
    }

    console.log('  Supabase resetPasswordForEmail call successful!')

    await logAuthEvent(email, 'reset_request', 'success')
    return { success: true, message: 'Password reset link sent to your email' }
}

export async function updatePassword(formData: FormData) {
    const supabase = await createClient()
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (!password || !confirmPassword) {
        return { error: 'Both password fields are required' }
    }

    if (password !== confirmPassword) {
        return { error: 'Passwords do not match' }
    }

    if (password.length < 6) {
        return { error: 'Password must be at least 6 characters' }
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
        return { error: error.message }
    }

    // Get user profile to determine redirect
    const { data: { user } } = await supabase.auth.getUser()

    if (user?.email) {
        await logAuthEvent(user.email, 'reset_completed', 'success')
    }

    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        revalidatePath('/', 'layout')

        if (profile?.role === 'admin') {
            redirect('/admin')
        } else if (profile?.role === 'prospect') {
            redirect('/prospect')
        } else {
            redirect('/student')
        }
    }

    revalidatePath('/', 'layout')
    redirect('/student')
}

export async function logResetRequest(email: string) {
    if (!email) return
    await logAuthEvent(email, 'reset_request', 'success')
}

