/**
 * Self-check for classroom students (#980, lib/lesson-venue.ts) and the 9pm
 * email's last homework (#979): which links a family gets, the reminder and
 * lesson-scheduled emails as rendered, and the homework preview. No network,
 * no database.
 *
 *   npx tsx scripts/check_lesson_venue.ts
 */
import assert from 'node:assert/strict'
import { render } from '@react-email/components'
import LessonReminderEmail from '../components/emails/LessonReminderEmail'
import { LessonScheduledEmail } from '../components/emails/lesson-scheduled-email'
import { CLASSROOM_BASE_URL, familyLessonLinks, lessonVenue } from '../lib/lesson-venue'
import { homeworkPreview } from '../lib/evening-preview'

const ZOOM = 'https://us06web.zoom.us/j/123456789?pwd=abc'
const ROOM = `${CLASSROOM_BASE_URL}/piano-student`

async function main() {
    // 1. Which links a family gets.
    assert.deepEqual(familyLessonLinks({ lesson_venue: 'classroom', public_id: 'piano-student' }, ZOOM), { venue: 'classroom', zoomLink: null, classroomLink: ROOM })
    assert.deepEqual(familyLessonLinks({ lesson_venue: 'zoom', public_id: 'piano-student' }, ZOOM), { venue: 'zoom', zoomLink: ZOOM, classroomLink: ROOM })
    assert.deepEqual(familyLessonLinks({ public_id: null }, ZOOM), { venue: 'zoom', zoomLink: ZOOM, classroomLink: null })
    // Set to classroom but no public_id: no classroom link can be made, so Zoom.
    assert.equal(lessonVenue({ lesson_venue: 'classroom', public_id: '' }), 'zoom')

    // 2. Reminders: a classroom family sees only the classroom link, the join button too.
    const classroom = familyLessonLinks({ lesson_venue: 'classroom', public_id: 'piano-student' }, ZOOM)
    const soon = await render(LessonReminderEmail({ studentName: 'Piano Student', time: '4:30pm EST', variant: '15m', ...classroom }))
    assert.ok(!soon.includes('zoom.us'), 'classroom 15m reminder must not show Zoom')
    assert.match(soon, new RegExp(`href="${ROOM}"[^>]*>[\\s\\S]*?Join the Classroom`))
    const dayBefore = await render(LessonReminderEmail({ studentName: 'Piano Student', time: '4:30pm EST', variant: '24h', confirmNudge: true, ...classroom }))
    assert.ok(!dayBefore.includes('zoom.us'), 'classroom 24h reminder must not show Zoom')
    assert.match(dayBefore, /Classroom Link:/)

    // A Zoom family's reminders read as before: Zoom button, classroom as backup.
    const zoom = familyLessonLinks({ lesson_venue: 'zoom', public_id: 'piano-student' }, ZOOM)
    const zoomSoon = await render(LessonReminderEmail({ studentName: 'Piano Student', time: '4:30pm EST', variant: '15m', ...zoom }))
    assert.match(zoomSoon, /Join Zoom Meeting/)
    assert.match(zoomSoon, /Classroom Link:/)
    const zoomDay = await render(LessonReminderEmail({ studentName: 'Piano Student', time: '4:30pm EST', variant: '24h', ...zoom }))
    assert.match(zoomDay, /Zoom Link:/)

    // 3. Lesson scheduled email: classroom link instead of Zoom.
    const scheduled = await render(LessonScheduledEmail({
        studentName: 'Piano Student', date: 'Friday, November 20', time: '4:30pm EST', duration: 30,
        zoomLink: classroom.zoomLink, classroomLink: classroom.classroomLink, recipientName: 'Piano Student',
    }))
    assert.ok(!scheduled.includes('zoom.us'))
    assert.match(scheduled, /Classroom Link:/)
    const scheduledZoom = await render(LessonScheduledEmail({
        studentName: 'Piano Student', date: 'Friday, November 20', time: '4:30pm EST', duration: 30,
        zoomLink: ZOOM, classroomLink: null, recipientName: 'Piano Student',
    }))
    assert.match(scheduledZoom, /Zoom Link:/)

    // 4. Last homework in the 9pm email: first 3 lines, then "...".
    assert.deepEqual(homeworkPreview('C major scale\n\nBars 1-8\nBars 9-16\nSight reading'), ['C major scale', 'Bars 1-8', 'Bars 9-16', '...'])
    assert.deepEqual(homeworkPreview('Just one thing'), ['Just one thing'])
    assert.equal(homeworkPreview('x'.repeat(200))[0].length, 113)

    for (const html of [soon, dayBefore, scheduled]) {
        assert.ok(!html.includes(String.fromCharCode(0x2014)), 'em dash in a family email')
    }
    console.log('check_lesson_venue: all checks passed')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
