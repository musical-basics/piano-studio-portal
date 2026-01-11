import { google } from 'googleapis'

const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'), // Fixes newline issues in Vercel/Env
    scopes: ['https://www.googleapis.com/auth/calendar'],
})

const calendar = google.calendar({ version: 'v3', auth })

export async function createGoogleCalendarEvent(
    studentName: string,
    date: string, // YYYY-MM-DD
    time: string, // HH:MM
    durationMinutes: number
) {
    try {
        // 2. Format Dates for Google (ISO format)
        const startDateTime = `${date}T${time}:00`
        const startDate = new Date(startDateTime)
        const endDate = new Date(startDate.getTime() + durationMinutes * 60000)

        const event = {
            summary: `${studentName} - Piano Lesson`,
            description: `Lesson scheduled via Studio Portal.`,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/Los_Angeles', // ⚠️ Check this matches your studio's timezone
            },
            end: {
                dateTime: endDate.toISOString().replace('.000Z', ''),
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
