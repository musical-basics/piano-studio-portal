/**
 * One-off for #1071: every upcoming scheduled lesson that has no Zoom meeting of
 * its own (a link reused from an earlier lesson, a meeting id another lesson
 * also has, or no link at all) gets its own meeting, the same way new lessons
 * do now (createOwnLessonMeeting). Nobody is emailed or invited: the family
 * sees the new link in the portal and in the reminders.
 *
 * Dry run by default (no Zoom calls). Prints dates and times, never names.
 *
 *   npx tsx --env-file=.env.local scripts/give_lessons_own_zoom_meetings.ts
 *   npx tsx --env-file=.env.local scripts/give_lessons_own_zoom_meetings.ts --apply
 */
import { createAdminClient } from '../lib/supabase/admin'
import { createOwnLessonMeeting } from '../lib/core/lessons'
import { studioToday, studioWallClockToISO } from '../lib/studio-timezone'

const meetingOfLink = (link: string | null) => link?.match(/\/j\/(\d+)/)?.[1] ?? null

async function main() {
    const apply = process.argv.includes('--apply')
    const client = createAdminClient()
    const today = studioToday()

    const { data: upcoming, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, zoom_link, zoom_meeting_id, reminder_24h_sent')
        .eq('status', 'scheduled')
        .gte('date', today)
        .order('date')
        .order('time')
    if (error) throw new Error(error.message)

    // Meeting numbers in use by any lesson, to spot one shared by two lessons.
    const { data: withIds, error: idsError } = await client
        .from('lessons')
        .select('id, zoom_link, zoom_meeting_id')
        .or('zoom_meeting_id.not.is.null,zoom_link.not.is.null')
    if (idsError) throw new Error(idsError.message)
    const users = new Map<string, Set<string>>()
    for (const r of withIds ?? []) {
        for (const n of new Set([r.zoom_meeting_id ? String(r.zoom_meeting_id) : null, meetingOfLink(r.zoom_link)])) {
            if (!n) continue
            if (!users.has(n)) users.set(n, new Set())
            users.get(n)!.add(r.id)
        }
    }

    const now = Date.now()
    const todo = (upcoming ?? []).filter(l => {
        if (Date.parse(studioWallClockToISO(l.date, String(l.time).slice(0, 5))) <= now) return false
        const own = l.zoom_meeting_id ? String(l.zoom_meeting_id) : null
        if (!own) return true
        if (meetingOfLink(l.zoom_link) !== own) return true
        return (users.get(own)?.size ?? 0) > 1
    })

    console.log(`${upcoming?.length ?? 0} upcoming scheduled lesson(s); ${todo.length} without a Zoom meeting of their own.`)
    for (const l of todo) {
        const why = !l.zoom_meeting_id ? (l.zoom_link ? 'reused link, no meeting id' : 'no link') : 'meeting shared with another lesson'
        console.log(`  ${l.date} ${String(l.time).slice(0, 5)} lesson=${l.id.slice(0, 8)} ${why}${l.reminder_24h_sent ? ' (24h reminder already sent)' : ''}`)
    }
    if (!apply || todo.length === 0) {
        if (!apply) console.log('Dry run: nothing changed. Add --apply to make the meetings.')
        return
    }

    let done = 0
    for (const l of todo) {
        const meeting = await createOwnLessonMeeting({ studentId: l.student_id, date: l.date, time: String(l.time), duration: Number(l.duration) || 60 })
        if (!meeting) {
            console.log(`  ${l.date} lesson=${l.id.slice(0, 8)}: Zoom made no meeting, left as is`)
            continue
        }
        let update = client.from('lessons').update({ zoom_link: meeting.zoom_link, zoom_meeting_id: meeting.zoom_meeting_id }).eq('id', l.id)
        update = l.zoom_meeting_id ? update.eq('zoom_meeting_id', l.zoom_meeting_id) : update.is('zoom_meeting_id', null)
        const { data: saved, error: saveError } = await update.select('id')
        if (saveError || !saved?.length) {
            console.log(`  ${l.date} lesson=${l.id.slice(0, 8)}: changed meanwhile or save failed (${saveError?.message ?? 'no row'}), new meeting removed`)
            const { deleteZoomMeeting } = await import('../lib/zoom')
            await deleteZoomMeeting(meeting.zoom_meeting_id)
            continue
        }
        done++
        console.log(`  ${l.date} ${String(l.time).slice(0, 5)} lesson=${l.id.slice(0, 8)}: own meeting saved`)
    }
    console.log(`Applied: ${done} of ${todo.length} lesson(s) now have their own meeting.`)
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
