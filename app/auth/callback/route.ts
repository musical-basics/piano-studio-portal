import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const next = searchParams.get('next') ?? '/student'

    // Get the correct origin using headers (especially behind proxies)
    const xForwardedHost = request.headers.get('x-forwarded-host')
    const hostHeader = request.headers.get('host')
    const xForwardedProto = request.headers.get('x-forwarded-proto')

    console.log('[VERBOSE AUTH CALLBACK LOG - ROUTE.TS]')
    console.log('  request.url:', request.url)
    console.log('  x-forwarded-host:', xForwardedHost)
    console.log('  host:', hostHeader)
    console.log('  x-forwarded-proto:', xForwardedProto)

    const host = xForwardedHost || hostHeader || 'localhost:3000'
    const proto = xForwardedProto || (host.includes('localhost') ? 'http' : 'https')
    const origin = `${proto}://${host}`

    console.log('  resolved host:', host)
    console.log('  resolved proto:', proto)
    console.log('  resolved origin:', origin)
    console.log('  code present:', !!code)
    console.log('  tokenHash present:', !!tokenHash)
    console.log('  type:', type)
    console.log('  next parameter:', next)

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            const redirectUrl = `${origin}${next}`
            console.log('  Exchange successful! Redirecting to:', redirectUrl)
            return NextResponse.redirect(redirectUrl)
        } else {
            console.error('  exchangeCodeForSession error:', error.message)
        }
    } else if (tokenHash && type) {
        const supabase = await createClient()
        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type,
        })

        if (!error) {
            const redirectUrl = `${origin}${next}`
            console.log('  Token hash verification successful! Redirecting to:', redirectUrl)
            return NextResponse.redirect(redirectUrl)
        } else {
            console.error('  verifyOtp error:', error.message)
        }
    }

    // Return the user to an error page with instructions
    const fallbackUrl = `${origin}/login?error=Could not authenticate`
    console.log('  Exchange failed or no code. Redirecting to fallback:', fallbackUrl)
    return NextResponse.redirect(fallbackUrl)
}
