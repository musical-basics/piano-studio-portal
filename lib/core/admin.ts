import type { DbClient } from '@/lib/supabase/admin'

export type AdminProfile = {
    id: string
    name: string | null
    email: string | null
    studio_name: string | null
}

export async function getSingleAdmin(client: DbClient): Promise<AdminProfile | null> {
    const { data, error } = await client
        .from('profiles')
        .select('id, name, email, studio_name')
        .eq('role', 'admin')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error) {
        console.error('getSingleAdmin error:', error)
        return null
    }
    return data as AdminProfile
}
