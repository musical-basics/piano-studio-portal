'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImpersonationTarget } from '@/app/actions/impersonate'
import { sendMessageCore } from '@/lib/core/messages'
import { isoToStudioWallClock } from '@/lib/studio-timezone'
import {
    PRACTICE_COMMENT_MAX,
    PRACTICE_MAX_BYTES,
    PRACTICE_MAX_SECONDS,
    PRACTICE_NOTE_MAX,
    deletePracticeObject,
    practiceExtension,
    practiceObjectSize,
    practicePlayUrl,
    practiceStorageConfigured,
    practiceUploadUrl,
} from '@/lib/practice-videos'

// Practice videos (#875). Every action runs with the service key (the table is
// service-role only), so each one checks the caller itself: a server action can
// be called by anyone who has its id.

export type PracticeVideo = {
    id: string
    file_name: string | null
    size_bytes: number | null
    duration_seconds: number | null
    note: string | null
    watched_at: string | null
    comment: string | null
    commented_at: string | null
    created_at: string
}

export type AdminPracticeVideo = PracticeVideo & { student_id: string; student_name: string }

const COLUMNS = 'id, file_name, size_bytes, duration_seconds, note, watched_at, comment, commented_at, created_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The signed-in student, or the student an admin is previewing (read-only for writes). */
async function viewer(): Promise<{ studentId: string; preview: boolean } | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in again.' }
    const { studentId } = await getImpersonationTarget()
    if (studentId) return { studentId, preview: true }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'student') return { error: 'Only students can upload practice videos.' }
    return { studentId: user.id, preview: false }
}

async function adminId(): Promise<string | { error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') return { error: 'Only admins can do that' }
    return user.id
}

// ---------------------------------------------------------------- students

export async function listMyPracticeVideos(): Promise<{ videos: PracticeVideo[] } | { error: string }> {
    const who = await viewer()
    if ('error' in who) return who
    const { data, error } = await createAdminClient()
        .from('practice_videos')
        .select(COLUMNS)
        .eq('student_id', who.studentId)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
    if (error) return { error: 'Could not load your practice videos.' }
    return { videos: (data || []) as PracticeVideo[] }
}

/** Step 1 of an upload: checks the file, saves the row, hands back a signed upload link. */
export async function startPracticeUpload(input: {
    fileName: string
    contentType: string
    sizeBytes: number
    durationSeconds?: number | null
    note?: string
}): Promise<{ id: string; uploadUrl: string; contentType: string } | { error: string }> {
    const who = await viewer()
    if ('error' in who) return who
    if (who.preview) return { error: 'You are previewing this student; uploads are off in preview.' }
    if (!practiceStorageConfigured()) return { error: 'Practice uploads are not set up yet. Please message Lionel.' }

    const ext = practiceExtension(input.contentType, input.fileName)
    if (!ext) return { error: 'Please choose a video file (MP4, MOV or WebM).' }
    const size = Number(input.sizeBytes)
    if (!(size > 0)) return { error: 'That file looks empty.' }
    if (size > PRACTICE_MAX_BYTES) return { error: 'That video is over 1 GB. Please trim it to about 5 minutes.' }
    const duration = input.durationSeconds && Number.isFinite(input.durationSeconds) ? Math.round(input.durationSeconds) : null
    if (duration && duration > PRACTICE_MAX_SECONDS) return { error: 'Please keep practice videos to about 5 minutes.' }

    const id = crypto.randomUUID()
    const key = `${who.studentId}/${id}.${ext}`
    const contentType = input.contentType || `video/${ext === 'mov' ? 'quicktime' : ext}`
    const note = (input.note || '').trim().slice(0, PRACTICE_NOTE_MAX) || null

    const { error } = await createAdminClient().from('practice_videos').insert({
        id,
        student_id: who.studentId,
        r2_key: key,
        file_name: (input.fileName || '').slice(0, 200) || null,
        content_type: contentType,
        size_bytes: size,
        duration_seconds: duration,
        note,
        status: 'uploading',
    })
    if (error) {
        console.error('[practice-videos] could not save the upload row:', error.message)
        return { error: 'Could not start the upload, please try again.' }
    }
    return { id, uploadUrl: await practiceUploadUrl(key), contentType }
}

/** Step 2: the browser finished the PUT. Confirms the file is really there. */
export async function finishPracticeUpload(id: string): Promise<{ ok: true } | { error: string }> {
    const who = await viewer()
    if ('error' in who) return who
    if (who.preview || !UUID.test(id)) return { error: 'Not allowed.' }
    const db = createAdminClient()
    const { data: row } = await db
        .from('practice_videos')
        .select('id, r2_key, status')
        .eq('id', id)
        .eq('student_id', who.studentId)
        .maybeSingle()
    if (!row) return { error: 'That upload was not found.' }
    const size = await practiceObjectSize(row.r2_key).catch(() => null)
    if (!size) return { error: 'The video did not arrive. Please try uploading it again.' }
    const { error } = await db.from('practice_videos').update({ status: 'ready', size_bytes: size }).eq('id', id)
    if (error) return { error: 'Uploaded, but could not be saved. Please try again.' }
    revalidatePath('/admin')
    return { ok: true }
}

