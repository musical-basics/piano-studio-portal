'use server'

import { createClient } from '@/lib/supabase/server'
import { getDropboxClient } from '@/lib/zoom-recordings'

export interface DropboxRecording {
    name: string
    path: string
    size: number
    clientModified: string
}


/**
 * Fetch all video recordings inside the student's Dropbox recordings folder
 */
export async function getDropboxRecordings(): Promise<{ recordings: DropboxRecording[]; error?: string }> {
    try {
        const supabase = await createClient()

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { recordings: [], error: 'Unauthorized' }
        }

        // Fetch student's profile to get their dropbox_recording_folder
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('dropbox_recording_folder')
            .eq('id', user.id)
            .single()

        if (profileError || !profile) {
            console.error('Error fetching student profile for Dropbox recordings:', profileError)
            return { recordings: [], error: 'Failed to retrieve profile' }
        }

        if (!profile.dropbox_recording_folder) {
            return { recordings: [], error: 'No Dropbox recording folder configured for your profile. Please contact your instructor.' }
        }

        const dbx = getDropboxClient()
        const path = `/Lesson Recordings/${profile.dropbox_recording_folder}`

        // List files in the folder
        const response = await dbx.filesListFolder({ path })

        // Filter and map entries
        const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv']
        const recordings: DropboxRecording[] = response.result.entries
            .filter((entry): entry is any => entry['.tag'] === 'file')
            .filter((file) => {
                const lowerName = file.name.toLowerCase()
                return videoExtensions.some((ext) => lowerName.endsWith(ext))
            })
            .map((file) => ({
                name: file.name,
                path: file.path_display || file.path_lower,
                size: file.size,
                clientModified: file.client_modified,
            }))

        // Sort by date descending (newest first)
        recordings.sort((a, b) => new Date(b.clientModified).getTime() - new Date(a.clientModified).getTime())

        return { recordings }
    } catch (error: any) {
        console.error('Error fetching Dropbox recordings:', error)
        
        // Handle folder not found specifically
        const summary = error?.error?.error_summary || error?.message || ''
        if (typeof summary === 'string' && summary.includes('path/not_found')) {
            return { recordings: [], error: 'Your recording folder was not found on Dropbox. Please ensure lessons have been recorded.' }
        }
        
        return { recordings: [], error: 'Failed to retrieve recordings from Dropbox. Please try again later.' }
    }
}

/**
 * Generate a temporary streaming/download link for a given Dropbox file path
 */
export async function getDropboxTemporaryLink(path: string): Promise<{ url: string; error?: string }> {
    try {
        const supabase = await createClient()

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { url: '', error: 'Unauthorized' }
        }

        const dbx = getDropboxClient()
        const response = await dbx.filesGetTemporaryLink({ path })

        return { url: response.result.link }
    } catch (error: any) {
        console.error('Error generating Dropbox temporary link:', error)
        return { url: '', error: 'Failed to generate access link for video.' }
    }
}
