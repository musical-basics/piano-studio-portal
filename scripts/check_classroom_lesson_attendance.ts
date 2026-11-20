/**
 * Self-check for the classroom attendance of a lesson (#1066, #1103, #1104,
 * lib/classroom-lesson-attendance.ts): the sums, the admin line, the morning
 * email's "No-show?" and button, and the "waiting alone" check. No network,
 * no database.
 *
 *   npx tsx scripts/check_classroom_lesson_attendance.ts
 */
import assert from 'node:assert/strict'
import {
    classroomAttendanceLine, classroomAttendanceNote, summarizeClassroomAttendance, waitingAlone,
    type ClassroomAttendanceRow,
} from '../lib/classroom-lesson-attendance'
import { buildMorningEmail, suggestsNoShow, type UnloggedLesson } from '../lib/unlogged-lessons'
import { aloneEmail } from '../lib/classroom-alone-alert'

const S = '3a7b64a1-67bd-4d16-a921-9215046da9c5'
const row = (role: string, joined: string, left: string | null): ClassroomAttendanceRow =>
    ({ student_id: S, role, joined_at: joined, left_at: left })

// Thu Nov 19 2026, 6:30pm EST lesson (23:30 UTC), 45 minutes.
const START = Date.parse('2026-11-19T23:30:00Z')
const END = START + 45 * 60_000
const AFTER = END + 3 * 60 * 60_000

// Lionel 6:28-7:16, student 6:31-7:00: "you 48 min, student 29 min (joined 6:31pm)".
let a = summarizeClassroomAttendance([
    row('teacher', '2026-11-19T23:28:00Z', '2026-11-20T00:16:00Z'),
    row('student', '2026-11-19T23:31:00Z', '2026-11-20T00:00:00Z'),
], START, END, AFTER)
assert.equal(a.kind, 'student_joined')
assert.equal(a.togetherSeconds, 29 * 60)
assert.equal(classroomAttendanceLine(a).text, 'Classroom: you 48 min, student 29 min (joined 6:31pm)')
assert.match(classroomAttendanceLine(a).title, /Together in the room: 29 min/)
assert.equal(classroomAttendanceNote(a), 'Classroom: the student was there 29 min, you 48 min')

// A reload and a second device never count twice.
a = summarizeClassroomAttendance([
    row('teacher', '2026-11-19T23:28:00Z', '2026-11-20T00:16:00Z'),
    row('teacher', '2026-11-19T23:40:00Z', '2026-11-20T00:10:00Z'),
    row('student', '2026-11-19T23:31:00Z', '2026-11-19T23:45:00Z'),
    row('student', '2026-11-19T23:45:00Z', '2026-11-20T00:00:00Z'),
], START, END, AFTER)
assert.equal(a.teacherSeconds, 48 * 60)
assert.equal(a.studentSeconds, 29 * 60)

// Only Lionel (the student 1 minute): No-show.
a = summarizeClassroomAttendance([
    row('teacher', '2026-11-19T23:29:00Z', '2026-11-20T00:15:00Z'),
    row('student', '2026-11-19T23:50:00Z', '2026-11-19T23:51:00Z'),
], START, END, AFTER)
assert.equal(a.kind, 'only_you')
assert.equal(classroomAttendanceNote(a), 'No-show? Classroom: you were there 46 min, the student only 1 min')
assert.equal(classroomAttendanceLine(a).text, 'Classroom: you 46 min, student 1 min (joined 6:50pm)')
const onlyYou = a

// Nobody; the student alone; joins far from the lesson do not count; unknown roles ignored.
assert.equal(summarizeClassroomAttendance([], START, END, AFTER).kind, 'nobody')
assert.equal(classroomAttendanceLine(summarizeClassroomAttendance([], START, END, AFTER)).text, 'Classroom: no one joined')
a = summarizeClassroomAttendance([row('student', '2026-11-19T23:30:00Z', '2026-11-20T00:10:00Z')], START, END, AFTER)
assert.equal(a.kind, 'host_absent')
assert.equal(classroomAttendanceLine(a).text, 'Classroom: student 40 min (joined 6:30pm), you did not join')
assert.equal(summarizeClassroomAttendance([row('teacher', '2026-11-19T20:00:00Z', '2026-11-19T21:00:00Z')], START, END, AFTER).kind, 'nobody')
assert.equal(summarizeClassroomAttendance([row('egress', '2026-11-19T23:30:00Z', '2026-11-20T00:10:00Z')], START, END, AFTER).kind, 'nobody')