/** A one-hour link to play one of the viewer's own videos (or any, for the admin). */
export async function getPracticeVideoUrl(id: string): Promise<{ url: string } | { error: string }> {
    if (!UUID.test(id)) return { error: 'Not found.' }
    const db = createAdminClient()
    const { data: row } = await db.from('practice_videos').select('student_id, r2_key, status').eq('id', id).maybeSingle()
    if (!row || row.status !== 'ready') return { error: 'Not found.' }
    const admin = await adminId()
    if (typeof admin !== 'string') {
        const who = await viewer()
        if ('error' in who) return who
        if (who.studentId !== row.student_id) return { error: 'Not found.' }
    }
    return { url: await practicePlayUrl(row.r2_key) }
}

export async function deleteMyPracticeVideo(id: string): Promise<{ ok: true } | { error: string }> {
    const who = await viewer()
    if ('error' in who) return who
    if (who.preview || !UUID.test(id)) return { error: 'Not allowed.' }
    const db = createAdminClient()
    const { data: row } = await db
        .from('practice_videos')
        .select('r2_key')
        .eq('id', id)
        .eq('student_id', who.studentId)
        .maybeSingle()
    if (!row) return { error: 'Not found.' }
    try {
        await deletePracticeObject(row.r2_key)
    } catch (e) {
        console.error('[practice-videos] R2 delete failed:', e)
        return { error: 'Could not delete it, please try again.' }
    }
    await db.from('practice_videos').delete().eq('id', id)
    revalidatePath('/admin')
    return { ok: true }
}

// ---------------------------------------------------------------- admin

export async function listPracticeVideosForAdmin(): Promise<{ videos: AdminPracticeVideo[] } | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    const { data, error } = await createAdminClient()
        .from('practice_videos')
        .select(`${COLUMNS}, student_id, profiles!practice_videos_student_id_fkey(name, preferred_name)`)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(200)
    if (error) return { error: error.message }
    return {
        videos: (data || []).map((r: any) => ({
            ...r,
            student_name: r.profiles?.preferred_name || r.profiles?.name || 'Student',
            profiles: undefined,
        })),
    }
}

export async function markPracticeVideoWatched(id: string): Promise<{ ok: true } | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    if (!UUID.test(id)) return { error: 'Not found.' }
    await createAdminClient().from('practice_videos').update({ watched_at: new Date().toISOString() }).eq('id', id).is('watched_at', null)
    return { ok: true }
}

/**
 * Saves Lionel's comment and sends it to that family's portal chat (the usual
 * email notice, and a text if they opted in), as "About your practice video from
 * Nov 19:" followed by exactly what he typed.
 */
export async function commentOnPracticeVideo(id: string, comment: string): Promise<{ ok: true } | { error: string }> {
    const admin = await adminId()
    if (typeof admin !== 'string') return admin
    const text = (comment || '').trim()
    if (!text) return { error: 'Type a comment first.' }
    if (text.length > PRACTICE_COMMENT_MAX) return { error: `Please keep it under ${PRACTICE_COMMENT_MAX} characters.` }
    if (!UUID.test(id)) return { error: 'Not found.' }

    const db = createAdminClient()
    const { data: row } = await db.from('practice_videos').select('student_id, created_at, status').eq('id', id).maybeSingle()
    if (!row || row.status !== 'ready') return { error: 'Not found.' }

    const day = isoToStudioWallClock(row.created_at).localDate
    const label = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    const sent = await sendMessageCore({
        client: db,
        senderId: admin,
        recipientId: row.student_id,
        content: `About your practice video from ${label}:\n\n${text}`,
    })
    if (sent.error) return { error: `Not sent: ${sent.error}` }

    const now = new Date().toISOString()
    await db.from('practice_videos').update({ comment: text, commented_at: now }).eq('id', id)
    await db.from('practice_videos').update({ watched_at: now }).eq('id', id).is('watched_at', null)
    revalidatePath('/admin')
    return { ok: true }
}

/** Practice videos still waiting for a comment, for the admin tab's red count. */
export async function countPracticeVideosWaiting(): Promise<number> {
    const admin = await adminId()
    if (typeof admin !== 'string') return 0
    const { count } = await createAdminClient()
        .from('practice_videos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ready')
        .is('comment', null)
    return count ?? 0
}
