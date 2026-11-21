/**
 * Where to go after signing in (#1925). A link from an email (say the chat in
 * admin) sends a signed-out reader to /login?next=<that page>; after sign-in
 * they land on it instead of the default page. Only a path on this site counts
 * (never another site, never "//host"), and only one the account may open:
 * /admin pages for the admin, the student pages for families.
 */

export function homeForRole(role: string | null | undefined): string {
    if (role === 'admin') return '/admin'
    if (role === 'prospect') return '/prospect'
    return '/student'
}

export function safeNextPath(raw: unknown, role: string | null | undefined): string | null {
    if (typeof raw !== 'string' || raw.length > 500) return null
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
    if (/[\r\n]/.test(raw)) return null
    const path = raw.split(/[?#]/)[0]
    if (role === 'admin') return path === '/admin' || path.startsWith('/admin/') ? raw : null
    if (path === '/student' || path.startsWith('/student/')) return raw
    if (role === 'prospect' && (path === '/prospect' || path.startsWith('/prospect/'))) return raw
    return null
}

/** Where to send someone after sign-in: the page they asked for, else their home. */
export function afterSignIn(raw: unknown, role: string | null | undefined): string {
    return safeNextPath(raw, role) ?? homeForRole(role)
}
