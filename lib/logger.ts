import { createClient } from '@supabase/supabase-js'

/**
 * Log an authentication event to the audit logs.
 * Uses the Service Role key to bypass RLS, ensuring failed logins (unauthenticated) are logged.
 */
export async function logAuthEvent(
    email: string,
    eventType: 'login' | 'failed_login' | 'reset_request' | 'reset_completed',
    status: 'success' | 'failure',
    details?: string
) {
    // Basic validation
    if (!email) return

    try {
        // Create a Supabase client with the Service Role key
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                }
            }
        )

        const { error } = await supabase
            .from('auth_audit_logs')
            .insert({
                user_email: email,
                event_type: eventType,
                status,
                details
            })

        if (error) {
            console.error('Failed to log auth event:', error)
        }
    } catch (error) {
        // Fail silently so we don't block the actual auth flow
        console.error('Error in logAuthEvent:', error)
    }
}
