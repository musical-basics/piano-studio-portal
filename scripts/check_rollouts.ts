/**
 * Self-check for the portal rollouts (protocol 1.20, lib/rollouts.ts) and the
 * Tests card's usage numbers (lib/core/tests-report.ts). Fake data only.
 *
 *   npx tsx scripts/check_rollouts.ts
 */
import assert from 'node:assert/strict'
import {
    armFor,
    clearRolloutCache,
    fallbackStages,
    flagsFor,
    halfArm,
    isRolloutAction,
    loadRolloutStages,
    ROLLOUT_FEATURES,
    ROLLOUT_KEYS,
    TEST_STUDENT_ID,
} from '../lib/rollouts'
import { summarizeUsage } from '../lib/core/tests-report'

async function main() {
    const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

    // 1. The half is stable and close to half over many students, and differs per feature.
    for (const k of ROLLOUT_KEYS) {
        const arms = ids.map(id => halfArm(k, id))
        assert.deepEqual(arms, ids.map(id => halfArm(k, id)), `${k}: same student, same arm`)
        const n = arms.filter(a => a === 'new').length
        assert.ok(n > 70 && n < 130, `${k}: ${n} of 200 in the new half`)
        assert.equal(halfArm(k, ids[0].toUpperCase()), halfArm(k, ids[0]), 'case of the id does not matter')
    }
    const differs = ids.some(id => halfArm('my_music', id) !== halfArm('calendar_feed', id))
    assert.ok(differs, 'each feature splits on its own')

    // 2. Stages.
    const s = ids[5]
    assert.equal(armFor('all', 'my_music', s), 'new')
    assert.equal(armFor('off', 'my_music', s), 'old')
    assert.equal(armFor('off', 'my_music', TEST_STUDENT_ID), 'old', 'off: the test student sees the old version too')
    assert.equal(armFor('test', 'my_music', s), 'old')
    assert.equal(armFor('test', 'my_music', TEST_STUDENT_ID), 'new')
    assert.equal(armFor('half', 'my_music', TEST_STUDENT_ID), 'new', 'the test student is always in')
    assert.equal(armFor('half', 'my_music', s), halfArm('my_music', s))
    for (const stage of ['off', 'test', 'half', 'all'] as const) {
        assert.equal(armFor(stage, 'my_music', s, { preview: true }), 'new', `an admin preview shows the new version (${stage})`)
    }
    const flags = flagsFor({ ...fallbackStages(), my_music: 'off' }, s)
    assert.equal(flags.my_music, false)
    assert.equal(flags.calendar_feed, true, 'fallback stage is all')

    // 3. A failed read falls back to the safe stages and is not cached; a good read is.
    clearRolloutCache()
    let reads = 0
    const failing = { from: () => ({ select: async () => { reads++; return { data: null, error: { message: 'down' } } } }) }
    assert.deepEqual(await loadRolloutStages(failing, 1_000), fallbackStages())
    assert.deepEqual(await loadRolloutStages(failing, 1_001), fallbackStages())
    assert.equal(reads, 2, 'a failed read is retried next time')
    const good = { from: () => ({ select: async () => { reads++; return { data: [{ feature: 'my_music', stage: 'half' }, { feature: 'nope', stage: 'all' }, { feature: 'install_tip', stage: 'weird' }], error: null } } }) }
    const st = await loadRolloutStages(good, 2_000)
    assert.equal(st.my_music, 'half')
    assert.equal(st.install_tip, 'all', 'an unknown stage falls back')
    await loadRolloutStages(good, 20_000)
    assert.equal(reads, 3, 'cached for 30 seconds')
    await loadRolloutStages(good, 40_000)
    assert.equal(reads, 4, 'read again after 30 seconds')
    clearRolloutCache()

    // 4. Actions are a fixed list per feature.
    assert.ok(isRolloutAction('my_music', 'downloaded'))
    assert.ok(!isRolloutAction('my_music', 'set_up'))
    assert.ok(!isRolloutAction('my_music', 'toString'))

    // 5. Usage per version: active families only, since the stage began, passive actions apart.
    const since = '2026-11-21T00:00:00Z'
    const at = (h: number) => new Date(Date.parse(since) + h * 3_600_000).toISOString()
    const active = new Set([ids[1], ids[2], ids[3]])
    const events = [
        { feature: 'history_transcripts', student_id: ids[1], arm: 'new', action: 'history_opened', created_at: at(1) },
        { feature: 'history_transcripts', student_id: ids[1], arm: 'new', action: 'searched', created_at: at(1) },
        { feature: 'history_transcripts', student_id: ids[1], arm: 'new', action: 'line_played', created_at: at(2) },
        { feature: 'history_transcripts', student_id: ids[2], arm: 'old', action: 'history_opened', created_at: at(2) },
        { feature: 'history_transcripts', student_id: ids[3], arm: 'new', action: 'searched', created_at: at(-5) },
        { feature: 'history_transcripts', student_id: TEST_STUDENT_ID, arm: 'new', action: 'searched', created_at: at(3) },
        { feature: 'my_music', student_id: ids[1], arm: 'new', action: 'tab_opened', created_at: at(3) },
    ]
    const u = summarizeUsage(ROLLOUT_FEATURES.history_transcripts, events, active, since)
    assert.equal(u.new.families, 1)
    assert.equal(u.new.actions, 2, 'history_opened is passive; the test student and an event before the stage are left out')
    assert.deepEqual(u.new.byAction.map(a => `${a.action}:${a.count}`).sort(), ['history_opened:1', 'line_played:1', 'searched:1'])
    assert.equal(u.old.families, 0, 'opening History is not using transcripts')
    assert.equal(u.old.byAction[0].count, 1)

    console.log('check_rollouts: all good')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
