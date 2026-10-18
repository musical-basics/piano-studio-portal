// Delete Google Calendar lesson events whose lesson no longer exists.
//
// Until ad37d13, cancelling a lesson deleted the lessons row and the Zoom meeting
// but left the calendar event, so every cancelled lesson stayed on the studio
// calendar as a confirmed event. This finds those leftovers and removes them.
//
// Only touches events the portal created ("<Name> - Piano Lesson" with the
// portal's description) that no lessons row points to. An orphan is KEPT when a
// lesson could still own it: the same student has a lesson that day (old rows
// from January lost their google_event_id), or any lesson starts at that exact
// date and time (covers renamed students).
//
// Deleted events go to Google Calendar's trash, recoverable for 30 days.
// Usage: npx tsx scripts/cleanup_orphan_calendar_events.ts [--apply] [--backup <file.json>]
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'fs'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const PORTAL_DESCRIPTION = 'Lesson scheduled via Studio Portal.'
const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
})
const calendar = google.calendar({ version: 'v3', auth })

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
    const rows: T[] = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(table).select(columns).range(from, from + 999)
        if (error) throw new Error(`${table}: ${error.message}`)
        rows.push(...((data ?? []) as T[]))
        if (!data || data.length < 1000) return rows
    }
}

async function main() {
    const apply = process.argv.includes('--apply')
    const backupIdx = process.argv.indexOf('--backup')
    const backupPath = backupIdx > -1 ? process.argv[backupIdx + 1] : null

    const events: any[] = []
    let pageToken: string | undefined
    do {
        const res = await calendar.events.list({
            calendarId,
            q: 'Piano Lesson',
            timeMin: '2024-01-01T00:00:00Z',
            timeMax: '2028-01-01T00:00:00Z',
            singleEvents: true,
            maxResults: 2500,
            pageToken,
        })
        events.push(...(res.data.items ?? []))
        pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    const portalEvents = events.filter(e =>
        / - Piano Lesson$/.test(e.summary || '') &&
        (e.description || '') === PORTAL_DESCRIPTION &&
        e.status !== 'cancelled'
    )

    type LessonRow = { student_id: string; date: string; time: string; google_event_id: string | null }
    const lessons = await fetchAll<LessonRow>('lessons', 'student_id, date, time, google_event_id')
    const profiles = await fetchAll<{ id: string; name: string | null }>('profiles', 'id, name')

    const referenced = new Set(lessons.map(l => l.google_event_id).filter(Boolean))
    const idByName = new Map(profiles.map(p => [(p.name || '').toLowerCase().trim(), p.id]))

    const toDelete: any[] = []
    const kept: Array<{ event: any; reason: string }> = []
    for (const e of portalEvents) {
        if (referenced.has(e.id)) continue
        const name = e.summary.replace(/ - Piano Lesson$/, '')
        const date = (e.start?.dateTime || e.start?.date || '').slice(0, 10)
        const time = (e.start?.dateTime || '').slice(11, 16)
        const studentId = idByName.get(name.toLowerCase().trim())

        if (studentId && lessons.some(l => l.student_id === studentId && l.date === date)) {
            kept.push({ event: e, reason: 'student has a lesson that day' })
        } else if (time && lessons.some(l => l.date === date && l.time.slice(0, 5) === time)) {
            kept.push({ event: e, reason: 'a lesson starts at this exact time' })
        } else {
            toDelete.push(e)
        }
    }

    console.log(`Portal lesson events: ${portalEvents.length}, linked to a lesson: ${portalEvents.length - toDelete.length - kept.length}`)
    console.log(`Orphans kept (a lesson may own them): ${kept.length}`)
    for (const k of kept) console.log(`  keep  ${k.event.start?.dateTime}  ${k.event.summary}  (${k.reason})`)
    console.log(`Orphans to delete: ${toDelete.length}`)
    for (const e of toDelete) console.log(`  del   ${e.start?.dateTime}  ${e.summary}`)

    if (!apply) {
        console.log('\nDry run. Re-run with --apply to delete.')
        return
    }

    if (backupPath) {
        writeFileSync(backupPath, JSON.stringify(toDelete, null, 2))
        console.log(`\nBacked up ${toDelete.length} event(s) to ${backupPath}`)
    }

    let deleted = 0
    const failed: string[] = []
    for (const e of toDelete) {
        try {
            await calendar.events.delete({ calendarId, eventId: e.id })
            deleted++
        } catch (err: any) {
            const status = err?.code ?? err?.response?.status
            if (status === 404 || status === 410) deleted++
            else failed.push(`${e.start?.dateTime} ${e.summary}: ${err?.message || err}`)
        }
    }
    console.log(`\nDeleted ${deleted} of ${toDelete.length}.`)
    for (const f of failed) console.log(`  FAILED ${f}`)
}

main().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1) })
