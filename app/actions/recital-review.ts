'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateStudentProfileCore } from '@/lib/core/students'
import { revalidatePath } from 'next/cache'

// Contact-field updates from the recital review page. Admin-gated, then written
// through updateStudentProfileCore (validation) with the service-role client.

export type ContactFieldsInput = {
    parent_contact_name?: string | null
    parent_email?: string | null
    contact_salutation?: string | null
    primary_contact_role?: 'student' | 'parent' | null
}

export async function updateStudentContactFields(studentId: string, fields: ContactFieldsInput) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    if (adminProfile?.role !== 'admin') return { error: 'Only admins can update contact fields' }

    const allowed: Record<string, unknown> = {}
    if ('parent_contact_name' in fields) allowed.parent_contact_name = fields.parent_contact_name || null
    if ('parent_email' in fields) allowed.parent_email = fields.parent_email || null
    if ('contact_salutation' in fields) allowed.contact_salutation = fields.contact_salutation || null
    if ('primary_contact_role' in fields) allowed.primary_contact_role = fields.primary_contact_role || null

    const result = await updateStudentProfileCore(createAdminClient(), studentId, allowed)
    if ('error' in result) return { error: result.error }

    revalidatePath('/admin/recital-review')
    return { success: true }
}
