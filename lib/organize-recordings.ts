// Organize ZBackup recordings into per-student folders.
//
// ZBackup (a third-party Zoom -> Dropbox backup app) drops every lesson
// recording into a flat backup directory, one subfolder per recording named
// like "2026_06_14T06-59 Yakir Shimon _ Piano Lesson". This takes the primary
// .mp4 out of each backup subfolder, moves it into the student's
// "/Lesson Recordings/{folder}" directory (where the student dashboard reads
// from), creates a share link, and attaches it to the matching lesson row.
//
// This is the automated version of scripts/move_recordings.ts, which was only
// ever a manual dry-run-by-default CLI tool and never wired to a cron, so the
// ZBackup directory just accumulated and recordings never reached students.

import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { getDropboxClient, getOrCreateSharedLink } from '@/lib/zoom-recordings'

const DEFAULT_SOURCE_DIR = process.env.DROPBOX_SOURCE_PATH || '/Apps/ZBackup-App/lionel@musicalbasics.com'
const DEST_ROOT = '/Lesson Recordings'

// Names that don't map cleanly to a student profile name. Mirrors
// scripts/move_recordings.ts. Keys are lowercased.
const MANUAL_MAPPINGS: Record<string, string> = {
    'jose piano teacher': 'My Own Piano Lessons',
    'piano student': 'My Own Piano Lessons',
    'olga piano teacher': 'My Own Piano Lessons',
    'micah finn': 'Micah Finn Lesson Recordings',
    'waris matharu': 'Waris Matharu Recordings',
    'ila daigle': 'Ila and Cordelia Recordings',
    'ila and cordelia': 'Ila and Cordelia Recordings',
    'ila and cordelia daigle': 'Ila and Cordelia Recordings',
    'oceanna chan': 'Oceanna Chan Recordings',
    'yakir shimon': 'Yakir Shimon Lesson Recordings',
    'nate mahon': 'Nate Mahon Recordings',
    'edwin guo': 'Edwin Guo Recordings',
    'robert alconcel': 'Robert Alconcel Recordings',
    'padhma berk': 'Padhma Berk Recordings',
}

export type OrganizeResult = {
    scanned: number
    moved: Array<{ folder: string; to: string; lessonId: string | null; sharedUrl: string }>
    skipped: Array<{ folder: string; reason: string }>
    errors: Array<{ folder: string; error: string }>
}

export type OrganizeOptions = {
    client?: DbClient
    sourceDir?: string
    // Cap moves per run. Server-side moves are cheap, but share-link + DB work
    // per item adds up, so bound it and let the next run continue.
    limit?: number
    log?: (msg: string) => void
}

function pickPrimaryMp4(entries: any[]): any | null {
    const mp4s = entries.filter(e => e['.tag'] === 'file' && e.name.toLowerCase().endsWith('.mp4'))
    if (mp4s.length === 0) return null
    return (
        mp4s.find(f => f.name.includes('shared_screen_with_gallery_view')) ||
        mp4s.find(f => f.name.includes('shared_screen_with_speaker_view')) ||
        mp4s[0]
    )
}

