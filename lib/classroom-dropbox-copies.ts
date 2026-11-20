import type { Dropbox } from 'dropbox'
import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { sendCronAlert } from '@/lib/cron-alerts'
import { getDropboxClient, MIN_LESSON_RECORDING_MINUTES } from '@/lib/zoom-recordings'
import { isoToStudioWallClock } from '@/lib/studio-timezone'
import { LESSON_KIND, MIN_BYTES_WITHOUT_START, recordingMinutes, recordingStampMs, UUID_RE } from '@/lib/classroom-recordings'

/**
 * Classroom recordings copied into the student's Dropbox folder (Lionel's #726),
 * so every lesson video sits in one place: "/Lesson Recordings/<folder>/", next
 * to the Zoom ones, named "<YYYY-MM-DD> - Classroom Lesson.mp4" (the date the
 * recording STARTED, Eastern; " (2)" when that name is taken).
 *
 * The files are 0.4 to 1.3 GB, so the portal never downloads them: Dropbox
 * fetches the public R2 URL itself (files/save_url, an async job) and later
 * runs check on the job. State is one row per recording in
 * classroom_recording_dropbox_copies (unique on recording and url, so a file is
 * never copied twice): pending -> running -> done | failed, or skipped.
 *
 * Runs from the classroom-recordings cron (every 30 minutes) and the classroom's
 * webhook, after the attach step. It copies every lesson-length recording of a
 * student with a Dropbox folder, attached to a lesson or not. Skipped: under 5
 * minutes (no-shows) or under 100 MB (empty room or test), guest/test ids (not
 * a profile id), students without a folder (picked up once a folder is set).
 *
 * Families are not emailed about these copies: the classroom hand-off already
 * sends "your recording is ready", and the new-recordings cron ignores files
 * with this name (isClassroomCopyName).
 *
 * Lionel is (#952): when a copy gives up (status 'failed': MAX_ATTEMPTS tries
 * used, or the file in Dropbox came out the wrong size), the end of the run
 * emails the studio inbox once, naming the student, the recording date and the
 * error (alertGaveUpCopies). alerted_at makes it once per row; an email that
 * could not be sent is tried again on the next run.
 */

export const COPIES_TABLE = 'classroom_recording_dropbox_copies'
const DEST_ROOT = '/Lesson Recordings'
const MINUTE = 60_000
/** Dropbox job attempts per recording before giving up. */
const MAX_ATTEMPTS = 3
/** New Dropbox jobs per run; the rest wait for the next run. */
const STARTS_PER_RUN = 25
/** A row claimed but left without a job id (run died mid-way) is looked at again after this. */
const CLAIM_STALE_MS = 15 * MINUTE
/** Dropbox gives a save_url transfer 15 minutes; a job "in progress" this long is lost. */
const JOB_STALE_MS = 3 * 60 * MINUTE

export const CLASSROOM_COPY_LABEL = 'Classroom Lesson'
const COPY_NAME_RE = / - Classroom Lesson(?: \(\d+\))?\.[a-z0-9]+$/i

/** True for the files this module puts in a student's Dropbox folder. */
export function isClassroomCopyName(name: string): boolean {
    return COPY_NAME_RE.test(name)
}

/** The day the recording started (egress stamp), else the day it was saved, in the studio's zone. */
export function classroomCopyDate(rec: { url: string; created_at: string; r2_key?: string | null }): string {
    const ms = recordingStampMs(rec) ?? Date.parse(rec.created_at)
    return isoToStudioWallClock(new Date(ms).toISOString()).localDate
}

