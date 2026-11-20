import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { MOVE_ACTIONS, verifyLessonAction, type LessonActionClaims } from '@/lib/lesson-action-links'
import { approveMoveRequestCore, declineMoveRequestCore, loadPendingMoveRequest, moveSlotStillFree } from '@/lib/core/move-requests'
import { logLessonCore } from '@/lib/core/lessons'
import { UNLOGGED_STATUSES, formatClock } from '@/lib/unlogged-lessons'
import { studioTzAbbr, studioWallClockToISO } from '@/lib/studio-timezone'
import { QUIET_LOG_AFTER_DAYS, isTooOldForUsualLog, logOldLessonQuietly } from '@/lib/late-lesson-log'
import { lessonEndMs } from '@/lib/unlogged-lessons'
import { MISSED_LESSON_CREDIT_CENTS, getMissedLessonPreviewCore, missedLessonCore } from '@/lib/core/missed-lesson'
import { markNoShowCore } from '@/lib/core/no-show'
import { getUndoLogPreviewCore, undoLessonLogCore, type UndoLogMode } from '@/lib/core/undo-log'
import { attendanceNote, zoomAttendance } from '@/lib/zoom-attendance'
import { classroomNoteForLesson } from '@/lib/core/classroom-lesson-attendance'
import { findLastHomework } from '@/lib/last-homework'
import { LESSON_NOTE_PHRASES } from '@/lib/lesson-note-phrases'
import { checkFreeTrial } from '@/lib/free-trial'
import { randomBytes } from 'crypto'
import { recordLessonEvent } from '@/lib/lesson-events'

export const dynamic = 'force-dynamic'

/**
 * The "Log it" / "Didn't happen" buttons in the unlogged-lessons email (#441).
 *
 * GET only shows a confirm page: mail scanners and link previewers open links
 * by themselves, so nothing may happen on a GET. The page's button POSTs the
 * same token, and only the POST acts:
 *   - log:    logLessonCore, the same path the admin dashboard uses, so the
 *             credit, snapshots, ledger row, next-week booking and lesson-notes
 *             email all behave exactly as a normal log. The confirm page has
 *             optional notes and homework boxes (#753) that go into that log,
 *             so the family's usual lesson email carries the notes; left empty,
 *             the log is as before. The homework box starts with last
 *             lesson's homework (#943, lib/last-homework.ts) and one-tap
 *             phrases sit under the notes box (#944, lib/lesson-note-phrases.ts,
 *             the page's only script). A lesson over a week
 *             old (the monthly credit check lists those) is logged quietly
 *             instead: credit and snapshots, no email, no booking (see
 *             lib/late-lesson-log.ts).
 *   - remove: deletes the lessons row and nothing else. No email or message to
 *             the family (the cancel flow, which emails them, is not used).
 *   - missed: "I missed it" (#752), the admin "I missed this" button
 *             (lib/core/missed-lesson.ts): $15 Account Credit, one apology in
 *             the family's portal chat, lesson removed without the cancellation
 *             email. The page shows the exact message; the POST carries it
 *             back and the core refuses if it would now read differently. That
 *             core is safe to repeat, so a failed press gives the link back.
 *   - noshow: "No-Show" (#797), offered only where Zoom (or, #1066, the
 *             classroom's attendance record) shows nobody but Lionel joined.
 *             Runs markNoShowCore, the admin No-Show button's path: the lesson
 *             is kept as a no-show and 1 credit is taken (no refund). Nothing
 *             is sent to the family. The page re-asks Zoom and the classroom
 *             who joined, as a last look before confirming.
 * Both re-check at POST time that the lesson is still unlogged and still at the
 * date and time the email showed; otherwise they say so and change nothing.
 *
 *   - approve_move / decline_move (#878): a family's request to move a
 *             lesson (lib/core/move-requests.ts). Approve runs the usual
 *             reschedule (Zoom, calendar, the usual "Lesson Rescheduled"
 *             email); Decline sends nothing. Both re-check the request itself
 *             (still pending, lesson still where it was, times still ahead,
 *             and for Approve the picked time still free).
 *
 *   - undo_log (#1063): "Undo log" next to each lesson the portal logged by
 *             itself (morning email). The page asks for a reason (required)
 *             and offers the admin dialog's choice, kept as a free lesson or
 *             back to unlogged, and the family message only if ticked (the
 *             exact text is on the page). Runs undoLessonLogCore, the admin
 *             "Undo log" path (#794). That core claims the lesson in its exact
 *             logged state, so a repeat never gives two credits back.
 */

type LessonRow = {
    id: string
    student_id: string
    date: string
    time: string
    duration: number | null
    status: string
    notes: string | null
    homework: string | null
    video_url: string | null
    zoom_meeting_id: string | null
    /** #989: set while the lesson is on hold. */
    on_hold_reason?: string | null
}

const NO_STORE = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
}

