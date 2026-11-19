/**
 * Self-check for homework as a checklist (#945, lib/homework.ts): how free-text
 * homework becomes items, and that a tick only counts while its item still
 * reads the same. No network, no database.
 *
 *   npx tsx scripts/check_homework.ts
 */
import assert from 'node:assert/strict'
import { homeworkItems, tickedIndexes } from '../lib/homework'

// One line is one item, even a long one with sentences.
assert.deepEqual(homeworkItems('Attached exercise.'), ['Attached exercise.'])
assert.deepEqual(
    homeworkItems('Great job on the etude! This week: expand measures 51-54. Create a new piece.'),
    ['Great job on the etude! This week: expand measures 51-54. Create a new piece.'],
)
// Numbers, dashes, stars and bullets are stripped; blank lines dropped; CRLF too.
assert.deepEqual(
    homeworkItems('1. Scales in C and G\r\n2) Hanon no. 1\n\n- Sight-read 2 pages\n* Listen to the Chopin\n• Clap the rhythm in bar 12\n   '),
    ['Scales in C and G', 'Hanon no. 1', 'Sight-read 2 pages', 'Listen to the Chopin', 'Clap the rhythm in bar 12'],
)
// Numbers inside a line are kept.
assert.deepEqual(homeworkItems('Play bars 1-8 at 60 bpm'), ['Play bars 1-8 at 60 bpm'])
assert.deepEqual(homeworkItems(null), [])
assert.deepEqual(homeworkItems('   \n  '), [])

// Ticks: by place and wording, for this lesson only.
const items = ['Scales', 'Hanon', 'Sight-read']
const ticks = [
    { lesson_id: 'L1', item_index: 0, item_text: 'Scales' },
    { lesson_id: 'L1', item_index: 2, item_text: 'Sight-reading' }, // homework edited since: not counted
    { lesson_id: 'L2', item_index: 1, item_text: 'Hanon' },         // another lesson
]
assert.deepEqual([...tickedIndexes('L1', items, ticks)], [0])
assert.deepEqual([...tickedIndexes('L1', ['Scales'], [{ lesson_id: 'L1', item_index: 5, item_text: 'x' }])], [])

console.log('check_homework: all checks passed')
