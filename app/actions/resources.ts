'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Types
export type ResourceCategory = 'Sheet Music' | 'Theory' | 'Scales' | 'Exercises' | 'Recording'

export interface Resource {
    id: string
    title: string
    description: string | null
    category: ResourceCategory
    file_url: string
    file_type: string
    created_at: string
    assignment_count?: number
}

export interface ResourceWithAssignments extends Resource {
    assigned_students: { id: string; name: string }[]
}

/**
 * Get all resources with assignment counts (admin only)
 */
export async function getResources(): Promise<{ resources: Resource[]; error?: string }> {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { resources: [], error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { resources: [], error: 'Only admins can view all resources' }
    }

    // Fetch resources with assignment counts
    const { data: resources, error } = await supabase
        .from('resources')
        .select(`
            *,
            resource_assignments(count)
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching resources:', error)
        return { resources: [], error: error.message }
    }

    // Transform to include assignment_count
    const transformedResources = (resources || []).map(r => ({
        ...r,
        assignment_count: r.resource_assignments?.[0]?.count || 0,
        resource_assignments: undefined
    }))

    return { resources: transformedResources }
}

/**
 * Get a single resource with its assigned students
 */
export async function getResourceWithAssignments(resourceId: string): Promise<{ resource: ResourceWithAssignments | null; error?: string }> {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { resource: null, error: 'Unauthorized' }
    }

    // Fetch resource
    const { data: resource, error: resourceError } = await supabase
        .from('resources')
        .select('*')
        .eq('id', resourceId)
        .single()

    if (resourceError || !resource) {
        return { resource: null, error: 'Resource not found' }
    }

    // Fetch assignments with student names
    const { data: assignments, error: assignmentsError } = await supabase
        .from('resource_assignments')
        .select(`
            student_id,
            profiles!resource_assignments_student_id_fkey(id, name)
        `)
        .eq('resource_id', resourceId)

    if (assignmentsError) {
        console.error('Error fetching assignments:', assignmentsError)
    }

    const assigned_students = (assignments || []).map(a => ({
        id: (a.profiles as any)?.id || a.student_id,
        name: (a.profiles as any)?.name || 'Unknown'
    }))

    return {
        resource: {
            ...resource,
            assigned_students
        }
    }
}

/**
 * Get resources assigned to a specific student
 */
export async function getStudentResources(studentId?: string): Promise<{ resources: Resource[]; error?: string }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { resources: [], error: 'Unauthorized' }
    }

    // Use current user if no studentId provided
    const targetStudentId = studentId || user.id

    // Fetch resources assigned to this student
    const { data: assignments, error } = await supabase
        .from('resource_assignments')
        .select(`
            resource:resources(*)
        `)
        .eq('student_id', targetStudentId)

    if (error) {
        console.error('Error fetching student resources:', error)
        return { resources: [], error: error.message }
    }

    const resources = (assignments || [])
        .map(a => a.resource)
        .filter(Boolean) as Resource[]

    // Sort by category then by title
    resources.sort((a, b) => {
        if (a.category !== b.category) {
            return a.category.localeCompare(b.category)
        }
        return a.title.localeCompare(b.title)
    })

    return { resources }
}

/**
 * Create a new resource and assign to students
 */
export async function createResource(
    data: {
        title: string
        description?: string
        category: ResourceCategory
        file_url: string
        file_type: string
    },
    studentIds: string[]
): Promise<{ success: boolean; resourceId?: string; error?: string }> {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { success: false, error: 'Only admins can create resources' }
    }

    // Create the resource
    const { data: resource, error: createError } = await supabase
        .from('resources')
        .insert({
            title: data.title,
            description: data.description || null,
            category: data.category,
            file_url: data.file_url,
            file_type: data.file_type
        })
        .select()
        .single()

    if (createError || !resource) {
        console.error('Error creating resource:', createError)
        return { success: false, error: createError?.message || 'Failed to create resource' }
    }

    // Assign to students
    if (studentIds.length > 0) {
        const assignments = studentIds.map(studentId => ({
            resource_id: resource.id,
            student_id: studentId
        }))

        const { error: assignError } = await supabase
            .from('resource_assignments')
            .insert(assignments)

        if (assignError) {
            console.error('Error creating assignments:', assignError)
            // Resource was created, but assignments failed
            return { success: true, resourceId: resource.id, error: 'Resource created but some assignments failed' }
        }
    }

    revalidatePath('/admin/library')
    revalidatePath('/student')

    return { success: true, resourceId: resource.id }
}

/**
 * Update a resource's metadata
 */
export async function updateResource(
    resourceId: string,
    data: {
        title?: string
        description?: string
        category?: ResourceCategory
        file_url?: string
        file_type?: string
    }
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { success: false, error: 'Only admins can update resources' }
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.category !== undefined) updateData.category = data.category
    if (data.file_url !== undefined) updateData.file_url = data.file_url
    if (data.file_type !== undefined) updateData.file_type = data.file_type

    const { error } = await supabase
        .from('resources')
        .update(updateData)
        .eq('id', resourceId)

    if (error) {
        console.error('Error updating resource:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/library')
    revalidatePath('/student')

    return { success: true }
}

/**
 * Update resource assignments (replace all assignments)
 */
export async function updateResourceAssignments(
    resourceId: string,
    studentIds: string[]
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { success: false, error: 'Only admins can update assignments' }
    }

    // Delete existing assignments
    const { error: deleteError } = await supabase
        .from('resource_assignments')
        .delete()
        .eq('resource_id', resourceId)

    if (deleteError) {
        console.error('Error deleting old assignments:', deleteError)
        return { success: false, error: deleteError.message }
    }

    // Insert new assignments
    if (studentIds.length > 0) {
        const assignments = studentIds.map(studentId => ({
            resource_id: resourceId,
            student_id: studentId
        }))

        const { error: insertError } = await supabase
            .from('resource_assignments')
            .insert(assignments)

        if (insertError) {
            console.error('Error creating new assignments:', insertError)
            return { success: false, error: insertError.message }
        }
    }

    revalidatePath('/admin/library')
    revalidatePath('/student')

    return { success: true }
}

/**
 * Delete a resource (assignments cascade delete)
 */
export async function deleteResource(resourceId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { success: false, error: 'Only admins can delete resources' }
    }

    const { error } = await supabase
        .from('resources')
        .delete()
        .eq('id', resourceId)

    if (error) {
        console.error('Error deleting resource:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin/library')
    revalidatePath('/student')

    return { success: true }
}

/**
 * Upload a file to Supabase Storage (library bucket)
 */
export async function uploadLibraryFile(formData: FormData): Promise<{ url?: string; error?: string }> {
    const supabase = await createClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Unauthorized' }
    }

    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (adminProfile?.role !== 'admin') {
        return { error: 'Only admins can upload files' }
    }

    const file = formData.get('file') as File
    if (!file) {
        return { error: 'No file provided' }
    }

    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `library/${timestamp}_${sanitizedName}`

    // Upload to lesson_materials bucket (reusing existing bucket)
    const { data, error } = await supabase.storage
        .from('lesson_materials')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        })

    if (error) {
        console.error('Error uploading file:', error)
        return { error: error.message }
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('lesson_materials')
        .getPublicUrl(data.path)

    return { url: publicUrl }
}
