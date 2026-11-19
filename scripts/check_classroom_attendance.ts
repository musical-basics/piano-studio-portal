/**
 * Self-check for logging classroom lessons by attendance (#795,
 * lib/classroom-attendance.ts): time together is teacher AND student in the
 * room, merged, put on the lesson whose slot holds its start, and nothing is
 * decided while someone is still in the room. No network, no database.
 *
 *   npx tsx scripts/check_classroom_attendance.ts
 */
import assert from 'node:assert/strict'
import { STALE_OPEN_MS, minutesPerLesson, togetherSegments, type AttendanceRow } from '../lib/classroom-attendance'
import { autoLogSource, AUTO_LOG_SOURCES } from '../lib/auto-logged-lessons'

const S = '3a7b64a1-67bd-4d16-a921-9215046da9c5'
const row = (role: string, joined: string, left: string | null): AttendanceRow =>
    ({ student_id: S, role, joined_at: joined, left_at: left })
const minutes = (segs: { startMs: number; endMs: number }[]) => segs.reduce((m, s) => m + (s.endMs - s.startMs) / 60_000, 0)
const NOW = Date.parse('2026-11-19T23:30:00Z')

// Thu Nov 19 2026, 5:30pm EST lesson (22:30 UTC), 45 minutes.
const lesson = { id: 'nov-19', date: '2026-11-19', time: '17:30:00', duration: 45, status: 'scheduled', video_url: null }
const other = { id: 'nov-12', date: '2026-11-12', time: '17:30:00', duration: 45, status: 'completed', video_url: null }

// Teacher in from 5:25, student 5:31 to 6:14 with a 1-minute reload at 5:50: 42 min together.
const normal = [
    row('teacher', '2026-11-19T22:25:00Z', '2026-11-19T23:16:00Z'),
    row('student', '2026-11-19T22:31:00Z', '2026-11-19T22:50:00Z'),
    row('student', '2026-11-19T22:51:00Z', '2026-11-19T23:14:00Z'),
]
let t = togetherSegments(normal, NOW)
assert.equal(t.inRoom, false)
assert.equal(Math.round(minutes(t.segments)), 42)
let per = minutesPerLesson(t.segments, [lesson, other])
assert.equal(per.perLesson.length, 1)
assert.equal(per.perLesson[0].lesson.id, 'nov-19')
assert.equal(Math.round(per.perLesson[0].minutes), 42)

// Two teacher devices at once never count twice.
t = togetherSegments([...normal, row('teacher', '2026-11-19T22:30:00Z', '2026-11-19T23:15:00Z')], NOW)
assert.equal(Math.round(minutes(t.segments)), 42)

// Teacher alone, or only the student: nothing together.
assert.equal(togetherSegments([normal[0]], NOW).segments.length, 0)
assert.equal(togetherSegments(normal.slice(1), NOW).segments.length, 0)

// Someone still connected (recent): decide later, never mid-lesson.
t = togetherSegments([normal[0], row('student', '2026-11-19T22:31:00Z', null)], Date.parse('2026-11-19T23:00:00Z'))
assert.equal(t.inRoom, true)

// An open row older than 4 hours lost its "left": it counts nothing and blocks nothing.
t = togetherSegments([row('teacher', '2026-11-19T10:00:00Z', null), normal[1]], NOW)
assert.ok(NOW - Date.parse('2026-11-19T10:00:00Z') > STALE_OPEN_MS)
assert.equal(t.inRoom, false)
assert.equal(t.segments.length, 0)

// Unknown roles (the recorder, a guest) are ignored.
assert.equal(togetherSegments([normal[0], row('egress', '2026-11-19T22:31:00Z', '2026-11-19T23:14:00Z')], NOW).segments.length, 0)

// Time together at an hour with no lesson goes on no lesson.
per = minutesPerLesson(togetherSegments([
    row('teacher', '2026-11-19T15:00:00Z', '2026-11-19T15:40:00Z'),
    row('student', '2026-11-19T15:00:00Z', '2026-11-19T15:40:00Z'),
], NOW).segments, [lesson])
assert.equal(per.perLesson.length, 0)
assert.equal(per.unmatched.length, 1)

// The morning email (#793) lists attendance logs under their own label.
assert.ok((AUTO_LOG_SOURCES as readonly string[]).includes('classroom_attendance'))
assert.equal(autoLogSource('classroom_attendance', null), 'attendance')
assert.equal(autoLogSource('system', 'https://pub-x.r2.dev/a_1795065474287.mp4'), 'classroom')

console.log('classroom attendance checks passed')
