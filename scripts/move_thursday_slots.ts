// One-off: move three Thursday students to new times (Sept 2026).
//
//   Robert Alconcel  3:00pm -> 4:15pm  (30 min)
//   Lucas Sun        3:45pm -> 3:30pm  (30 min)
//   Edwin Guo        4:45pm -> 5:00pm  (45 min)
//
// Three things hold a Thursday time, and all three have to move:
//   1. profiles.lesson_time  - the recurring weekly template bulkScheduleLessons reads
//   2. the already-booked lessons row for the next Thursday (2026-09-17), via
//      rescheduleLessonCore, which also updates the Zoom meeting and emails the family
//   3. the Google Calendar event, which rescheduleLessonCore does NOT touch
//
// Times are studio wall-clock (America/Los_Angeles), same as every other lesson_time.
// Moves run latest-slot-first so no intermediate state collides with a slot that
// hasn't moved yet.
//
// Usage:
//   npx tsx scripts/move_thursday_slots.ts          # dry run, prints the plan
//   npx tsx scripts/move_thursday_slots.ts --send   # apply
//   npx tsx scripts/move_thursday_slots.ts --calendar-only --send   # re-patch calendar events only
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { config } from 'dotenv'
config({ path: '.env.local' })

import { rescheduleLessonCore } from '@/lib/core/lessons'
import { addMinutesToWallClock } from '@/lib/google-calendar'

const ADMIN_ID = 'e96d34d9-5cc9-43a8-81c2-9545d1b11508' // Lionel Yu
const TARGET_DATE = '2026-09-17' // the next Thursday

// Latest new time first, so an earlier student never lands on a slot still held
// by someone who hasn't been moved yet.
const MOVES = [
    { name: 'Edwin Guo', id: '10128b61-f8e6-44cf-86af-7c7f4669705a', from: '16:45', to: '17:00', duration: 45 },
    { name: 'Robert Alconcel', id: '5d9ce59d-87c2-4e34-bc95-cff3f5ca08bf', from: '15:00', to: '16:15', duration: 30 },
    { name: 'Lucas Sun', id: '6014d778-301f-4310-91ca-82bcd0af8b96', from: '15:45', to: '15:30', duration: 30 },
]

const SEND = process.argv.includes('--send')
// The first run patched the calendar with a wrong end time (the +7h bug since fixed
// in lib/google-calendar.ts). This mode re-patches the three events only.
const CALENDAR_ONLY = process.argv.includes('--calendar-only')

function admin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

