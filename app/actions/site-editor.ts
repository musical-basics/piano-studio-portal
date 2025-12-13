'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export interface SitePage {
    id: string
    html_template: string | null
    script_content: string | null
    variable_values: Record<string, string> | null
    created_at: string
    updated_at: string
}

/**
 * Get a site page by ID
 */
export async function getPage(id: string = 'home'): Promise<{ page: SitePage | null; error?: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('site_pages')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        // If no rows found, return null (not an error for our use case)
        if (error.code === 'PGRST116') {
            return { page: null }
        }
        console.error('Get page error:', error)
        return { page: null, error: error.message }
    }

    return { page: data }
}

/**
 * Save (upsert) a site page
 * Requires admin authentication
 */
export async function savePage(
    id: string,
    htmlTemplate: string,
    scriptContent: string,
    variableValues: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    // Verify user is authenticated and is admin (using regular client)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Not authenticated' }
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'admin') {
        return { success: false, error: 'Admin access required' }
    }

    // Use Service Role client for valid Admin operations to bypass RLS complexities
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

    // Upsert the page
    const { error } = await supabaseAdmin
        .from('site_pages')
        .upsert({
            id,
            html_template: htmlTemplate,
            script_content: scriptContent,
            variable_values: variableValues,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'id'
        })

    if (error) {
        console.error('Save page error:', error)
        return { success: false, error: error.message }
    }

    // Revalidate the public page
    revalidatePath('/')

    return { success: true }
}
