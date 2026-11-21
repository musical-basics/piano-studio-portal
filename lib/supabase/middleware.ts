import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // #1925: a signed-out visit to an admin or family page (say the chat link in
    // a new-message email) goes to sign-in with the page remembered, so after
    // signing in they land on it, not on the default page.
    const path = request.nextUrl.pathname
    if (!user && (path === '/admin' || path.startsWith('/admin/') || path === '/student' || path.startsWith('/student/'))) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.search = ''
        url.searchParams.set('next', path + request.nextUrl.search)
        const redirect = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c))
        return redirect
    }

    return supabaseResponse
}
