/**
 * One-time backfill of Zoom lesson attendance (#965): for every Zoom lesson
 * from --from (default 2026-01-01) that has no saved row yet, read Zoom's past
 * participants and save them in zoom_lesson_attendance, the same way the
 * backfill-recordings cron does for new lessons. Zoom keeps this for about a
 * year, so older lessons may come back "never started" or not at all.
 *
 * Dry run by default: only counts what it would fetch (no Zoom calls).
 * Slow on purpose: one lesson every --delay-ms (default 1500), and a long
 * pause on Zoom's 429 (rate limit). Prints dates and minutes, never names.
 *
 * --redo=later_use reads again the lessons saved as "the meeting link was used
 * again later": run it once the Zoom app has the past meeting instances
 * permission (meeting:read:list_past_instances:admin), which lets it read each
 * lesson's own use of the meeting.
 *
 *   npx tsx --env-file=.env.local scripts/backfill_zoom_attendance.ts
 *   nice -n 19 npx tsx --env-file=.env.local scripts/backfill_zoom_attendance.ts --apply [--limit=5] [--from=2026-01-01] [--to=2026-11-18] [--redo=later_use]
 */
import { createAdminClient } from '../lib/supabase/admin'
import { findAttendanceLessons, needsCheck, saveLessonAttendance, zoomParticipantsFetcher, type FetchParticipants } from '../lib/core/zoom-lesson-attendance'
import { studioToday } from '../lib/studio-timezone'

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const mins = (s: number | null | undefined) => (s == null ? '-' : String(Math.round(s / 60)))

async function main() {
    const apply = process.argv.includes('--apply')
    const from = arg('from') || '2026-01-01'
    const to = arg('to') || studioToday()
    const limit = Number(arg('limit')) || Infinity
    const delayMs = Number(arg('delay-ms')) || 1500
    const redo = arg('redo')
    const now = new Date()

    const client = createAdminClient()
    const all = await findAttendanceLessons(client, { from, to })
    const due = all.filter(c => needsCheck(c.lesson, c.existing, now) || (!!redo && c.existing?.kind === redo))
    const byMonth = new Map<string, number>()
    for (const c of due) byMonth.set(c.lesson.date.slice(0, 7), (byMonth.get(c.lesson.date.slice(0, 7)) ?? 0) + 1)
    console.log(`Zoom lessons ${from} to ${to}: ${all.length} (teacher accounts left out), already saved: ${all.filter(c => c.existing && c.existing.status !== 'retrying').length}, to fetch: ${due.length}`)
    for (const [month, n] of [...byMonth].sort()) console.log(`  ${month}: ${n}`)
    if (!apply) {
        console.log('\nDry run, nothing fetched or saved. Add --apply to run it.')
        return
    }

    const base = await zoomParticipantsFetcher()
    if (!base) throw new Error('Could not get a Zoom token')
    // Zoom's 429 is a rate limit, not an answer: wait and ask again rather than spend an attempt.
    const fetchParticipants: FetchParticipants = async lesson => {
        for (let tries = 1; ; tries++) {
            const got = await base(lesson)
            if (got.ok || !/\b429\b/.test(got.reason) || tries >= 4) return got
            console.log(`  Zoom rate limit, waiting ${30 * tries}s`)
            await sleep(30_000 * tries)
        }
    }

    const counts: Record<string, number> = {}
    let done = 0
    for (const { lesson, existing } of due) {
        if (done >= limit) break
        try {
            // A redo starts its attempts afresh.
            const row = await saveLessonAttendance(client, lesson, redo && existing?.kind === redo ? undefined : existing, fetchParticipants, new Date())
            counts[row.status] = (counts[row.status] ?? 0) + 1
            const r = row as any
            console.log(`${lesson.date} ${lesson.time}  ${row.status.padEnd(13)} ${(row.kind ?? '').padEnd(15)} you ${mins(r.teacher_seconds)}, student ${mins(r.student_seconds)}, together ${mins(r.overlap_seconds)} min${row.last_error ? `  (${row.last_error})` : ''}`)
        } catch (e) {
            counts.failed = (counts.failed ?? 0) + 1
            console.log(`${lesson.date} ${lesson.time}  FAILED ${e instanceof Error ? e.message : e}`)
        }
        done++
        await sleep(delayMs)
    }
    console.log(`\nDone: ${done} lesson(s). ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`)
}

main().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1) })