function extensionOf(url: string): string {
    const m = url.match(/\.([a-z0-9]{2,4})(?:[?#].*)?$/i)
    return m ? `.${m[1].toLowerCase()}` : '.mp4'
}

/** "<date> - Classroom Lesson.mp4", or " (2)", " (3)"... when taken (names compared case-insensitively). */
export function freeCopyName(date: string, ext: string, taken: Set<string>): string {
    const base = `${date} - ${CLASSROOM_COPY_LABEL}`
    let name = `${base}${ext}`
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`
    return name
}

type RecordingRow = { id: string; student_id: string; url: string; created_at: string; size_bytes: number | null }
type CopyRow = {
    id: string
    recording_id: string
    url: string
    student_id: string
    dropbox_path: string | null
    job_id: string | null
    status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
    size_bytes: number | null
    attempts: number
    started_at: string | null
}
type FileMeta = { size: number; path: string }

export type CopyItem = { recordingId: string; studentId: string; path: string; bytes: number | null }

export type CopySyncResult = {
    /** New recordings added to the queue this run. */
    queued: number
    /** Dropbox jobs started this run (dry run: would start). */
    started: CopyItem[]
    /** Copies finished and size-checked this run. */
    done: CopyItem[]
    /** Gave up (after retries) or a size mismatch. */
    failed: { recordingId: string; error: string }[]
    /** Dropbox jobs still running. */
    inProgress: number
    /** Queued but not started this run (file not in R2 yet, per-run cap). */
    waiting: { recordingId: string; reason: string }[]
    /** Not copied at all (too short, not a student, no folder). */
    skipped: { recordingId: string; reason: string }[]
    /** Students with recordings to copy but no Dropbox folder. */
    noFolder: string[]
    /** Recordings whose given-up copy was emailed to the studio this run (#952). */
    alerted: string[]
}

/** One studio email (the shape sendCronAlert takes). */
export type CopyAlertEmail = { subject: string; lines: string[]; footer: string }

export type CopySyncOptions = {
    client?: DbClient
    dbx?: Dropbox
    /** Only this student's recordings and copies. */
    studentId?: string
    /** How far back to queue recordings, by save time. Default 14 days. Queued copies are always followed up. */
    days?: number
    /** Report what would be copied (file -> path) without queuing or starting anything. */
    dryRun?: boolean
    log?: (msg: string) => void
    now?: Date
    /** R2 size by HEAD; injectable for tests. */
    headSize?: (url: string) => Promise<number | null>
    /** Sends the "copy gave up" email (#952); true when sent. Default sendCronAlert to the studio inbox. */
    alert?: (email: CopyAlertEmail) => Promise<boolean>
}

async function headSizeOf(url: string): Promise<number | null> {
    try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000), cache: 'no-store' })
        if (!res.ok) return null
        const len = Number(res.headers.get('content-length') || 0)
        return len > 0 ? len : null
    } catch {
        return null
    }
}

function dropboxError(err: any): string {
    const summary = err?.error?.error_summary ?? err?.error?.error ?? err?.message ?? err
    return typeof summary === 'string' ? summary : JSON.stringify(summary)
}

function folderOf(path: string): string {
    return path.slice(0, path.lastIndexOf('/')).toLowerCase()
}

export async function syncClassroomDropboxCopies(opts: CopySyncOptions = {}): Promise<CopySyncResult> {
    const supabase = opts.client ?? createAdminClient()
    const log = opts.log ?? (() => {})
    const now = opts.now ?? new Date()
    const days = opts.days ?? 14
    const dryRun = !!opts.dryRun
    const headSize = opts.headSize ?? headSizeOf
    let dbxClient = opts.dbx ?? null
    const dbx = () => (dbxClient ??= getDropboxClient())
    const result: CopySyncResult = { queued: 0, started: [], done: [], failed: [], inProgress: 0, waiting: [], skipped: [], noFolder: [], alerted: [] }
    const noFolder = new Set<string>()

    // ---- 1. Queue recordings that have no copy row yet.
    let recQuery = supabase
        .from('classroom_recordings')
        .select('id, student_id, url, created_at, size_bytes')
        .eq('kind', LESSON_KIND)
        .gte('created_at', new Date(now.getTime() - days * 24 * 60 * MINUTE).toISOString())
        .order('created_at', { ascending: true })
    if (opts.studentId) recQuery = recQuery.eq('student_id', opts.studentId)
    const { data: recRows, error: recError } = await recQuery
    if (recError) throw new Error(`classroom_recordings query failed: ${recError.message}`)
    const recordings = ((recRows || []) as RecordingRow[]).filter(r => r.url && UUID_RE.test(r.student_id || ''))

    let copyQuery = supabase.from(COPIES_TABLE).select('recording_id, url, dropbox_path')
    if (opts.studentId) copyQuery = copyQuery.eq('student_id', opts.studentId)
    const { data: copyRows, error: copyError } = await copyQuery
    if (copyError) throw new Error(`${COPIES_TABLE} query failed: ${copyError.message}`)
    const haveRecording = new Set((copyRows || []).map(r => r.recording_id as string))
    const haveUrl = new Set((copyRows || []).map(r => r.url as string))

    const studentIds = [...new Set(recordings.map(r => r.student_id))]
    const profiles = new Map<string, { role: string | null; folder: string | null }>()
    if (studentIds.length > 0) {
        const { data, error } = await supabase.from('profiles').select('id, role, dropbox_recording_folder').in('id', studentIds)
        if (error) throw new Error(`profiles query failed: ${error.message}`)
        for (const p of data || []) profiles.set(p.id, { role: p.role, folder: p.dropbox_recording_folder })
    }

    const newRows: CopyRow[] = []
    for (const rec of recordings) {
        if (haveRecording.has(rec.id) || haveUrl.has(rec.url)) continue
        const profile = profiles.get(rec.student_id)
        if (!profile || profile.role !== 'student') {
            result.skipped.push({ recordingId: rec.id, reason: 'not a student profile' })
            continue
        }
        if (!profile.folder) {
            noFolder.add(rec.student_id)
            result.skipped.push({ recordingId: rec.id, reason: 'student has no Dropbox folder' })
            continue
        }
        const minutes = recordingMinutes(rec)
        if (minutes !== null && minutes < MIN_LESSON_RECORDING_MINUTES) {
            result.skipped.push({ recordingId: rec.id, reason: `under ${MIN_LESSON_RECORDING_MINUTES} min` })
            continue
        }
        haveUrl.add(rec.url)
        const row = { recording_id: rec.id, url: rec.url, student_id: rec.student_id, status: 'pending' as const }
        if (dryRun) {
            newRows.push({ ...row, id: `dry-${rec.id}`, dropbox_path: null, job_id: null, size_bytes: null, attempts: 0, started_at: null })
            result.queued++
            continue
        }
        const { error } = await supabase.from(COPIES_TABLE).insert(row)
        // 23505: queued meanwhile by the other trigger (webhook vs cron). Fine.
        if (error && error.code !== '23505') {
            log(`could not queue ${rec.id}: ${error.message}`)
            continue
        }
        if (!error) {
            result.queued++
            log(`queued ${rec.id} for Dropbox`)
        }
    }
    result.noFolder = [...noFolder]

    // ---- 2. Start pending copies (dry run: plan them).
    let pendingQuery = supabase
        .from(COPIES_TABLE)
        .select('id, recording_id, url, student_id, dropbox_path, job_id, status, size_bytes, attempts, started_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
    if (opts.studentId) pendingQuery = pendingQuery.eq('student_id', opts.studentId)
    const { data: pendingRows, error: pendingError } = await pendingQuery
    if (pendingError) throw new Error(`${COPIES_TABLE} pending query failed: ${pendingError.message}`)
    const pending = [...((pendingRows || []) as CopyRow[]), ...newRows]

    if (pending.length > 0) {
        // Dates come from the recording; the folder from the profile as it is now.
        const recIds = pending.map(p => p.recording_id)
        const { data: recInfo, error: recInfoError } = await supabase.from('classroom_recordings').select('id, url, created_at').in('id', recIds)
        if (recInfoError) throw new Error(`classroom_recordings lookup failed: ${recInfoError.message}`)
        const recById = new Map((recInfo || []).map(r => [r.id as string, r as { id: string; url: string; created_at: string }]))
        const pendingStudents = [...new Set(pending.map(p => p.student_id))].filter(id => !profiles.has(id))
        if (pendingStudents.length > 0) {
            const { data } = await supabase.from('profiles').select('id, role, dropbox_recording_folder').in('id', pendingStudents)
            for (const p of data || []) profiles.set(p.id, { role: p.role, folder: p.dropbox_recording_folder })
        }

        // Names already used in each folder: what Dropbox has plus copies in flight.
        const { data: claimedRows } = await supabase.from(COPIES_TABLE).select('dropbox_path').not('dropbox_path', 'is', null)
        const claimed = (claimedRows || []).map(r => r.dropbox_path as string)
        const takenByFolder = new Map<string, Set<string>>()
        const takenIn = async (folderPath: string): Promise<Set<string>> => {
            const key = folderPath.toLowerCase()
            let taken = takenByFolder.get(key)
            if (taken) return taken
            taken = new Set(claimed.filter(p => folderOf(p) === key).map(p => p.slice(p.lastIndexOf('/') + 1).toLowerCase()))
            for (const name of await listFolderNames(dbx(), folderPath)) taken.add(name.toLowerCase())
            takenByFolder.set(key, taken)
            return taken
        }

        let starts = 0
        for (const row of pending) {
            const rec = recById.get(row.recording_id)
            const folder = profiles.get(row.student_id)?.folder
            if (!rec) {
                result.waiting.push({ recordingId: row.recording_id, reason: 'recording row gone' })
                continue
            }
            if (!folder) {
                noFolder.add(row.student_id)
                result.waiting.push({ recordingId: row.recording_id, reason: 'student has no Dropbox folder now' })
                continue
            }
            if (starts >= STARTS_PER_RUN) {
                result.waiting.push({ recordingId: row.recording_id, reason: 'per-run limit, next run' })
                continue
            }
            const size = await headSize(row.url)
            if (size === null) {
                result.waiting.push({ recordingId: row.recording_id, reason: 'file not in R2 yet' })
                continue
            }
            // Real classroom video runs ~20 MB a minute, so a file this small is an
            // empty room or a test even when it ran 5+ minutes (two 6-minute, 6 MB
            // files from the egress's first day), or an old unstamped fragment.
            if (size < MIN_BYTES_WITHOUT_START) {
                const reason = `too small to be a lesson (${Math.round(size / 1e6)} MB)`
                result.skipped.push({ recordingId: row.recording_id, reason })
                if (!dryRun) await updateRow(supabase, row.id, { status: 'skipped', size_bytes: size, error: reason, finished_at: now.toISOString() })
                continue
            }

            let path = row.dropbox_path
            if (!path) {
                const folderPath = `${DEST_ROOT}/${folder}`
                const taken = await takenIn(folderPath)
                const name = freeCopyName(classroomCopyDate(rec), extensionOf(row.url), taken)
                taken.add(name.toLowerCase())
                path = `${folderPath}/${name}`
            }
            starts++
            const item: CopyItem = { recordingId: row.recording_id, studentId: row.student_id, path, bytes: size }
            if (dryRun) {
                result.started.push(item)
                log(`[dry run] would copy ${row.recording_id} (${(size / 1e9).toFixed(2)} GB) -> ${path}`)
                continue
            }

            // A retry keeps its path: if an earlier attempt's file landed after all, that's the copy.
            if (row.dropbox_path) {
                const existing = await fileMeta(dbx(), path)
                if (existing) {
                    if (existing.size === size) {
                        await markDone(supabase, row.id, existing)
                        result.done.push({ ...item, path: existing.path })
                        log(`copy of ${row.recording_id} was already in Dropbox: ${existing.path}`)
                    } else {
                        const error = `a different file is already at ${path} (${existing.size} bytes, R2 has ${size})`
                        await updateRow(supabase, row.id, { status: 'failed', error, finished_at: now.toISOString() })
                        result.failed.push({ recordingId: row.recording_id, error })
                    }
                    continue
                }
            }

            const { data: claimedRow } = await supabase
                .from(COPIES_TABLE)
                .update({
                    status: 'running', dropbox_path: path, size_bytes: size, job_id: null, error: null,
                    attempts: row.attempts + 1, started_at: now.toISOString(), updated_at: now.toISOString(),
                })
                .eq('id', row.id)
                .eq('status', 'pending')
                .select('id')
            if (!claimedRow || claimedRow.length === 0) continue // the other trigger took it

            try {
                const res = await dbx().filesSaveUrl({ path, url: row.url })
                const out = res.result as any
                if (out['.tag'] === 'async_job_id') {
                    await updateRow(supabase, row.id, { job_id: out.async_job_id })
                    result.started.push(item)
                    log(`started Dropbox copy of ${row.recording_id} -> ${path}`)
                } else if (out['.tag'] === 'complete') {
                    const outcome = await finish(supabase, { id: row.id, size_bytes: size }, { size: out.size, path: out.path_display || path }, now)
                    if (outcome.ok) result.done.push({ ...item, path: outcome.path })
                    else result.failed.push({ recordingId: row.recording_id, error: outcome.error })
                }
            } catch (err) {
                const error = `save_url: ${dropboxError(err)}`
                const failed = row.attempts + 1 >= MAX_ATTEMPTS
                await updateRow(supabase, row.id, { status: failed ? 'failed' : 'pending', error, ...(failed ? { finished_at: now.toISOString() } : {}) })
                if (failed) result.failed.push({ recordingId: row.recording_id, error })
                log(`could not start Dropbox copy of ${row.recording_id}: ${error}`)
            }
        }
        result.noFolder = [...noFolder]
    }

    // ---- 3. Follow up running Dropbox jobs.
    let runningQuery = supabase
        .from(COPIES_TABLE)
        .select('id, recording_id, url, student_id, dropbox_path, job_id, status, size_bytes, attempts, started_at')
        .eq('status', 'running')
    if (opts.studentId) runningQuery = runningQuery.eq('student_id', opts.studentId)
    const { data: runningRows, error: runningError } = await runningQuery
    if (runningError) throw new Error(`${COPIES_TABLE} running query failed: ${runningError.message}`)
    const startedNow = new Set(result.started.map(s => s.recordingId))

    for (const row of (runningRows || []) as CopyRow[]) {
        if (dryRun || startedNow.has(row.recording_id)) {
            result.inProgress++
            continue
        }
        const age = now.getTime() - Date.parse(row.started_at || '1970-01-01')
        const item: CopyItem = { recordingId: row.recording_id, studentId: row.student_id, path: row.dropbox_path || '', bytes: row.size_bytes }

        // Lost track of the job: the file at its path settles it, else try again.
        const settle = async (reason: string) => {
            const existing = row.dropbox_path ? await fileMeta(dbx(), row.dropbox_path) : null
            if (existing) {
                const outcome = await finish(supabase, row, existing, now)
                if (outcome.ok) result.done.push({ ...item, path: outcome.path })
                else result.failed.push({ recordingId: row.recording_id, error: outcome.error })
                return
            }
            const failed = row.attempts >= MAX_ATTEMPTS
            await updateRow(supabase, row.id, { status: failed ? 'failed' : 'pending', job_id: null, error: reason, ...(failed ? { finished_at: now.toISOString() } : {}) })
            if (failed) result.failed.push({ recordingId: row.recording_id, error: reason })
            log(`Dropbox copy of ${row.recording_id}: ${reason}${failed ? ', gave up' : ', will retry'}`)
        }

        if (!row.job_id) {
            if (age > CLAIM_STALE_MS) await settle('started without a Dropbox job')
            else result.inProgress++
            continue
        }
        try {
            const res = await dbx().filesSaveUrlCheckJobStatus({ async_job_id: row.job_id })
            const status = res.result as any
            if (status['.tag'] === 'in_progress') {
                if (age > JOB_STALE_MS) await settle('Dropbox job ran for over 3 hours')
                else result.inProgress++
            } else if (status['.tag'] === 'complete') {
                const outcome = await finish(supabase, row, { size: status.size, path: status.path_display || row.dropbox_path || '' }, now)
                if (outcome.ok) {
                    result.done.push({ ...item, path: outcome.path })
                    log(`Dropbox copy of ${row.recording_id} done: ${outcome.path}`)
                } else {
                    result.failed.push({ recordingId: row.recording_id, error: outcome.error })
                }
            } else if (status['.tag'] === 'failed') {
                await settle(`Dropbox job failed: ${JSON.stringify(status.failed)}`)
            } else {
                result.inProgress++
            }
        } catch (err) {
            await settle(`job check failed: ${dropboxError(err)}`)
        }
    }

    // ---- 4. Tell the studio about copies that gave up (#952). Never fails the run.
    if (!dryRun) {
        const alert = opts.alert ?? ((email: CopyAlertEmail) => sendCronAlert(supabase, email))
        try {
            result.alerted = await alertGaveUpCopies(supabase, { alert, log, now, studentId: opts.studentId })
        } catch (err) {
            log(`could not email about failed copies: ${err instanceof Error ? err.message : String(err)}`)
        }
    }

    return result
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** "Mon, Nov 16" for a YYYY-MM-DD. */
function dayLabel(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** The "copy gave up" email for one row (#952). */
export function copyGaveUpEmail(info: {
    studentName: string
    /** YYYY-MM-DD the recording started, Eastern. */
    date: string
    attempts: number
    error: string
    dropboxPath: string | null
    rowId: string
}): CopyAlertEmail {
    const tries = info.attempts === 1 ? '1 try' : `${info.attempts} tries`
    return {
        subject: `Classroom video not copied to Dropbox: ${info.studentName}, ${dayLabel(info.date)}`,
        lines: [
            `Student: ${escapeHtml(info.studentName)}`,
            `Recording from ${escapeHtml(dayLabel(info.date))}`,
            `Gave up after ${tries}. Error: ${escapeHtml(info.error)}`,
            ...(info.dropboxPath ? [`It was going to: ${escapeHtml(info.dropboxPath)}`] : []),
        ],
        footer: 'The video itself is safe in the classroom library (admin, Classroom recordings tab); only its copy in the ' +
            `student's Dropbox folder is missing, and nothing retries it on its own now. Copy row ${escapeHtml(info.rowId)} in ` +
            `${COPIES_TABLE}. This email comes once per recording.`,
    }
}

/**
 * Emails the studio once for every copy that gave up and was not emailed yet.
 * The row is claimed first (alerted_at set only where it is still empty), so two
 * runs at once can't both send; a send that fails clears the claim so the next
 * run tries again. Returns the recording ids emailed.
 */
export async function alertGaveUpCopies(
    supabase: DbClient,
    { alert, log = () => {}, now = new Date(), studentId }: {
        alert: (email: CopyAlertEmail) => Promise<boolean>
        log?: (msg: string) => void
        now?: Date
        studentId?: string
    },
): Promise<string[]> {
    let query = supabase
        .from(COPIES_TABLE)
        .select('id, recording_id, student_id, dropbox_path, attempts, error, alerted_at')
        .eq('status', 'failed')
        .is('alerted_at', null)
    if (studentId) query = query.eq('student_id', studentId)
    const { data, error } = await query
    if (error) throw new Error(`${COPIES_TABLE} failed-copies query failed: ${error.message}`)
    const rows = (data || []) as Array<{ id: string; recording_id: string; student_id: string; dropbox_path: string | null; attempts: number; error: string | null }>
    if (rows.length === 0) return []

    const { data: recs } = await supabase.from('classroom_recordings').select('id, url, created_at').in('id', rows.map(r => r.recording_id))
    const recById = new Map((recs || []).map(r => [r.id as string, r as { url: string; created_at: string }]))
    const { data: people } = await supabase.from('profiles').select('id, name').in('id', [...new Set(rows.map(r => r.student_id))])
    const nameById = new Map((people || []).map(p => [p.id as string, (p.name as string) || 'a student']))

    const sent: string[] = []
    for (const row of rows) {
        const { data: claimed } = await supabase
            .from(COPIES_TABLE)
            .update({ alerted_at: now.toISOString() })
            .eq('id', row.id)
            .is('alerted_at', null)
            .select('id')
        if (!claimed || claimed.length === 0) continue // the other trigger is emailing it

        const rec = recById.get(row.recording_id)
        const email = copyGaveUpEmail({
            studentName: nameById.get(row.student_id) || 'a student',
            date: rec ? classroomCopyDate(rec) : isoToStudioWallClock(now.toISOString()).localDate,
            attempts: row.attempts,
            error: row.error || 'no error was recorded',
            dropboxPath: row.dropbox_path,
            rowId: row.id,
        })
        let ok = false
        try {
            ok = await alert(email)
        } catch (err) {
            log(`email about failed copy of ${row.recording_id} threw: ${err instanceof Error ? err.message : String(err)}`)
        }
        if (ok) {
            sent.push(row.recording_id)
            log(`emailed the studio: copy of ${row.recording_id} gave up`)
        } else {
            await supabase.from(COPIES_TABLE).update({ alerted_at: null }).eq('id', row.id)
            log(`could not email about failed copy of ${row.recording_id}; next run tries again`)
        }
    }
    return sent
}

async function updateRow(supabase: DbClient, id: string, fields: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from(COPIES_TABLE).update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(`${COPIES_TABLE} update failed: ${error.message}`)
}

async function markDone(supabase: DbClient, id: string, meta: FileMeta): Promise<void> {
    await updateRow(supabase, id, { status: 'done', dropbox_path: meta.path, dropbox_size: meta.size, error: null, finished_at: new Date().toISOString() })
}

/** A finished Dropbox file counts only when its size equals the R2 file's. */
async function finish(
    supabase: DbClient,
    row: Pick<CopyRow, 'id' | 'size_bytes'>,
    meta: FileMeta,
    now: Date,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    if (row.size_bytes !== null && Number(row.size_bytes) === meta.size) {
        await markDone(supabase, row.id, meta)
        return { ok: true, path: meta.path }
    }
    const error = `size mismatch: Dropbox ${meta.size} bytes, R2 ${row.size_bytes ?? 'unknown'} (${meta.path})`
    await updateRow(supabase, row.id, { status: 'failed', dropbox_path: meta.path, dropbox_size: meta.size, error, finished_at: now.toISOString() })
    return { ok: false, error }
}

async function fileMeta(dbx: Dropbox, path: string): Promise<FileMeta | null> {
    try {
        const res = await dbx.filesGetMetadata({ path })
        const meta = res.result as any
        if (meta['.tag'] !== 'file') return null
        return { size: meta.size, path: meta.path_display || path }
    } catch (err) {
        if (dropboxError(err).includes('not_found')) return null
        throw err
    }
}

async function listFolderNames(dbx: Dropbox, path: string): Promise<string[]> {
    try {
        let res = await dbx.filesListFolder({ path })
        const names = res.result.entries.map(e => e.name)
        while (res.result.has_more) {
            res = await dbx.filesListFolderContinue({ cursor: res.result.cursor })
            names.push(...res.result.entries.map(e => e.name))
        }
        return names
    } catch (err) {
        if (dropboxError(err).includes('not_found')) return []
        throw err
    }
}