function pretty(t: string) {
    const [h, m] = t.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${suffix}`
}

// rescheduleLessonCore updates Zoom but leaves the calendar event at the old
// time, so patch it here with the same service account createGoogleCalendarEvent uses.
async function moveCalendarEvent(eventId: string, date: string, time: string, duration: number) {
    const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/calendar'],
    })
    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.events.patch({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        eventId,
        requestBody: {
            start: { dateTime: `${date}T${time}:00`, timeZone: 'America/Los_Angeles' },
            end: { dateTime: addMinutesToWallClock(date, time, duration), timeZone: 'America/Los_Angeles' },
        },
    })
}

async function run() {
    const supabase = admin()
    console.log(SEND ? '=== APPLYING ===\n' : '=== DRY RUN (pass --send to apply) ===\n')

    for (const mv of MOVES) {
        console.log(`--- ${mv.name}: Thursdays ${pretty(mv.from)} -> ${pretty(mv.to)} (${mv.duration} min) ---`)

        if (CALENDAR_ONLY) {
            const { data: l } = await supabase
                .from('lessons')
                .select('google_event_id')
                .eq('student_id', mv.id)
                .eq('date', TARGET_DATE)
                .neq('status', 'cancelled')
                .maybeSingle()
            const id = (l as any)?.google_event_id
            if (!id) { console.log('  calendar: no event id, skipping'); continue }
            if (!SEND) { console.log(`  calendar: would re-patch ${id} to ${mv.to} (+${mv.duration} min)`); continue }
            try {
                await moveCalendarEvent(id, TARGET_DATE, mv.to, mv.duration)
                console.log('  calendar: event re-patched')
            } catch (e: any) {
                console.log(`  calendar: patch FAILED -- ${e?.message || e}`)
            }
            continue
        }

        // Guard: the profile should still be sitting on the old time.
        const { data: profile } = await supabase
            .from('profiles')
            .select('name, lesson_day, lesson_time, lesson_duration')
            .eq('id', mv.id)
            .single()
        if (!profile) {
            console.log('  !! profile not found, skipping')
            continue
        }
        const current = String((profile as any).lesson_time).slice(0, 5)
        if ((profile as any).lesson_day !== 'Thursday' || current !== mv.from) {
            console.log(`  !! expected Thursday ${mv.from}, found ${(profile as any).lesson_day} ${current} -- skipping`)
            continue
        }

        // 1. Recurring template.
        if (SEND) {
            const { error } = await supabase
                .from('profiles')
                .update({ lesson_time: mv.to, lesson_duration: mv.duration })
                .eq('id', mv.id)
            console.log(error ? `  template: ERROR ${error.message}` : '  template: updated')
        } else {
            console.log(`  template: would set profiles.lesson_time = ${mv.to}`)
        }

        // 2 + 3. The already-booked lesson on the next Thursday.
        const { data: lesson } = await supabase
            .from('lessons')
            .select('id, time, duration, status, google_event_id')
            .eq('student_id', mv.id)
            .eq('date', TARGET_DATE)
            .neq('status', 'cancelled')
            .maybeSingle()

        if (!lesson) {
            console.log(`  ${TARGET_DATE}: no booked lesson, nothing to reschedule`)
            continue
        }

        if (!SEND) {
            console.log(`  ${TARGET_DATE}: would reschedule lesson ${(lesson as any).id} to ${mv.to} (Zoom + email)`)
            console.log(`  ${TARGET_DATE}: would patch calendar event ${(lesson as any).google_event_id}`)
            continue
        }

        const result = await rescheduleLessonCore({
            client: supabase as any,
            adminId: ADMIN_ID,
            lessonId: (lesson as any).id,
            newDate: TARGET_DATE,
            newTime: mv.to,
            newDuration: mv.duration,
            confirmOverride: true, // an admin-initiated studio-wide shuffle overrides student intent flags
        })
        if ('error' in result && result.error) {
            console.log(`  ${TARGET_DATE}: RESCHEDULE FAILED -- ${result.error}`)
            continue
        }
        console.log(`  ${TARGET_DATE}: rescheduled (Zoom updated, family emailed)`)
        if ((result as any).warning) console.log(`  warning: ${(result as any).warning}`)

        const eventId = (lesson as any).google_event_id
        if (eventId) {
            try {
                await moveCalendarEvent(eventId, TARGET_DATE, mv.to, mv.duration)
                console.log('  calendar: event patched')
            } catch (e: any) {
                console.log(`  calendar: patch FAILED -- ${e?.message || e}`)
            }
        }
    }

    // Final read-back of the whole Thursday board.
    console.log('\n=== Thursday recurring slots (active students) ===')
    const { data: thu } = await supabase
        .from('profiles')
        .select('name, status, lesson_time, lesson_duration')
        .eq('lesson_day', 'Thursday')
        .eq('status', 'active')
        .order('lesson_time')
    for (const p of thu || []) {
        console.log(`  ${pretty(String((p as any).lesson_time).slice(0, 5))}  ${(p as any).lesson_duration} min  ${(p as any).name}`)
    }

    console.log(`\n=== Booked lessons on ${TARGET_DATE} ===`)
    const { data: booked } = await supabase
        .from('lessons')
        .select('time, duration, status, student_id')
        .eq('date', TARGET_DATE)
        .order('time')
    for (const l of booked || []) {
        const { data: p } = await supabase.from('profiles').select('name').eq('id', (l as any).student_id).maybeSingle()
        console.log(`  ${pretty(String((l as any).time).slice(0, 5))}  ${(l as any).duration} min  ${(p as any)?.name}  (${(l as any).status})`)
    }
}

run()
