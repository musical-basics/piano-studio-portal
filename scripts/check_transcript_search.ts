/**
 * Self-check for the lesson transcript search (#954): the highlighting and
 * time helpers, and (with words given) a live search against the database
 * through the same core the admin action uses (service key, read only).
 *
 *   npx tsx scripts/check_transcript_search.ts                 # helpers only
 *   npx tsx scripts/check_transcript_search.ts pedal "page flip"   # plus live searches
 */
import assert from 'node:assert/strict'
import { config } from 'dotenv'
import { clockTime, folderLabel, highlightParts, queryTerms, searchTranscriptsCore } from '../lib/transcript-search'

config({ path: '.env.local' })

async function main() {
    assert.deepEqual(queryTerms('Pedal'), ['pedal'])
    assert.deepEqual(queryTerms('pedals'), ['pedal'])
    assert.deepEqual(queryTerms('"left hand" -right octave or Grieg'), ['left', 'hand', 'octave', 'grieg'])
    assert.deepEqual(queryTerms('a'), [])

    const hits = (text: string, q: string) =>
        highlightParts(text, queryTerms(q)).filter(p => p.hit).map(p => p.text.trim())
    assert.deepEqual(hits('Use the pedal, then pedaling slowly.', 'pedals'), ['pedal,', 'pedaling'])
    assert.deepEqual(hits('Make the left hand bouncy', '"left hand"'), ['left', 'hand'])
    assert.deepEqual(hits('Nothing here', 'octave'), [])
    assert.equal(highlightParts('Same text', []).map(p => p.text).join(''), 'Same text')

    assert.equal(clockTime(75), '1:15')
    assert.equal(clockTime(3725), '1:02:05')
    assert.equal(clockTime(-3), '0:00')
    assert.equal(folderLabel('Jane Doe Recordings'), 'Jane Doe')
    assert.equal(folderLabel('Jane Doe Lesson Recordings'), 'Jane Doe')
    assert.equal(folderLabel(null), 'Unknown student')
    console.log('helpers ok')

    const words = process.argv.slice(2)
    if (!words.length) return
    const { createAdminClient } = await import('../lib/supabase/admin')
    const client = createAdminClient()
    for (const q of words) {
        const a = await searchTranscriptsCore(client, q)
        console.log(`\n"${q}": ${a.total} lesson(s) of ${a.transcribed} transcribed`)
        for (const r of a.results) {
            assert.ok(r.recordedOn, 'every result has a date')
            console.log(`  a student, ${r.recordedOn}${r.lessonTime ? ` ${r.lessonTime}` : ''}, lesson ${r.lessonId ? 'matched' : 'not matched'}, ${r.hitCount} mention(s)`)
            for (const h of r.hits.slice(0, 3)) console.log(`    [${clockTime(h.s)}] ${h.t}`)
        }
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
