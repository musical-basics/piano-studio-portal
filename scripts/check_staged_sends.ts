/**
 * Self-check for staged family bulk emails (protocol 1.20, lib/staged-send.ts
 * and lib/staged-send-runner.ts). A stand-in for Resend, the inbox and the
 * database: nothing is sent and nothing touches prod. Prints what each batch
 * would send.
 *
 *   npx tsx scripts/check_staged_sends.ts
 */
import assert from 'node:assert/strict'
import {
    batchCounts,
    firstBatchVerdict,
    memoryStore,
    pickFirstBatch,
    restDueAt,
    type StagedDeps,
    type StagedItem,
} from '../lib/staged-send'
import { checkStagedSends, mergeStatementResults, sendRestNow, startEmailStagedSend, startStagedStatements, type RunnerEnv, type StatementOps } from '../lib/staged-send-runner'
import type { FamilyResult } from '../lib/monthly-statements'

const HOUR = 3_600_000

function fakeWorld(start = new Date('2026-12-01T15:00:00Z')) {
    let now = start.getTime()
    let n = 0
    const sent: { to: string[]; subject: string; idem?: string }[] = []
    const events = new Map<string, string>()
    const alerts: string[] = []
    const failTo = new Set<string>()
    const deps: StagedDeps = {
        async send(email) {
            if (email.to.some(t => failTo.has(t))) return { error: 'validation_error: refused' }
            const id = `re_${++n}`
            sent.push({ to: email.to, subject: email.subject, idem: email.idempotencyKey })
            events.set(id, 'sent')
            return { id }
        },
        async lastEvent(id) { return events.get(id) ?? null },
        async inbox() { return 'studio@inbox.example' },
        async alert(subject) { alerts.push(subject); return true },
        async sleep() {},
        now: () => new Date(now),
    }
    return {
        deps, sent, events, alerts, failTo,
        advance(ms: number) { now += ms },
        deliverAll(except: string[] = []) { for (const [id] of events) if (!except.includes(id)) events.set(id, 'delivered') },
    }
}

const families = (count: number, domains = ['gmail.example', 'gmail.example', 'outlook.example', 'school.example', 'gmail.example']) =>
    Array.from({ length: count }, (_, i) => ({
        key: `addr:family${i + 1}@${domains[i % domains.length]}`,
        to: [`family${i + 1}@${domains[i % domains.length]}`],
        email: { subject: 'Recital on Sunday', html: '<p>Hi!</p>' },
    }))

function show(title: string, items: StagedItem[]) {
    const line = (b: 'first' | 'rest') => items.filter(i => i.batch === b).map(i => `${i.to[0]}(${i.status})`).join(', ')
    console.log(`  ${title}\n    first: ${line('first')}\n    rest:  ${line('rest')}`)
}

