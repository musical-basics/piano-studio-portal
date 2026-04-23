import { revalidatePath } from 'next/cache'
import type { DbClient } from '@/lib/supabase/admin'

export type StudentStatus = 'active' | 'inactive'

export const ALLOWED_STUDENT_STATUSES: readonly StudentStatus[] = ['active', 'inactive'] as const

export type UpdateStudentStatusResult =
    | { student: Record<string, any> }
    | { error: string }

export async function updateStudentStatusCore(
    client: DbClient,
    studentId: string,
    status: StudentStatus,
): Promise<UpdateStudentStatusResult> {
    if (!ALLOWED_STUDENT_STATUSES.includes(status)) {
        return { error: `status must be one of: ${ALLOWED_STUDENT_STATUSES.join(', ')}` }
    }

    const { data, error } = await client
        .from('profiles')
        .update({ status })
        .eq('id', studentId)
        .eq('role', 'student')
        .select()
        .single()

    if (error) {
        if (error.code === 'PGRST116') {
            return { error: 'Student not found' }
        }
        console.error('updateStudentStatusCore error:', error)
        return { error: error.message }
    }
    if (!data) return { error: 'Student not found' }

    revalidatePath('/admin')
    return { student: data }
}