// Still in the room: counted to now and said so.
a = summarizeClassroomAttendance([row('teacher', '2026-11-19T23:30:00Z', null)], START, END, START + 10 * 60_000)
assert.equal(a.inRoom, true)
assert.equal(classroomAttendanceLine(a).text, 'Classroom: you 10 min, the student did not join, in the room now')

// ------------------------------------------------ morning email (#1066) ---

const base: UnloggedLesson = {
    id: 'l1', date: '2026-11-19', time: '18:30', duration: 45, status: 'scheduled', studentId: S, studentName: 'Piano Student',
    accountStatus: 'active', zoomMeetingId: '123', hasVideo: false, hasDropboxFolder: true,
}
// Classroom lesson, Zoom never started, only Lionel in the room: No-Show.
const cls: UnloggedLesson = { ...base, classroomVenue: true, attendance: { kind: 'never_started' }, classroomAttendance: onlyYou }
assert.equal(suggestsNoShow(cls), true)
// ...but not with a recording, or when Zoom shows the student.
assert.equal(suggestsNoShow({ ...cls, classroomRecording: true }), false)
assert.equal(suggestsNoShow({ ...cls, attendance: { kind: 'student_joined', hostMinutes: 40, studentMinutes: 40 } }), false)
// A Zoom lesson where Zoom could not be read: the classroom alone does not decide.
assert.equal(suggestsNoShow({ ...cls, classroomVenue: false, attendance: { kind: 'unknown', reason: 'x' } }), false)
assert.equal(suggestsNoShow({ ...cls, classroomVenue: true, attendance: { kind: 'unknown', reason: 'x' } }), true)
// Zoom's own No-Show (#797) stays, unless the student was in the classroom or the record is unknown.
const zoomOnly: UnloggedLesson = { ...base, attendance: { kind: 'only_you', hostMinutes: 30, othersMinutes: 0 } }
assert.equal(suggestsNoShow(zoomOnly), true)
const inClassroom = summarizeClassroomAttendance([row('teacher', '2026-11-19T23:30:00Z', '2026-11-20T00:15:00Z'), row('student', '2026-11-19T23:31:00Z', '2026-11-20T00:14:00Z')], START, END, AFTER)
assert.equal(suggestsNoShow({ ...zoomOnly, classroomAttendance: inClassroom }), false)
assert.equal(suggestsNoShow({ ...zoomOnly, classroomAttendance: { kind: 'unknown', reason: 'x' } }), false)
// Nothing known at all: no button.
assert.equal(suggestsNoShow(base), false)

// The one-tap buttons need a signing key; a throwaway one here.
process.env.CRON_SECRET ||= 'self-check-only'
const now = new Date('2026-11-20T13:30:00Z')
const email = buildMorningEmail('2026-11-19', [cls], [], { now, baseUrl: 'https://example.test' })
assert.match(email.subject, /1 No-show\?/)
assert.match(email.html, /No-show\? Classroom: you were there 46 min, the student only 1 min/)
assert.doesNotMatch(email.html, /Zoom never started/) // a classroom lesson's unused Zoom meeting is not news
assert.match(email.footer, /Zoom or the classroom shows nobody but you joined/)
assert.match(email.html, />No-Show</)
// A Zoom lesson where the student was in the classroom: both notes, no "No-show?".
const both = buildMorningEmail('2026-11-19', [{ ...zoomOnly, classroomAttendance: inClassroom }], [], { now, baseUrl: 'https://example.test' })
assert.doesNotMatch(both.html, /No-show\?/)
assert.match(both.html, /Zoom: only you joined \(30 min\); Classroom: the student was there 43 min, you 45 min/)

