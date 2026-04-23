import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

// Match the rest of the codebase: use an untyped client so `.from(...)` returns
// inferable row types rather than `never`. The generated `Database` type isn't
// compatible with the strict generic here, and threading it in would force
// widespread `as any` casts.
export type DbClient = SupabaseClient

export function createAdminClient(): DbClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (!url || !serviceKey) {
        throw new Error('Supabase service-role client unavailable: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY')
    }
    return createSupabaseClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}