export async function organizeZBackupRecordings(opts: OrganizeOptions = {}): Promise<OrganizeResult> {
    const log = opts.log || (() => {})
    const supabase = opts.client || createAdminClient()
    const sourceDir = opts.sourceDir || DEFAULT_SOURCE_DIR
    const limit = opts.limit ?? 20
    const dbx = getDropboxClient()

    const result: OrganizeResult = { scanned: 0, moved: [], skipped: [], errors: [] }

    // Build name -> { studentId, folder } from student profiles, plus the manual
    // overrides. For manual names we resolve the student id by reverse-matching
    // the destination folder against a profile's dropbox_recording_folder.
    const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, name, dropbox_recording_folder')
        .eq('role', 'student')
    if (profErr || !profiles) throw new Error(`profile fetch failed: ${profErr?.message}`)

    const byName = new Map<string, { studentId: string; folder: string }>()
    const folderToStudentId = new Map<string, string>()
    for (const p of profiles as any[]) {
        if (p.name && p.dropbox_recording_folder) {
            byName.set(p.name.toLowerCase().trim(), { studentId: p.id, folder: p.dropbox_recording_folder })
            folderToStudentId.set(p.dropbox_recording_folder, p.id)
        }
    }

    function resolve(folderNameLower: string): { folder: string; studentId: string | null; matched: string } | null {
        const manualKeys = Object.keys(MANUAL_MAPPINGS).sort((a, b) => b.length - a.length)
        for (const key of manualKeys) {
            if (folderNameLower.includes(key)) {
                const folder = MANUAL_MAPPINGS[key]
                return { folder, studentId: folderToStudentId.get(folder) ?? byName.get(key)?.studentId ?? null, matched: key }
            }
        }
        const names = [...byName.keys()].sort((a, b) => b.length - a.length)
        for (const name of names) {
            if (folderNameLower.includes(name)) {
                const m = byName.get(name)!
                return { folder: m.folder, studentId: m.studentId, matched: name }
            }
        }
        return null
    }

    // Existing destination files for a date, so we never create a duplicate of a
    // recording another path (e.g. the Zoom-API backfill) already placed.
    async function destHasDate(destFolder: string, formattedDate: string): Promise<boolean> {
        try {
            const res = await dbx.filesListFolder({ path: `${DEST_ROOT}/${destFolder}` })
            return res.result.entries.some(e => e['.tag'] === 'file' && e.name.includes(formattedDate))
        } catch (err: any) {
            const summary = err?.error?.error_summary || ''
            if (typeof summary === 'string' && summary.includes('path/not_found')) return false
            throw err
        }
    }

    let listRes = await dbx.filesListFolder({ path: sourceDir })
    const folders: any[] = listRes.result.entries.filter(e => e['.tag'] === 'folder')
    while (listRes.result.has_more) {
        listRes = await dbx.filesListFolderContinue({ cursor: listRes.result.cursor })
        folders.push(...listRes.result.entries.filter(e => e['.tag'] === 'folder'))
    }
    result.scanned = folders.length
    log(`Found ${folders.length} backup folder(s) in ${sourceDir}.`)

    let processed = 0
    for (const folder of folders) {
        if (processed >= limit) {
            result.skipped.push({ folder: folder.name, reason: 'per-run limit reached' })
            continue
        }
        const folderName: string = folder.name
        const dateMatch = folderName.match(/^(\d{4})_(\d{2})_(\d{2})/)
        if (!dateMatch) {
            result.skipped.push({ folder: folderName, reason: 'could not parse date' })
            continue
        }
        const formattedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
        const mapping = resolve(folderName.toLowerCase())
        if (!mapping) {
            result.skipped.push({ folder: folderName, reason: 'no student mapping for name' })
            continue
        }

        try {
            if (await destHasDate(mapping.folder, formattedDate)) {
                result.skipped.push({ folder: folderName, reason: `recording for ${formattedDate} already in "${mapping.folder}"` })
                continue
            }

            const subList = await dbx.filesListFolder({ path: folder.path_lower })
            const primary = pickPrimaryMp4(subList.result.entries)
            if (!primary) {
                result.skipped.push({ folder: folderName, reason: 'no .mp4 in backup folder' })
                continue
            }

            const fromPath = primary.path_display || primary.path_lower
            const toPath = `${DEST_ROOT}/${mapping.folder}/${formattedDate} - Lesson.mp4`
            log(`Moving ${mapping.matched} ${formattedDate}: ${fromPath} -> ${toPath}`)
            const movedRes = await dbx.filesMoveV2({ from_path: fromPath, to_path: toPath, autorename: true })
            const finalPath = (movedRes.result.metadata as any).path_display || toPath

            const sharedUrl = await getOrCreateSharedLink(dbx, finalPath)

            // Attach to the matching lesson (student + date), if unambiguous.
            // We ONLY set video_url here. We deliberately do NOT route through
            // logLessonCore: this organizes recordings (including a long history
            // backlog), and re-running completion accounting would retroactively
            // deduct credits, auto-create "next week" lessons, and email students
            // about months-old lessons. Credit/billing is owned by the original
            // completion flow, not by attaching a recording after the fact.
            let lessonId: string | null = null
            if (mapping.studentId) {
                const { data: lessons } = await supabase
                    .from('lessons')
                    .select('id, video_url')
                    .eq('student_id', mapping.studentId)
                    .eq('date', formattedDate)
                    .neq('status', 'cancelled')
                if (lessons && lessons.length === 1) {
                    lessonId = (lessons[0] as any).id
                    if (!(lessons[0] as any).video_url) {
                        const { error: attachErr } = await supabase
                            .from('lessons')
                            .update({ video_url: sharedUrl })
                            .eq('id', lessonId!)
                        if (attachErr) log(`attach warning for lesson ${lessonId}: ${attachErr.message} (recording placed)`)
                    }
                } else {
                    log(`No unambiguous lesson for ${mapping.matched} on ${formattedDate} (${lessons?.length ?? 0} matches); file placed, not linked.`)
                }
            }

            result.moved.push({ folder: folderName, to: finalPath, lessonId, sharedUrl })
            processed++
        } catch (err: any) {
            const detail = err?.error?.error_summary || err?.message || String(err)
            result.errors.push({ folder: folderName, error: detail })
            log(`ERROR on "${folderName}": ${detail}`)
        }
    }

    return result
}