// ------------------------------------------------ waiting alone (#1104) ---

const slot = { startMs: START, endMs: END }
const at = (iso: string) => Date.parse(iso)
// Joined 6:28, lesson 6:30, nobody else: due at 6:35, counted from the start.
let w = waitingAlone([row('student', '2026-11-19T23:28:00Z', null)], slot, at('2026-11-19T23:34:00Z'))
assert.equal(w?.due, false)
w = waitingAlone([row('student', '2026-11-19T23:28:00Z', null)], slot, at('2026-11-19T23:35:00Z'))
assert.equal(w?.due, true)
assert.equal(w?.aloneSinceMs, START)
assert.equal(w?.joinedMs, at('2026-11-19T23:28:00Z'))
// Joined early (6:10): nothing before the start, and still only 5 minutes after it.
assert.equal(waitingAlone([row('student', '2026-11-19T23:10:00Z', null)], slot, at('2026-11-19T23:29:00Z'))?.due, false)
assert.equal(waitingAlone([row('student', '2026-11-19T23:10:00Z', null)], slot, at('2026-11-19T23:34:59Z'))?.due, false)
// Joined late (6:40): due at 6:45.
assert.equal(waitingAlone([row('student', '2026-11-19T23:40:00Z', null)], slot, at('2026-11-19T23:44:00Z'))?.due, false)
assert.equal(waitingAlone([row('student', '2026-11-19T23:40:00Z', null)], slot, at('2026-11-19T23:45:00Z'))?.due, true)
// A reload keeps the wait; leaving for 10 minutes starts it again.
w = waitingAlone([row('student', '2026-11-19T23:31:00Z', '2026-11-19T23:33:00Z'), row('student', '2026-11-19T23:33:20Z', null)], slot, at('2026-11-19T23:36:00Z'))
assert.equal(w?.due, true)
w = waitingAlone([row('student', '2026-11-19T23:20:00Z', '2026-11-19T23:25:00Z'), row('student', '2026-11-19T23:35:00Z', null)], slot, at('2026-11-19T23:38:00Z'))
assert.equal(w?.due, false)
// Lionel in the room now, or earlier for this lesson: no email.
assert.equal(waitingAlone([row('student', '2026-11-19T23:28:00Z', null), row('teacher', '2026-11-19T23:33:00Z', null)], slot, at('2026-11-19T23:40:00Z')), null)
assert.equal(waitingAlone([row('student', '2026-11-19T23:28:00Z', null), row('teacher', '2026-11-19T23:10:00Z', '2026-11-19T23:32:00Z')], slot, at('2026-11-19T23:40:00Z')), null)
// Lionel in the room hours before (another day's leftover) does not count.
assert.equal(waitingAlone([row('student', '2026-11-19T23:28:00Z', null), row('teacher', '2026-11-19T20:00:00Z', '2026-11-19T21:00:00Z')], slot, at('2026-11-19T23:40:00Z'))?.due, true)
// The student gone, or the lesson over: nothing.
assert.equal(waitingAlone([row('student', '2026-11-19T23:28:00Z', '2026-11-19T23:33:00Z')], slot, at('2026-11-19T23:40:00Z')), null)
assert.equal(waitingAlone([row('student', '2026-11-19T23:28:00Z', null)], slot, END), null)

const mail = aloneEmail({
    studentId: S, studentName: 'Piano Student', lessonId: 'l1', date: '2026-11-19', time: '18:30',
    wait: waitingAlone([row('student', '2026-11-19T23:28:00Z', null)], slot, at('2026-11-19T23:35:30Z'))!, classroomVenue: true,
}, new Date('2026-11-19T23:35:30Z'))
assert.equal(mail.subject, 'Piano Student is waiting alone in the classroom (5 min)')
assert.match(mail.lines[0], /joined the classroom at 6:28pm EST, before their 6:30pm EST lesson/)
assert.match(mail.html, new RegExp(`/start/${S}"`))
assert.doesNotMatch(mail.html + mail.footer + mail.subject, new RegExp('\\u2014')) // no em dashes

console.log('check_classroom_lesson_attendance: all good')
