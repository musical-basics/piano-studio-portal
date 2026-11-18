import { createAdminClient, type DbClient } from '@/lib/supabase/admin'
import { verifyLessonAction, type LessonActionClaims } from '@/lib/lesson-action-links'
import { logLessonCore } from '@/lib/core/lessons'
import { UNLOGGED_STATUSES, formatClock } from '@/lib/unlogged-lessons'
import { studioTzAbbr } from '@/lib/studio-timezone'
import { QUIET_LOG_AFTER_DAYS, isTooOldForUsualLog, logOldLessonQuietly } from '@/lib/late-lesson-log'

export const dynamic = 'force-dynamic'

/**
 * The "Log it" / "Didn't happen" buttons in the unlogged-lessons email (#441).
 *
 * GET only shows a confirm page: mail scanners and link previewers open links
 * by themselves, so nothing may happen on a GET. The page's button POSTs the
 * same token, and only the POST acts:
 *   - log:    logLessonCore, the same path the admin dashboard uses, so the
 *             credit, snapshots, ledger row, next-week booking and lesson-notes
 *             email all behave exactly as a normal log. A lesson over a week
 *             old (the monthly credit check lists those) is logged quietly
 *             instead: credit and snapshots, no email, no booking (see
 *             lib/late-lesson-log.ts).
 *   - remove: deletes the lessons row and nothing else. No email or message to
 *             the family (the cancel flow, which emails them, is not used).
 * Both re-check at POST time that the lesson is still unlogged and still at the
 * date and time the email showed; otherwise they say so and change nothing.
 */

type LessonRow = {
    id: string
    student_id: string
    date: string
    time: string
    duration: number | null
    status: string
    notes: string | null
    video_url: string | null
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

function page(title: string, bodyHtml: string, status = 200): Response {
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
  button { display: block; width: 100%; margin-top: 16px; padding: 14px; font-size: 17px; font-weight: 600; border: 0; border-radius: 8px; color: #fff; cursor: pointer; }
  .log { background: #15803d; }
  .remove { background: #b91c1c; }
  a { color: #1d4ed8; }
</style></head>
<body><div class="card">${bodyHtml}</div></body></html>`
    return new Response(html, { status, headers: NO_STORE })
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

function longDay(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

type Checked =
    | { ok: true; lesson: LessonRow; studentName: string }
    | { ok: false; response: Response; outcome: string; transient?: boolean }

/** Is the lesson still the unlogged lesson the email showed? */
async function checkLesson(client: DbClient, claims: LessonActionClaims): Promise<Checked> {
    const { data: lesson, error } = await client
        .from('lessons')
        .select('id, student_id, date, time, duration, status, notes, video_url')
        .eq('id', claims.l)
        .maybeSingle()
    if (error) {
        return { ok: false, transient: true, outcome: `lookup failed: ${error.message}`, response: message('Something went wrong', 'The lesson could not be looked up just now. Nothing changed. Please try the button again in a minute.', 503) }
    }
    if (!lesson) {
        return { ok: false, outcome: 'nothing: lesson already gone', response: message('This lesson is already gone', 'It is no longer in the portal (removed or cancelled since the email). Nothing changed.') }
    }
    const row = lesson as LessonRow
    if (row.status === 'completed') {
        return { ok: false, outcome: 'nothing: already logged', response: message('Already logged', 'This lesson was logged already, so its credit was already taken. Nothing changed.') }
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
        : ''
    return message('This link was already used', `Each button works once.${did} Nothing changed this time.`)
}

export async function GET(request: Request) {
    const token = new URL(request.url).searchParams.get('t')
    const verified = verifyLessonAction(token)
    if (!verified.ok) return badLink(verified.reason)
    const { claims } = verified

    const client = createAdminClient()
    const used = await usedOutcome(client, claims.j)
    if (used.used) return alreadyUsed(used.outcome)

    const checked = await checkLesson(client, claims)
    if (!checked.ok) return checked.response
    const { lesson, studentName } = checked

    const clock = formatClock(String(lesson.time).slice(0, 5))
    const when = `${longDay(lesson.date)}, ${clock} ${studioTzAbbr(lesson.date)}, ${lesson.duration || 60} min`
    const form = (label: string, cls: string) =>
        `<form method="post" action="/api/lesson-action"><input type="hidden" name="t" value="${esc(token!)}"><button class="${cls}" type="submit">${esc(label)}</button></form>`

    if (claims.a === 'log') {
        const effect = isTooOldForUsualLog(lesson.date)
            ? `This takes 1 credit. The lesson is over ${QUIET_LOG_AFTER_DAYS} days old, so it is logged quietly: no email to the family and no next lesson booked.`
            : 'This takes 1 credit, the same as logging it in admin.'
        return page('Log this lesson?', `
<h1>Log ${esc(weekday(lesson.date))}'s ${esc(clock)} lesson for ${esc(studentName)}?</h1>
<p class="muted">${esc(when)}</p>
<p>${esc(effect)}</p>
${form('Log it', 'log')}`)
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
    try {
        const form = await request.formData()
        const t = form.get('t')
        token = typeof t === 'string' ? t : null
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

    if (claims.a === 'log' && isTooOldForUsualLog(lesson.date)) {
        const quiet = await logOldLessonQuietly(client, lesson.id)
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
        return message('Logged', `${label} is logged and 1 credit was taken (${quiet.newCredits} left). Nobody was emailed and no lesson was booked.`)
    }

    if (claims.a === 'log') {
        const { data: admin } = await client.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
        const result = await logLessonCore({
            client,
            adminId: (admin?.id as string) || lesson.student_id,
            lessonId: lesson.id,
            // Keep anything already written on the lesson; the email has no notes box.
            notes: lesson.notes || '',
            completedSource: 'admin_ui',
            // Serverless: finish the usual emails before the response ends the function.
            awaitNotifications: true,
        })
        if ('error' in result) {
            await record(`failed: ${result.error}`, lesson.student_id)
            console.error(`[lesson-action] log failed for ${lesson.id}: ${result.error}`)
            return message('Logging did not finish', `The portal said: ${result.error}. Please check this lesson in the admin dashboard before trying again.`, 500)
        }
        const left = result.new_credits
        await record(`logged: credits ${result.previous_credits} -> ${left}`, lesson.student_id)
        console.log(`[lesson-action] logged ${lesson.id} from email (credits ${result.previous_credits} -> ${left})`)
        return message('Logged', `${label} is logged and 1 credit was taken${typeof left === 'number' ? ` (${left} left)` : ''}.`)
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
    console.log(`[lesson-action] removed ${lesson.id} from email (no one notified)`)
    return message('Removed', `${label} is removed. No credit was taken and nobody was told.`)
}