async function main() {
    // 1. Pure parts.
    const picked = pickFirstBatch(families(10))
    assert.deepEqual([...picked].sort(), [0, 2, 3], 'different providers first: gmail, outlook, school')
    assert.deepEqual([...pickFirstBatch(families(5, ['gmail.example']))].sort(), [0, 1, 2], 'one provider: the first 3')
    const t0 = new Date('2026-12-01T15:00:00Z')
    assert.equal(restDueAt(t0).toISOString(), '2026-12-02T15:00:00.000Z', '24 hours later')
    assert.equal(restDueAt(t0, new Date(t0.getTime() + 5 * HOUR)).toISOString(), new Date(t0.getTime() + 5 * HOUR).toISOString(), 'a recital sooner: by its deadline')
    assert.equal(restDueAt(t0, new Date(t0.getTime() + 10 * 60_000)).toISOString(), new Date(t0.getTime() + 30 * 60_000).toISOString(), 'never under 30 minutes')
    assert.equal(firstBatchVerdict([{ key: 'a', to: ['a'], batch: 'first', status: 'sent', lastEvent: 'opened' }]).kind, 'ok', 'opened counts as delivered')

    // 2. An announcement to 10 families: preview, first 3, the rest after 24 hours once delivered.
    console.log('Announcement to 10 families:')
    let w = fakeWorld()
    let env: RunnerEnv = { store: memoryStore(), deps: w.deps }
    let out = await startEmailStagedSend(env, { kind: 'announcement', ref: 'ann-1', label: 'Recital on Sunday', recipients: families(10) })
    assert.equal(w.sent[0].to[0], 'studio@inbox.example', 'the preview goes to the studio inbox first')
    assert.ok(w.sent[0].subject.startsWith('Preview: '))
    assert.equal(w.sent.length, 4, 'preview + 3 families')
    assert.equal(out.firstSent, 3)
    assert.equal(out.restCount, 7)
    assert.equal(out.record?.status, 'waiting')
    assert.equal(out.restDueAt, '2026-12-02T15:00:00.000Z')
    console.log(`  sent now: ${w.sent.map(s => s.to[0]).join(', ')}`)
    show('after the start', out.record!.items)
    assert.ok(out.record!.items.filter(i => i.status === 'sent').every(i => i.email === null), 'sent bodies are dropped')
    assert.ok(out.record!.items.filter(i => i.status === 'pending').every(i => i.email?.subject), 'the rest keep their email')

    const again = await startEmailStagedSend(env, { kind: 'announcement', ref: 'ann-1', label: 'Recital on Sunday', recipients: families(10) })
    assert.equal(again.conflict, true, 'the same announcement is never staged twice')
    assert.equal(w.sent.length, 4, 'and nothing more went out')

    w.deliverAll()
    w.advance(2 * HOUR)
    let rep = await checkStagedSends(env)
    assert.deepEqual(rep.restSent, [], 'not due yet')
    assert.equal(w.sent.length, 4)
    let rec = await env.store.get(out.record!.id)
    assert.equal(batchCounts(rec!.items, 'first').delivered, 3, 'delivery reports recorded while waiting')

    w.advance(22 * HOUR + 1)
    rep = await checkStagedSends(env)
    assert.equal(rep.restSent.length, 1, 'due, all 3 delivered: the rest goes')
    assert.equal(w.sent.length, 11, 'one email for each of the other 7')
    rec = await env.store.get(out.record!.id)
    assert.equal(rec!.status, 'done')
    assert.equal(rec!.rest_sent_by, 'schedule')
    show('after the rest', rec!.items)
    assert.ok(w.sent.slice(4).every(s => s.idem?.startsWith(`staged/${rec!.id}/`)), 'each email carries its idempotency key')

    w.events.set('re_9', 'bounced')
    w.advance(30 * 60_000)
    rep = await checkStagedSends(env)
    assert.deepEqual(rep.checked, [], 'the rest is read again only an hour after it went')
    w.advance(31 * 60_000)
    w.deliverAll(['re_9'])
    rep = await checkStagedSends(env)
    assert.equal(rep.checked.length, 1)
    rec = await env.store.get(out.record!.id)
    assert.equal(batchCounts(rec!.items, 'rest').bounced, 1, 'a bounce in the rest is recorded')
    assert.equal(w.alerts.length, 1, 'and emailed to the studio')
    rep = await checkStagedSends(env)
    assert.equal(rep.looked, 0, 'a checked send is finished')

    // 3. A bounce in the first batch stops the send at once; "Send the rest now" overrides.
    console.log('First batch with a bounce:')
    w = fakeWorld()
    env = { store: memoryStore(), deps: w.deps }
    out = await startEmailStagedSend(env, { kind: 'announcement', ref: 'ann-2', label: 'Holiday hours', recipients: families(6) })
    w.deliverAll()
    w.events.set('re_3', 'bounced')
    w.advance(HOUR)
    rep = await checkStagedSends(env)
    assert.equal(rep.stopped.length, 1, 'stopped before the 24 hours were up')
    rec = await env.store.get(out.record!.id)
    assert.equal(rec!.status, 'stopped')
    assert.match(rec!.stop_reason || '', /bounced/)
    assert.equal(w.alerts.length, 1, 'the studio inbox is told why')
    console.log(`  stopped: ${rec!.stop_reason}`)
    w.advance(30 * HOUR)
    rep = await checkStagedSends(env)
    assert.equal(w.sent.length, 4, 'a stopped send never goes on by itself')
    const byHand = await sendRestNow(env, out.record!.id)
    assert.ok(byHand.ok && byHand.sent === 3, 'Send the rest now sends the other 3')
    rec = await env.store.get(out.record!.id)
    assert.equal(rec!.rest_sent_by, 'hand')
    assert.match(rec!.stop_reason || '', /sent anyway by hand/)
    const twice = await sendRestNow(env, out.record!.id)
    assert.ok(!twice.ok, 'and never twice')

    // 4. No "delivered" report by the time the rest is due: stop.
    w = fakeWorld()
    env = { store: memoryStore(), deps: w.deps }
    out = await startEmailStagedSend(env, { kind: 'announcement', ref: 'ann-3', label: 'Note', recipients: families(5) })
    w.deliverAll(['re_4'])
    w.advance(24 * HOUR + 1)
    rep = await checkStagedSends(env)
    rec = await env.store.get(out.record!.id)
    assert.equal(rec!.status, 'stopped')
    assert.match(rec!.stop_reason || '', /not reported delivered/)
    assert.equal(w.sent.length, 4)

    // 5. The preview does not send: nothing goes to families.
    w = fakeWorld()
    w.failTo.add('studio@inbox.example')
    env = { store: memoryStore(), deps: w.deps }
    out = await startEmailStagedSend(env, { kind: 'announcement', ref: 'ann-4', label: 'Note', recipients: families(5) })
    assert.ok(out.stopped)
    assert.equal(w.sent.length, 0)
    assert.equal(out.record?.status, 'stopped')

    // 6. A first-batch email refused: stopped at once.
    w = fakeWorld()
    w.failTo.add('family3@outlook.example')
    env = { store: memoryStore(), deps: w.deps }
    out = await startEmailStagedSend(env, { kind: 'announcement', ref: 'ann-5', label: 'Note', recipients: families(5) })
    assert.ok(out.stopped && /did not all send/.test(out.stopped))
    assert.equal(out.record?.status, 'stopped')

    // 7. Recital emails: the rest goes by 3 hours before the start, and the log marks sent and queued.
    console.log('Recital emails, recital in 6 hours:')
    w = fakeWorld()
    const marks: string[] = []
    env = {
        store: memoryStore(), deps: w.deps,
        recitalLog: { async mark(_e, sentItems, queued) { marks.push(`sent ${sentItems.filter(i => i.status === 'sent').length}, queued ${queued.items.length}`) } },
    }
    const startAt = new Date(w.deps.now().getTime() + 6 * HOUR)
    out = await startEmailStagedSend(env, {
        kind: 'recital', ref: 'event-1/1', label: 'Winter recital', recipients: families(8),
        deadline: new Date(startAt.getTime() - 3 * HOUR), context: { eventId: 'event-1' },
    })
    assert.equal(out.restDueAt, new Date(w.deps.now().getTime() + 3 * HOUR).toISOString())
    assert.deepEqual(marks, ['sent 3, queued 5'])
    w.deliverAll()
    w.advance(3 * HOUR + 1)
    await checkStagedSends(env)
    assert.deepEqual(marks, ['sent 3, queued 5', 'sent 5, queued 0'])
    console.log(`  first 3 at once, the other 5 three hours later (${w.sent.length - 1} family emails)`)

    // 8. Monthly statements: rebuilt when sent; the claim table keeps anyone from two.
    console.log('Monthly statements for 10 families:')
    w = fakeWorld()
    const ids = Array.from({ length: 10 }, (_, i) => `student-${i + 1}`)
    const claimed = new Set<string>()
    const runs: string[] = []
    const ops: StatementOps = {
        async plan() {
            return ids.map((id, i) => ({ studentId: id, status: 'would_send', notes: [], to: `parent${i + 1}@${['gmail.example', 'yahoo.example', 'gmail.example'][i % 3]}`, subject: 'Your November lesson summary', text: 'Hi', html: '<p>Hi</p>' } as FamilyResult))
        },
        async send(_month, only) {
            runs.push(only ? `ids ${only.length}` : 'everyone left')
            return ids.filter(id => !only || only.includes(id)).map(id => {
                if (claimed.has(id)) return { studentId: id, status: 'already_sent', notes: [] } as FamilyResult
                claimed.add(id)
                return { studentId: id, status: 'sent', notes: [], resendId: `re_s_${id}`, to: `${id}@example` } as FamilyResult
            })
        },
    }
    for (const id of ids) w.events.set(`re_s_${id}`, 'delivered')
    env = { store: memoryStore(), deps: w.deps, statements: ops }
    const st = await startStagedStatements(env, '2026-11')
    assert.equal(st.mode, 'staged')
    if (st.mode !== 'staged') throw new Error('not staged')
    assert.equal(st.firstSent, 3)
    assert.equal(st.restCount, 7)
    assert.equal(w.sent.length, 1, 'only the preview went through the staged sender (statements send themselves)')
    assert.match(w.sent[0].subject, /^Preview: Your November lesson summary/)
    show('statements after the start', st.record!.items)
    const held = await startStagedStatements(env, '2026-11')
    assert.equal(held.mode, 'held', 'the second trigger on the 1st sends nothing')
    w.advance(24 * HOUR + 1)
    await checkStagedSends(env)
    assert.deepEqual(runs, ['ids 3', 'everyone left'])
    rec = await env.store.find('monthly_statement', '2026-11')
    assert.equal(rec!.status, 'done')
    assert.equal(batchCounts(rec!.items, 'rest').sent, 7)
    assert.equal(claimed.size, 10, 'every family once')
    const after = await startStagedStatements(env, '2026-11')
    assert.equal(after.mode, 'direct', 'after the staged send, a run only catches up on anyone left')

    // 9. mergeStatementResults: a newly active family joins the rest.
    const merged = mergeStatementResults([{ key: 'student:a', to: ['a'], batch: 'first', status: 'sent' }], [{ studentId: 'b', status: 'sent', notes: [], to: 'b@x', resendId: 'r' } as FamilyResult], 'rest')
    assert.equal(merged.length, 2)
    assert.equal(merged[1].batch, 'rest')

    // 10. A send cut off partway is handed back.
    w = fakeWorld()
    const store = memoryStore()
    env = { store, deps: w.deps }
    out = await startEmailStagedSend(env, { kind: 'announcement', ref: 'ann-6', label: 'Note', recipients: families(4) })
    await store.update(out.record!.id, { status: 'sending_rest' })
    store.rows[0].updated_at = new Date(w.deps.now().getTime() - 20 * 60_000).toISOString()
    rep = await checkStagedSends(env)
    assert.deepEqual(rep.unstuck, [out.record!.id])
    assert.equal((await store.get(out.record!.id))!.status, 'stopped')

    console.log('check_staged_sends: all good')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
