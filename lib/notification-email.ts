/**
 * Where outbound notifications for a profile should actually be delivered.
 *
 * `profiles.email` is the login identity: it mirrors the Supabase auth user, so
 * it can't be repointed without also changing how the person signs in. Several
 * student accounts were created with a parent's address, which means every
 * message/lesson notification lands in the parent's inbox.
 *
 * `notification_email` is a delivery-only override the student can set for
 * themselves in Account Settings. When it's set, notifications go there; login
 * still uses `email`.
 *
 * Callers should pass the whole profile row (selected with `*`) so a stale
 * schema that predates the column simply falls back to `email`.
 */
export function resolveNotificationEmail(
    profile: { email?: string | null; notification_email?: string | null } | null | undefined,
): string | null {
    if (!profile) return null
    const override = profile.notification_email?.trim()
    if (override) return override
    return profile.email?.trim() || null
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
    return EMAIL_REGEX.test(value.trim())
}
