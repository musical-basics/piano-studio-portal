/**
 * Self-check for the classroom recording hand-off (lib/classroom-recordings.ts):
 * a recording goes on the lesson it was recorded in, by its start time, and never
 * on the next week's lesson. No network, no database.
 *
 *   npx tsx scripts/check_classroom_recordings.ts
 */
import assert from 'node:assert/strict'
import { matchLesson, recordingStartMs } from '../lib/classroom-recordings'

const STUDENT = '5d9ce59d-87c2-4e34-bc95-cff3f5ca08bf'
const R2 = 'https://pub-example.r2.dev'
const lesson = (id: string, date: string, time: string, extra: Partial<{ duration: number; status: string; video_url: string }> = {}) => ({
    id, date, time, duration: 30, status: 'completed', video_url: null as string | null, ...extra,
})

// Start stamps parse from egress keys only; the old in-browser recorders stamped
// at upload (a 358 MB Mar 19 lesson would otherwise look like a 72-second clip).
assert.equal(recordingStartMs(`${R2}/${STUDENT}_1783634484440.mp4`), 1783634484440)
assert.equal(recordingStartMs(`${R2}/${STUDENT}_1773961666960_part1.mp4`), null)
assert.equal(recordingStartMs(`${R2}/${STUDENT}_1767436938071.webm`), null)

// Real case: Thu Jul 9 2026, 6pm EDT lesson; the classroom recording began 6:01pm EDT.
const weekly = [
    lesson('jul-02', '2026-07-02', '18:00:00'),
    lesson('jul-09', '2026-07-09', '18:00:00'),
    lesson('jul-16', '2026-07-16', '18:00:00', { status: 'scheduled' }),
]
const jul9 = { url: `${R2}/${STUDENT}_1783634484440.mp4`, created_at: '2026-07-09T22:46:50.702Z' }
assert.equal(matchLesson(jul9, weekly)?.id, 'jul-09', 'goes on the lesson it was recorded in, not the next open one')

// Winter (EST): Sun Nov 15 2026 8:45pm EST lesson, recording 8:38pm EST.
const nov = [lesson('nov-15', '2026-11-15', '20:45:00')]
const nov15 = { url: `${R2}/x_1794793099663.mp4`, created_at: '2026-11-16T02:10:22.923Z' }
assert.equal(matchLesson(nov15, nov)?.id, 'nov-15', 'Eastern wall-clock in standard time')

// Moved over from Zoom part way in: started 25 min into a 60-minute lesson.
const late = Date.parse('2026-07-09T22:25:00Z') // 6:25pm EDT
assert.equal(matchLesson({ url: `${R2}/x_${late}.mp4`, created_at: '2026-07-09T23:10:00Z' },
    [lesson('long', '2026-07-09', '18:00:00', { duration: 60 })])?.id, 'long')

// A recording at a time with no lesson matches nothing (test clips, other students' rooms).
const offHours = Date.parse('2026-07-03T01:17:17Z') // Jul 2, 9:17pm EDT
assert.equal(matchLesson({ url: `${R2}/x_${offHours}.mp4`, created_at: '2026-07-03T01:23:36Z' }, weekly), null)

// Cancelled lessons are never matched.
assert.equal(matchLesson(jul9, [lesson('jul-09', '2026-07-09', '18:00:00', { status: 'cancelled' })]), null)

// Two lessons the same evening: the one whose start is closest wins.
const pair = [lesson('a', '2026-07-09', '17:30:00'), lesson('b', '2026-07-09', '18:00:00')]
assert.equal(matchLesson(jul9, pair)?.id, 'b')

// No start stamp: judged by when it stopped, within 90 min after the slot ends.
assert.equal(matchLesson({ url: `${R2}/lesson.mp4`, created_at: '2026-07-09T23:00:00Z' }, weekly)?.id, 'jul-09')
assert.equal(matchLesson({ url: `${R2}/lesson.mp4`, created_at: '2026-07-10T03:00:00Z' }, weekly), null)

console.log('classroom recording checks passed')