function esc(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/**
 * A page may carry one inline script (the Log it page's phrase chips, #944).
 * It runs under a fresh nonce; every other script stays blocked.
 */
function page(title: string, bodyHtml: string, status = 200, script?: string): Response {
    const nonce = script ? randomBytes(16).toString('base64') : null
    const headers = nonce
        ? { ...NO_STORE, 'Content-Security-Policy': `${NO_STORE['Content-Security-Policy']}; script-src 'nonce-${nonce}'` }
        : NO_STORE
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  body { margin: 0; padding: 24px 16px; background: #f5f5f4; color: #1c1917; font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card { max-width: 440px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 22px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  h1 { font-size: 21px; margin: 0 0 10px; line-height: 1.3; }
  p { margin: 0 0 12px; }
  .muted { color: #57534e; font-size: 15px; }
  .warn { background: #fef3c7; border-radius: 8px; padding: 10px 12px; font-size: 15px; }
  label { display: block; font-weight: 600; font-size: 15px; margin: 14px 0 6px; }
  label span { font-weight: 400; color: #57534e; }
  textarea { display: block; box-sizing: border-box; width: 100%; padding: 10px 12px; font: 16px/1.4 inherit; font-family: inherit; border: 1px solid #d6d3d1; border-radius: 8px; resize: vertical; }
  button { display: block; width: 100%; margin-top: 16px; padding: 14px; font-size: 17px; font-weight: 600; border: 0; border-radius: 8px; color: #fff; cursor: pointer; }
  .log { background: #15803d; }
  .remove { background: #b91c1c; }
  .missed { background: #b45309; }
  .noshow { background: #92400e; }
  .undo { background: #b91c1c; }
  input[type=text] { display: block; box-sizing: border-box; width: 100%; padding: 10px 12px; font: 16px/1.4 inherit; font-family: inherit; border: 1px solid #d6d3d1; border-radius: 8px; }
  label.choice { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; margin: 10px 0 0; }
  label.choice input { margin-top: 4px; flex-shrink: 0; }
  label.choice.off { color: #a8a29e; }
  .quote { white-space: pre-wrap; background: #f5f5f4; border-left: 3px solid #d6d3d1; border-radius: 6px; padding: 10px 12px; margin: 0 0 12px; font-size: 16px; }
  ul.effects { margin: 0 0 12px; padding-left: 20px; }
  ul.effects li { margin: 0 0 4px; }
  a { color: #1d4ed8; }
  .chips { margin: 2px 0 0; }
  button.chip { display: inline-block; width: auto; margin: 8px 8px 0 0; padding: 8px 12px; font-size: 15px; font-weight: 500; color: #1c1917; background: #f5f5f4; border: 1px solid #d6d3d1; border-radius: 999px; }
  button.chip:active { background: #e7e5e4; }
</style></head>
<body><div class="card">${bodyHtml}</div>${nonce ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`
    return new Response(html, { status, headers })
}

/**
 * The chips under the notes box (#944): a tap adds the phrase to the end of
 * the notes on its own line, never replacing them (appendNotePhrase in
 * lib/lesson-note-phrases.ts, written out for the browser).
 */
const PHRASE_SCRIPT = `document.querySelectorAll('button.chip').forEach(function (b) {
  b.addEventListener('click', function () {
    var n = document.getElementById('n');
    if (!n) return;
    var p = b.getAttribute('data-phrase') || '';
    var base = n.value.replace(/[ \\t]+$/, '');
    n.value = !base.trim() ? p : (base.charAt(base.length - 1) === '\\n' ? base + p : base + '\\n' + p);
    n.scrollTop = n.scrollHeight;
  });
});`

function phraseChips(): string {
    const chips = LESSON_NOTE_PHRASES
        .map(p => `<button type="button" class="chip" data-phrase="${esc(p)}">+ ${esc(p)}</button>`)
        .join('')
    return `<div class="chips" role="group" aria-label="Add a phrase to the notes">${chips}</div>`
}

function message(title: string, text: string, status = 200): Response {
    return page(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p><p class="muted"><a href="/admin">Open the admin dashboard</a></p>`, status)
}

function badLink(reason: 'invalid' | 'expired' | 'unconfigured'): Response {
    if (reason === 'expired') {
        return message('This link has expired', 'Buttons in the email work for 7 days. Log or remove the lesson in the admin dashboard instead.', 410)
    }
    if (reason === 'unconfigured') {
        return message('Links are not set up', 'The server is missing its signing secret, so this link cannot be checked.', 503)
    }
    return message('This link is not valid', 'It may have been cut off when copied. Use the buttons in the email, or the admin dashboard.', 400)
}

function weekday(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

/** "Nov 11" */
function shortDate(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function longDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Caps for the Log it page's notes and homework boxes (#753). */
const NOTES_MAX = 5000
const HOMEWORK_MAX = 2000

type Checked =
    | { ok: true; lesson: LessonRow; studentName: string }
    | { ok: false; response: Response; outcome: string; transient?: boolean }

/** Is the lesson still the unlogged lesson the email showed? */
async function checkLesson(client: DbClient, claims: LessonActionClaims): Promise<Checked> {
    const { data: lesson, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, status, notes, homework, video_url, zoom_meeting_id, on_hold_reason')
        .eq('id', claims.l)
        .maybeSingle()
    if (error) {
        return { ok: false, transient: true, outcome: `lookup failed: ${error.message}`, response: message('Something went wrong', 'The lesson could not be looked up just now. Nothing changed. Please try the button again in a minute.', 503) }
    }
    if (!lesson) {
        return { ok: false, outcome: 'nothing: lesson already gone', response: message('This lesson is already gone', 'It is no longer in the portal (removed or cancelled since the email). Nothing changed.') }
    }
    const row = lesson as LessonRow
    // #989: nothing is logged, removed or no-showed while Lionel holds it.
    if (row.on_hold_reason) {
        return { ok: false, outcome: 'nothing: on hold', response: message('This lesson is on hold', `It is on hold (${row.on_hold_reason}), so nothing was changed. Release it in admin first.`) }
    }
    if (row.status === 'completed') {
        return { ok: false, outcome: 'nothing: already logged', response: message('Already logged', 'This lesson was logged already, so its credit was already taken. Nothing changed.') }
    }
    if (row.status === 'cancelled') {
        return { ok: false, outcome: 'nothing: already a no-show', response: message('Already a no-show', 'This lesson was marked a no-show already, so its credit was already taken. Nothing changed.') }
    }
    if (!UNLOGGED_STATUSES.includes(row.status)) {
        return { ok: false, outcome: `nothing: status ${row.status}`, response: message('Already handled', `This lesson is marked "${row.status}" now. Nothing changed.`) }
    }
    if (row.date !== claims.d || String(row.time).slice(0, 5) !== claims.t) {
        const moved = `${longDay(row.date)}, ${formatClock(String(row.time).slice(0, 5))} ${studioTzAbbr(row.date)}`
        return { ok: false, outcome: 'nothing: lesson was moved', response: message('This lesson was moved', `It is now on ${moved}, not the time in the email. Nothing changed. Use the admin dashboard for it.`) }
    }

    const { data: student } = await client.from('profiles').select('name').eq('id', row.student_id).maybeSingle()
    return { ok: true, lesson: row, studentName: (student?.name as string) || 'this student' }
}

/** A last look at who joined on Zoom, for the No-Show page (#797). Never throws. */
async function zoomNoteForPage(lesson: LessonRow, endMs: number): Promise<string | null> {
    const meeting = lesson.zoom_meeting_id ? String(lesson.zoom_meeting_id).replace(/\D/g, '') : ''
    if (!meeting) return null
    try {
        const { getZoomAccessToken } = await import('@/lib/zoom')
        const token = await getZoomAccessToken()
        if (!token) return null
        const start = Date.parse(studioWallClockToISO(lesson.date, String(lesson.time).slice(0, 5)))
        const note = attendanceNote(await zoomAttendance(meeting, token, start, endMs))
        return note.replace(/^No-show\? /, '')
    } catch {
        return null
    }
}

async function usedOutcome(client: DbClient, tokenId: string): Promise<{ used: boolean; outcome: string | null }> {
    const { data } = await client
        .from('lesson_action_link_uses')
        .select('outcome')
        .eq('token_id', tokenId)
        .maybeSingle()
    return { used: !!data, outcome: (data?.outcome as string) ?? null }
}

function alreadyUsed(outcome: string | null): Response {
    const did = outcome?.startsWith('logged') ? ' It logged the lesson.'
        : outcome?.startsWith('removed') ? ' It removed the lesson.'
        : outcome?.startsWith('missed') ? ' It sent the apology, added the credit and removed the lesson.'
        : outcome?.startsWith('no-show') ? ' It marked the lesson a no-show and took 1 credit.'
        : outcome?.startsWith('moved') ? " It approved the family's request and moved the lesson."
        : outcome?.startsWith('declined') ? " It declined the family's request (nothing was sent)."
        : outcome?.startsWith('undone') ? ' It undid the log.'
        : ''
    return message('This link was already used', `Each button works once.${did} Nothing changed this time.`)
}

// ---------------------------------------------------------------------------
// Approve / Decline a family's request to move a lesson (#878). The request,
// not the lesson's logged state, decides what is possible here, so these skip
// checkLesson: lib/core/move-requests.ts re-checks that the lesson is still
// where it was, both times are still ahead, and (Approve) the picked time is
// still free.
// ---------------------------------------------------------------------------

async function moveGet(client: DbClient, claims: LessonActionClaims, token: string): Promise<Response> {
    const loaded = await loadPendingMoveRequest(client, claims.r!)
    if (!loaded.ok) return message(loaded.closed ? 'Nothing to do' : 'Something went wrong', loaded.error, loaded.closed ? 200 : 503)
    const { request, pending } = loaded
    if (request.lesson_id !== claims.l) return badLink('invalid')

    const form = (label: string, cls: string) =>
        `<form method="post" action="/api/lesson-action"><input type="hidden" name="t" value="${esc(token)}"><button class="${cls}" type="submit">${esc(label)}</button></form>`
    const when = `${esc(pending.fromLabel)} &rarr; ${esc(pending.toLabel)}, ${pending.duration} min`
    const note = pending.note ? `<p class="muted">Their note: &ldquo;${esc(pending.note)}&rdquo;</p>` : ''

    if (claims.a === 'decline_move') {
        return page('Decline this request?', `
<h1>Decline ${esc(pending.studentName)}'s request?</h1>
<p class="muted">They asked to move ${esc(pending.fromLabel)} to ${esc(pending.toLabel)}.</p>
${note}
<ul class="effects">
<li>The lesson stays at ${esc(pending.fromLabel)}</li>
<li>Sends nothing: no email, portal message or text. The family sees in the portal that the lesson stays at its time.</li>
</ul>
${form('Decline', 'remove')}`)
    }

    const free = await moveSlotStillFree(client, request)
    if (free === false) {
        return message('That time is no longer free', `${pending.toLabel} has another lesson or event now (or is outside your hours), so this request can't be approved. Nothing changed. Decline it here or in the admin dashboard.`)
    }
    return page('Approve this move?', `
<h1>Move ${esc(pending.studentName)}'s lesson?</h1>
<p class="muted">${when}</p>
${note}
<ul class="effects">
<li>Moves the lesson to ${esc(pending.toLabel)}; the Zoom meeting and the calendar event follow</li>
<li>Sends 1 family the usual "Lesson Rescheduled" email, nothing else</li>
</ul>
${free === null ? '<p class="warn">Your schedule could not be checked just now; the button checks again before moving.</p>' : ''}
${form('Approve move', 'log')}`)
}

async function movePost(
    client: DbClient,
    claims: LessonActionClaims,
    record: (outcome: string, studentId?: string) => PromiseLike<unknown>,
    giveBack: () => PromiseLike<unknown>,
): Promise<Response> {
    const { data: req } = await client.from('lesson_move_requests').select('student_id, lesson_id').eq('id', claims.r!).maybeSingle()
    if (req && req.lesson_id !== claims.l) {
        await giveBack()
        return badLink('invalid')
    }
    const studentId = (req?.student_id as string) || undefined

    if (claims.a === 'decline_move') {
        const result = await declineMoveRequestCore({ client, requestId: claims.r!, via: 'email' })
        if ('error' in result) {
            if (result.closed) {
                await record(`nothing: ${result.error}`, studentId)
                return message('Nothing changed', result.error)
            }
            await giveBack()
            return message('Not finished', result.error, 500)
        }
        await record('declined', studentId)
        return message('Declined', result.summary)
    }

    const { data: admin } = await client.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
    if (!admin?.id) {
        await giveBack()
        return message('Something went wrong', 'The studio account could not be found, so nothing was moved. Nothing changed.', 503)
    }
    const result = await approveMoveRequestCore({ client, adminId: admin.id as string, requestId: claims.r!, via: 'email' })
    if ('error' in result) {
        if (result.closed) {
            await record(`nothing: ${result.error}`, studentId)
            return message('Not moved', result.error)
        }
        // Nothing moved and the request is still open, so the link may try again.
        await giveBack()
        console.error(`[lesson-action] approve move failed for ${claims.r}: ${result.error}`)
        return message('Not moved', result.error, 500)
    }
    await record(`moved: ${result.summary}`, studentId)
    console.log(`[lesson-action] approved move request ${claims.r} from email`)
    return message('Moved', result.summary)
}

// ---------------------------------------------------------------------------
// "Undo log" (#1063). A logged lesson, so these skip checkLesson (which only
// accepts unlogged ones); undoLessonLogCore checks the lesson itself.
// ---------------------------------------------------------------------------

const UNDO_REASON_MAX = 200

const UNDO_SOURCE: Record<string, string> = {
    zoom_webhook: 'logged automatically by Zoom',
    system: 'logged automatically (classroom video)',
    classroom_attendance: 'logged automatically (classroom attendance)',
    agent_log: 'logged by the assistant',
    admin_ui: 'logged from admin',
}

async function undoLogGet(claims: LessonActionClaims, token: string): Promise<Response> {
    const preview = await getUndoLogPreviewCore(claims.l)
    if ('error' in preview) return message('Nothing to undo', preview.error)
    const source = preview.completedSource ? UNDO_SOURCE[preview.completedSource] : null
    const after = preview.currentCredits + preview.creditBack
    const credit = preview.creditBack > 0
        ? `Gives back ${preview.creditBack} credit (${preview.currentCredits} → ${after} lessons left), labelled "log undone" with your reason`
        : 'No credit comes back: this lesson was logged free'
    const free = preview.isFree
        ? `<label class="choice off"><input type="radio" name="mode" value="free" disabled><span><b>It happened, just don't charge it.</b> Already free, so this doesn't apply.</span></label>`
        : `<label class="choice"><input type="radio" name="mode" value="free" checked><span><b>It happened, just don't charge it.</b> Stays logged as a free lesson. Nothing shows as unlogged.</span></label>`
    const unlog = `<label class="choice"><input type="radio" name="mode" value="unlog"${preview.isFree ? ' checked' : ''}><span><b>Undo the log completely.</b> Back to unlogged, as before it was logged. It shows in the unlogged lessons until you log or remove it.</span></label>`
    const family = preview.creditBack > 0
        ? `<label class="choice"><input type="checkbox" name="s" value="yes"><span>Also tell the family (1 family: ${esc(preview.studentName)}'s portal chat, with the usual email notice${preview.alsoTexts ? ', and a text' : ''}). Exactly:</span></label>
<div class="quote" style="margin-top:8px">${esc(preview.familyMessage)}</div>
<input type="hidden" name="m" value="${esc(preview.familyMessage)}">`
        : ''
    return page('Undo this log?', `
<h1>Undo the log of ${esc(preview.studentName)}'s lesson?</h1>
<p class="muted">${esc(preview.lessonLabel)}${source ? `, ${esc(source)}` : ''}${preview.freeReason ? ` (free: ${esc(preview.freeReason)})` : ''}</p>
<form method="post" action="/api/lesson-action"><input type="hidden" name="t" value="${esc(token)}">
<label for="r">Reason <span>(kept in the credit history)</span></label>
<input type="text" id="r" name="r" required maxlength="${UNDO_REASON_MAX}" placeholder="e.g. free trial, Zoom charged it" autocomplete="off">
${free}
${unlog}
<ul class="effects" style="margin-top:14px">
<li>${esc(credit)}</li>
<li>Notes, homework and recording stay. The next lesson already booked is not touched.</li>
<li>${preview.creditBack > 0 ? 'Sends nothing to the family unless you tick the box below' : 'Sends nothing to the family'}</li>
</ul>
${family}
<button class="undo" type="submit">Undo log</button></form>`)
}

async function undoLogPost(
    client: DbClient,
    claims: LessonActionClaims,
    typed: { reason: string; mode: string; send: boolean; shownMessage: string | null },
    record: (outcome: string, studentId?: string) => PromiseLike<unknown>,
    giveBack: () => PromiseLike<unknown>,
): Promise<Response> {
    if (!typed.reason) {
        await giveBack()
        return message('Type a reason', 'Nothing changed. Go back, type a reason and press Undo log again.', 400)
    }
    if (typed.mode !== 'free' && typed.mode !== 'unlog') {
        await giveBack()
        return message('Pick what happens to the lesson', 'Nothing changed. Go back and pick one of the two choices.', 400)
    }
    if (typed.send && !typed.shownMessage) {
        await giveBack()
        return message('Nothing changed', 'The message to send was missing. Open the button in the email again.', 400)
    }
    const { data: admin } = await client.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
    if (!admin?.id) {
        await giveBack()
        return message('Something went wrong', 'The studio account could not be found. Nothing changed.', 503)
    }
    const { data: lesson } = await client.from('lessons').select('student_id').eq('id', claims.l).maybeSingle()
    const studentId = (lesson?.student_id as string) || undefined

    const result = await undoLessonLogCore({
        adminId: admin.id as string,
        lessonId: claims.l,
        reason: typed.reason,
        mode: typed.mode as UndoLogMode,
        sendFamilyMessage: typed.send,
        expectedMessage: typed.send ? typed.shownMessage ?? undefined : undefined,
    })
    if ('error' in result) {
        // Only the family message can fail after the credit came back; any
        // other refusal changed nothing, so the link may be used again.
        if (/did not send/.test(result.error)) {
            await record(`undone: ${result.error}`, studentId)
            return message('Undone, but the message did not send', result.error, 500)
        }
        await giveBack()
        return message('Nothing changed', result.error)
    }
    await record(`undone: ${result.summary}`, studentId)
    console.log(`[lesson-action] undid the log of ${claims.l} from email: ${result.summary}`)
    return message('Log undone', `${result.summary.charAt(0).toUpperCase()}${result.summary.slice(1)}`)
}

export async function GET(request: Request) {
    const token = new URL(request.url).searchParams.get('t')
    const verified = verifyLessonAction(token)
    if (!verified.ok) return badLink(verified.reason)
    const { claims } = verified

    const client = createAdminClient()
    const used = await usedOutcome(client, claims.j)
    if (used.used) return alreadyUsed(used.outcome)

    if (MOVE_ACTIONS.includes(claims.a)) return moveGet(client, claims, token!)
    if (claims.a === 'undo_log') return undoLogGet(claims, token!)

    const checked = await checkLesson(client, claims)
    if (!checked.ok) return checked.response
    const { lesson, studentName } = checked

    const clock = formatClock(String(lesson.time).slice(0, 5))
    const when = `${longDay(lesson.date)}, ${clock} ${studioTzAbbr(lesson.date)}, ${lesson.duration || 60} min`
    const form = (label: string, cls: string, extra = '') =>
        `<form method="post" action="/api/lesson-action"><input type="hidden" name="t" value="${esc(token!)}">${extra}<button class="${cls}" type="submit">${esc(label)}</button></form>`

    if (claims.a === 'missed') {
        if (lessonEndMs({ date: lesson.date, time: String(lesson.time).slice(0, 5), duration: lesson.duration || 60 }) > Date.now()) {
            return message('Not over yet', "This lesson hasn't finished yet, so it can't be marked missed. Nothing changed.")
        }
        const preview = await getMissedLessonPreviewCore(lesson.id)
        if ('error' in preview) return message('Nothing changed', preview.error)
        const dollars = `$${MISSED_LESSON_CREDIT_CENTS / 100}`
        const sends = `Sends 1 message to this family (portal chat, with the usual email notice${preview.alsoTexts ? ', and a text' : ''})`
        const credit = preview.alreadyCredited ? `${dollars} Account Credit was already added by an earlier press (not added again)` : `+${dollars} Account Credit`
        return page('You missed this lesson?', `
<h1>You missed ${esc(weekday(lesson.date))}'s ${esc(clock)} lesson for ${esc(studentName)}?</h1>
<p class="muted">${esc(when)}</p>
<p>The message, exactly:</p>
<div class="quote">${esc(preview.message)}</div>
<ul class="effects">
<li>${esc(sends)}</li>
<li>${esc(credit)}</li>
<li>Removes the lesson (no cancellation email)</li>
</ul>
${form('Send apology and remove lesson', 'missed', `<input type="hidden" name="m" value="${esc(preview.message)}">`)}`)
    }

    if (claims.a === 'noshow') {
        const end = lessonEndMs({ date: lesson.date, time: String(lesson.time).slice(0, 5), duration: lesson.duration || 60 })
        if (end > Date.now()) {
            return message('Not over yet', "This lesson hasn't finished yet, so it can't be marked a no-show. Nothing changed.")
        }
        const { data: student } = await client.from('profiles').select('credits').eq('id', lesson.student_id).maybeSingle()
        const credits = typeof student?.credits === 'number' ? student.credits : null
        const zoom = await zoomNoteForPage(lesson, end)
        const classroom = await classroomNoteForLesson(client, { id: lesson.id, studentId: lesson.student_id, date: lesson.date, time: String(lesson.time).slice(0, 5), duration: lesson.duration || 60 })
        const recording = lesson.video_url
            ? `<p class="warn">A recording is attached to this lesson, so it may have happened. Check it before marking a no-show.</p>`
            : ''
        return page('Mark this lesson a no-show?', `
<h1>Mark ${esc(weekday(lesson.date))}'s ${esc(clock)} lesson for ${esc(studentName)} a no-show?</h1>
<p class="muted">${esc(when)}</p>
${zoom ? `<p>${esc(zoom)}</p>` : ''}
${classroom ? `<p>${esc(classroom)}</p>` : ''}
${recording}
<ul class="effects">
<li>${esc(credits !== null ? `Takes 1 credit, no refund (${credits} → ${credits - 1})` : 'Takes 1 credit, no refund')}</li>
<li>Keeps the lesson, marked as a no-show (the family's History tab counts it as a lesson used)</li>
<li>Sends nothing: no email, portal message or text to the family</li>
<li>Leaves the Zoom meeting, the calendar and the next lesson as they are</li>
</ul>
${form('Mark no-show', 'noshow')}`)
    }

    if (claims.a === 'log') {
        const quiet = isTooOldForUsualLog(lesson.date)
        // #946: the new student's free trial is logged free on its own.
        const trial = (await checkFreeTrial(client, { studentId: lesson.student_id, lessonId: lesson.id, date: lesson.date, time: String(lesson.time) })).trial
        const cost = trial ? "This is the student's free trial, so it is logged free (no credit taken)." : 'This takes 1 credit.'
        const effect = quiet
            ? `${cost} The lesson is over ${QUIET_LOG_AFTER_DAYS} days old, so it is logged quietly: no email to the family and no next lesson booked.`
            : trial
            ? `${cost} It sends 1 family the usual emails (the lesson email, plus the next week's booking if one is made), the same as logging it in admin.`
            : "This takes 1 credit and sends 1 family the usual emails (the lesson email, plus the next week's booking if one is made), the same as logging it in admin."
        const notesHint = quiet ? 'optional, saved on the lesson' : "optional, goes in the family's lesson email"
        // #943: start from what the lesson has, else last lesson's homework.
        let homework = (lesson.homework || '').trim()
        let homeworkHint = 'optional'
        if (!homework) {
            try {
                const last = await findLastHomework(client, lesson.student_id, { date: lesson.date, time: String(lesson.time).slice(0, 5) })
                if (last) {
                    homework = last.homework.slice(0, HOMEWORK_MAX)
                    homeworkHint = `optional; last lesson's homework (${shortDate(last.date)}), edit what changed or clear it`
                }
            } catch (e) {
                // An empty box is the old behaviour; never block the page on it.
                console.error('[lesson-action] last homework lookup failed:', e instanceof Error ? e.message : e)
            }
        }
        const boxes = `
<label for="n">Lesson notes <span>(${esc(notesHint)})</span></label>
<textarea id="n" name="n" rows="6" maxlength="${NOTES_MAX}">${esc(lesson.notes || '')}</textarea>
${phraseChips()}
<label for="h">Homework <span>(${esc(homeworkHint)})</span></label>
<textarea id="h" name="h" rows="3" maxlength="${HOMEWORK_MAX}">${esc(homework)}</textarea>`
        return page('Log this lesson?', `
<h1>Log ${esc(weekday(lesson.date))}'s ${esc(clock)} lesson for ${esc(studentName)}?</h1>
<p class="muted">${esc(when)}</p>
<p>${esc(effect)}</p>
${form('Log it', 'log', boxes)}`, 200, PHRASE_SCRIPT)
    }

    const recording = lesson.video_url
        ? `<p class="warn">A recording is attached to this lesson, so it may have happened. Removing it also drops that link from the lesson.</p>`
        : ''
    return page('Remove this lesson?', `
<h1>Remove ${esc(weekday(lesson.date))}'s ${esc(clock)} lesson for ${esc(studentName)}?</h1>
<p class="muted">${esc(when)}</p>
<p>It is deleted with no credit taken. Nobody is told.</p>
${recording}
${form('Remove it', 'remove')}`)
}

export async function POST(request: Request) {
    let token: string | null = null
    let shownMessage: string | null = null
    let typedNotes = ''
    let typedHomework = ''
    let typedReason = ''
    let typedMode = ''
    let typedSend = false
    try {
        const form = await request.formData()
        const t = form.get('t')
        token = typeof t === 'string' ? t : null
        const m = form.get('m')
        shownMessage = typeof m === 'string' ? m : null
        const n = form.get('n')
        const h = form.get('h')
        typedNotes = typeof n === 'string' ? n.trim().slice(0, NOTES_MAX) : ''
        typedHomework = typeof h === 'string' ? h.trim().slice(0, HOMEWORK_MAX) : ''
        // "Undo log" (#1063): reason, choice, and the family-message box.
        const r = form.get('r')
        const mode = form.get('mode')
        typedReason = typeof r === 'string' ? r.trim().replace(/\s+/g, ' ').slice(0, UNDO_REASON_MAX) : ''
        typedMode = typeof mode === 'string' ? mode : ''
        typedSend = form.get('s') === 'yes'
    } catch {
        token = null
    }
    const verified = verifyLessonAction(token)
    if (!verified.ok) return badLink(verified.reason)
    const { claims } = verified

    const client = createAdminClient()

    // Claim the token first: the primary key makes a second use (or a double
    // tap racing this one) fail here, before anything changes.
    const { error: claimError } = await client.from('lesson_action_link_uses').insert({
        token_id: claims.j,
        lesson_id: claims.l,
        action: claims.a,
        lesson_date: claims.d,
        lesson_time: claims.t,
        outcome: 'started',
    })
    if (claimError) {
        if (claimError.code === '23505') {
            const used = await usedOutcome(client, claims.j)
            return alreadyUsed(used.outcome)
        }
        console.error('[lesson-action] could not record link use:', claimError.message)
        return message('Something went wrong', 'Nothing changed. Please try the button again in a minute.', 503)
    }

    const record = (outcome: string, studentId?: string) =>
        client.from('lesson_action_link_uses')
            .update({ outcome, ...(studentId ? { student_id: studentId } : {}) })
            .eq('token_id', claims.j)
            .then(({ error }) => { if (error) console.error('[lesson-action] outcome not saved:', error.message) })

    if (MOVE_ACTIONS.includes(claims.a)) {
        return movePost(client, claims, record, () => client.from('lesson_action_link_uses').delete().eq('token_id', claims.j))
    }
    if (claims.a === 'undo_log') {
        return undoLogPost(
            client,
            claims,
            { reason: typedReason, mode: typedMode, send: typedSend, shownMessage },
            record,
            () => client.from('lesson_action_link_uses').delete().eq('token_id', claims.j),
        )
    }

    const checked = await checkLesson(client, claims)
    if (!checked.ok) {
        if (checked.transient) {
            // Nothing was done, so give the link back for another try.
            await client.from('lesson_action_link_uses').delete().eq('token_id', claims.j)
        } else {
            await record(checked.outcome)
        }
        return checked.response
    }
    const { lesson, studentName } = checked
    const label = `${weekday(lesson.date)}'s ${formatClock(String(lesson.time).slice(0, 5))} lesson for ${studentName}`

    if (claims.a === 'missed') {
        const giveBack = () => client.from('lesson_action_link_uses').delete().eq('token_id', claims.j)
        if (lessonEndMs({ date: lesson.date, time: String(lesson.time).slice(0, 5), duration: lesson.duration || 60 }) > Date.now()) {
            await giveBack()
            return message('Not over yet', "This lesson hasn't finished yet, so it can't be marked missed. Nothing changed.")
        }
        if (!shownMessage) {
            await giveBack()
            return message('Nothing changed', 'The message to send was missing. Open the button in the email again.', 400)
        }
        const { data: admin } = await client.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
        if (!admin?.id) {
            await giveBack()
            return message('Something went wrong', 'The studio account could not be found, so nothing was sent. Nothing changed.', 503)
        }
        const result = await missedLessonCore({ adminId: admin.id as string, lessonId: lesson.id, expectedMessage: shownMessage })
        if ('error' in result) {
            // The core never credits or sends twice, so the same link may try again.
            await giveBack()
            console.error(`[lesson-action] missed failed for ${lesson.id}: ${result.error}`)
            return message('Not finished', result.error, 500)
        }
        await record(`missed: ${result.summary}`, lesson.student_id)
        console.log(`[lesson-action] missed ${lesson.id} from email: ${result.summary}`)
        return message('Done', `${label}: ${result.summary}`)
    }

    if (claims.a === 'noshow') {
        const giveBack = () => client.from('lesson_action_link_uses').delete().eq('token_id', claims.j)
        if (lessonEndMs({ date: lesson.date, time: String(lesson.time).slice(0, 5), duration: lesson.duration || 60 }) > Date.now()) {
            await giveBack()
            return message('Not over yet', "This lesson hasn't finished yet, so it can't be marked a no-show. Nothing changed.")
        }
        const result = await markNoShowCore(lesson.id, { via: 'email button' })
        if (!result.ok && result.changed) {
            await record('nothing: changed while confirming', lesson.student_id)
            return message('Already handled', 'This lesson changed while you were confirming (logged or removed elsewhere). Nothing changed.')
        }
        if (!result.ok) {
            // The core undoes its own claim on failure, so the link may try again.
            await giveBack()
            console.error(`[lesson-action] no-show failed for ${lesson.id}: ${result.error}`)
            return message('Not finished', `The portal said: ${result.error}. Nothing changed. Please try again, or use the admin dashboard.`, 500)
        }
        await record(`no-show: credits ${result.previousCredits} -> ${result.newCredits}`, lesson.student_id)
        console.log(`[lesson-action] no-show ${lesson.id} from email (credits ${result.previousCredits} -> ${result.newCredits})`)
        return message('Marked no-show', `${label} is marked a no-show and 1 credit was taken (${result.newCredits} left). Nobody was told.`)
    }

    if (claims.a === 'log' && isTooOldForUsualLog(lesson.date)) {
        const quiet = await logOldLessonQuietly(client, lesson.id, { notes: typedNotes || undefined, homework: typedHomework || undefined })
        if (!quiet.ok && quiet.changed) {
            await record('nothing: changed while confirming', lesson.student_id)
            return message('Already handled', 'This lesson changed while you were confirming (logged or removed elsewhere). Nothing changed.')
        }
        if (!quiet.ok) {
            await record(`failed: ${quiet.error}`, lesson.student_id)
            console.error(`[lesson-action] quiet log failed for ${lesson.id}: ${quiet.error}`)
            return message('Logging did not finish', `The portal said: ${quiet.error}. Please check this lesson in the admin dashboard before trying again.`, 500)
        }
        await record(`logged quietly: credits ${quiet.previousCredits} -> ${quiet.newCredits}`, lesson.student_id)
        console.log(`[lesson-action] logged old lesson ${lesson.id} quietly from email (credits ${quiet.previousCredits} -> ${quiet.newCredits})`)
        const took = quiet.trial ? 'logged free as the free trial, no credit taken' : 'logged and 1 credit was taken'
        return message('Logged', `${label} is ${took} (${quiet.newCredits} left). Nobody was emailed and no lesson was booked.`)
    }

    if (claims.a === 'log') {
        const { data: admin } = await client.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
        const result = await logLessonCore({
            client,
            adminId: (admin?.id as string) || lesson.student_id,
            lessonId: lesson.id,
            // What was typed on the confirm page (#753), else whatever the lesson
            // already had. Empty homework leaves the field untouched.
            notes: typedNotes || lesson.notes || '',
            homework: typedHomework || undefined,
            completedSource: 'admin_ui',
            // Serverless: finish the usual emails before the response ends the function.
            awaitNotifications: true,
            event: { via: 'email button' },
        })
        if ('error' in result) {
            await record(`failed: ${result.error}`, lesson.student_id)
            console.error(`[lesson-action] log failed for ${lesson.id}: ${result.error}`)
            return message('Logging did not finish', `The portal said: ${result.error}. Please check this lesson in the admin dashboard before trying again.`, 500)
        }
        const left = result.new_credits
        await record(`logged: credits ${result.previous_credits} -> ${left}`, lesson.student_id)
        console.log(`[lesson-action] logged ${lesson.id} from email (credits ${result.previous_credits} -> ${left})`)
        const took = result.trial ? 'logged free as the free trial, no credit taken' : result.free ? 'logged free, no credit taken' : 'logged and 1 credit was taken'
        return message('Logged', `${label} is ${took}${typeof left === 'number' ? ` (${left} left)` : ''}.`)
    }

    // remove: the row only, and only while it is still unlogged.
    const { data: deleted, error: deleteError } = await client
        .from('lessons')
        .delete()
        .eq('id', lesson.id)
        .in('status', UNLOGGED_STATUSES)
        .select('id')
    if (deleteError) {
        await client.from('lesson_action_link_uses').delete().eq('token_id', claims.j)
        console.error(`[lesson-action] remove failed for ${lesson.id}: ${deleteError.message}`)
        return message('Something went wrong', 'The lesson was not removed. Nothing changed. Please try the button again in a minute.', 503)
    }
    if (!deleted || deleted.length === 0) {
        await record('nothing: changed while confirming', lesson.student_id)
        return message('Already handled', 'This lesson changed while you were confirming (logged or removed elsewhere). Nothing changed.')
    }
    await record('removed', lesson.student_id)
    await recordLessonEvent({ kind: 'removed', actor: 'admin', studentId: lesson.student_id, lessonId: lesson.id, date: lesson.date, time: String(lesson.time), detail: { via: 'email button' } })
    console.log(`[lesson-action] removed ${lesson.id} from email (no one notified)`)
    return message('Removed', `${label} is removed. No credit was taken and nobody was told.`)
}
