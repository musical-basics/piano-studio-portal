import { google } from 'googleapis'

const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'), // Fixes newline issues in Vercel/Env
    scopes: ['https://www.googleapis.com/auth/calendar'],
})

const calendar = google.calendar({ version: 'v3', auth })

// Google needs both ends as studio wall-clock strings to pair with timeZone
// America/Los_Angeles. Going through a Date and toISOString() would hand it the
// UTC instant instead, which then gets re-read as Pacific and stretches the
// event by the whole UTC offset -- so add the minutes to the wall clock directly.
export function addMinutesToWallClock(date: string, time: string, minutes: number) {
    const [h, m] = time.split(':').map(Number)
    const total = h * 60 + m + minutes
    const dayOffset = Math.floor(total / 1440)
    const mins = ((total % 1440) + 1440) % 1440

    let endDate = date
    if (dayOffset !== 0) {
        // Midnight rollover: shift the calendar date without touching the clock.
        const d = new Date(`${date}T12:00:00Z`)
        d.setUTCDate(d.getUTCDate() + dayOffset)
        endDate = d.toISOString().slice(0, 10)
    }

    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    return `${endDate}T${hh}:${mm}:00`
}

export async function createGoogleCalendarEvent(
    studentName: string,
    date: string, // YYYY-MM-DD
    time: string, // HH:MM
    durationMinutes: number
) {
    try {
        // 2. Format Dates for Google (naive studio wall-clock, paired with timeZone below)
        const startDateTime = `${date}T${time}:00`
        const endDateTime = addMinutesToWallClock(date, time, durationMinutes)

        const event = {
            summary: `${studentName} - Piano Lesson`,
            description: `Lesson scheduled via Studio Portal.`,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/Los_Angeles', // ⚠️ Check this matches your studio's timezone
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'America/Los_Angeles',
            },
            colorId: '11', // 11 = Red (Tomato)
        }

        // 3. Push to Google
        const response = await calendar.events.insert({
            calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
            requestBody: event,
        })

        console.log('✅ Google Event Created:', response.data.id)
        return response.data.id // We return this so we can save it to Supabase

    } catch (error) {
        console.error('❌ Google Calendar Error:', error)
        return null // Return null so the app doesn't crash if Google fails
    }
}
