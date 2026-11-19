/**
 * Self-check for the morning email's Today list (#942) and Watch buttons
 * (#940), and the lesson-notes phrases (#944). No network, no database.
 *
 *   npx tsx scripts/check_morning_email_today.ts
 */
import assert from 'node:assert/strict'
process.env.CRON_SECRET = process.env.CRON_SECRET || 'check-only-secret'
import { buildMorningEmail, type UnloggedLesson } from '../lib/unlogged-lessons'
import type { EveningLesson } from '../lib/evening-preview'
import { LESSON_NOTE_PHRASES, appendNotePhrase } from '../lib/lesson-note-phrases'

const now = new Date('2026-11-19T13:30:00Z')
const baseUrl = 'https://example.test'

const todayLesson: EveningLesson = {
    id: 't1', date: '2026-11-19', time: '16:30', studioTime: '4:30pm EST', familyTime: '1:30pm their time',
    name: 'Piano Student', minutes: 60, place: 'Zoom', status: 'scheduled', flags: [],
}
const classroom: EveningLesson = { ...todayLesson, id: 't2', time: '18:00', studioTime: '6:00pm EST', familyTime: null, place: 'classroom', flags: ['0 lessons left'] }
const unlogged: UnloggedLesson = {
    id: 'u1', date: '2026-11-18', time: '17:00', duration: 60, status: 'scheduled', studentId: 's1',
    studentName: 'Piano Student', accountStatus: 'active', zoomMeetingId: null, hasVideo: true, hasDropboxFolder: true,
    recordingUrl: 'https://www.dropbox.com/s/abc/lesson.mp4?dl=0',
}

// 1. Only today's lessons: the email still goes, led by them.
const onlyToday = buildMorningEmail('2026-11-18', [], [], { now, baseUrl, today: { date: '2026-11-19', lessons: [todayLesson, classroom] } })
assert.equal(onlyToday.subject, 'Today: 2 lessons, first at 4:30pm EST')
assert.match(onlyToday.html, /^<h3[^>]*>Today, Thursday, Nov 19 \(2 lessons\)<\/h3>/)
assert.match(onlyToday.html, /<b>4:30pm EST<\/b> <span[^>]*>\(1:30pm their time\)<\/span>: Piano Student, 60 min, Zoom/)
assert.match(onlyToday.html, /6:00pm EST<\/b>: Piano Student, 60 min, classroom<br><span[^>]*>0 lessons left/)
assert.match(onlyToday.footer, /Nothing from Wednesday, Nov 18 is waiting to be logged/)
assert.match(onlyToday.footer, /a lesson today/)

// 2. Unlogged with a recording: Today first, then the lesson with Watch before Log it.
const both = buildMorningEmail('2026-11-18', [unlogged], [], { now, baseUrl, today: { date: '2026-11-19', lessons: [todayLesson] } })
assert.equal(both.subject, '1 lesson from Wednesday, Nov 18 not logged yet; today: 1 lesson')
assert.ok(both.html.indexOf('Today, Thursday') < both.html.indexOf('Not logged yet (1)'))
assert.match(both.html, /<a href="https:\/\/www\.dropbox\.com\/s\/abc\/lesson\.mp4\?dl=0" style="[^"]*">Watch<\/a><a href="https:\/\/example\.test\/api\/lesson-action\?t=[^"]+" style="[^"]*">Log it<\/a>/)
assert.match(both.footer, /<b>Watch<\/b> opens the lesson's recording/)

// 3. A classroom video of known length says so; no recording, no Watch.
const timed = buildMorningEmail('2026-11-18', [{ ...unlogged, recordingUrl: 'https://media.example.test/rec_1763503200000.mp4', recordingMinutes: 41.6 }], [], { now, baseUrl })
assert.match(timed.html, />Watch \(42 min\)<\/a>/)
const none = buildMorningEmail('2026-11-18', [{ ...unlogged, recordingUrl: null }], [], { now, baseUrl })
assert.ok(!/Watch/.test(none.html + none.footer))

// 4. No lessons today, but something unlogged: the list says so; loading failed says that.
const empty = buildMorningEmail('2026-11-18', [unlogged], [], { now, baseUrl, today: { date: '2026-11-19', lessons: [] } })
assert.match(empty.html, /No lessons today\./)
assert.equal(empty.subject, '1 lesson from Wednesday, Nov 18 not logged yet')
const failed = buildMorningEmail('2026-11-18', [unlogged], [], { now, baseUrl, today: { date: '2026-11-19', lessons: null } })
assert.match(failed.html, /could not be loaded/)

// 5. Phrases append on their own line, never replace.
assert.deepEqual([...LESSON_NOTE_PHRASES], ['Great job today!', 'Keep counting', 'Practice hands separately'])
assert.equal(appendNotePhrase('', 'Keep counting'), 'Keep counting')
assert.equal(appendNotePhrase('  ', 'Keep counting'), 'Keep counting')
assert.equal(appendNotePhrase('Worked on bars 1-8.', 'Keep counting'), 'Worked on bars 1-8.\nKeep counting')
assert.equal(appendNotePhrase('Worked on bars 1-8.\n', 'Keep counting'), 'Worked on bars 1-8.\nKeep counting')
assert.equal(appendNotePhrase('Great job today! ', 'Keep counting'), 'Great job today!\nKeep counting')

// No em dashes anywhere a person reads.
for (const s of [onlyToday.subject, onlyToday.html, onlyToday.footer, both.subject, both.html, both.footer, empty.html, failed.html]) {
    assert.ok(!s.includes(String.fromCharCode(0x2014)), `em dash in: ${s}`)
}

console.log('check_morning_email_today: all checks passed')
