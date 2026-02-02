'use server'

import { createClient } from '@supabase/supabase-js'

export async function uploadSheetMusic(formData: FormData, lessonId: string) {
    const file = formData.get('file') as File
    if (!file || !lessonId) {
        return { error: 'Missing file or lesson ID' }
    }

    // Use Service Role Key to bypass RLS
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    )

    const timestamp = Date.now()
    // Sanitize filename to prevent issues
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `sheet_music/${lessonId}/${timestamp}_${safeName}`

    try {
        // 1. Upload File
        const { error: uploadError } = await supabaseAdmin.storage
            .from('lesson_materials')
            .upload(filePath, file, {
                contentType: file.type,
                upsert: true
            })

        if (uploadError) throw uploadError

        // 2. Get Public URL
        const { data } = supabaseAdmin.storage
            .from('lesson_materials')
            .getPublicUrl(filePath)

        return { success: true, url: data.publicUrl }

    } catch (error: any) {
        console.error('Upload failed:', error)
        return { error: error.message }
    }
}
