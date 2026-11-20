import { LINK_TTL_DAYS, appBaseUrl, lessonActionUrl, signLessonAction } from '@/lib/lesson-action-links'
import type { PendingMoveRequest } from '@/lib/core/move-requests'

/**
 * The morning email's "asking to move a lesson" part (#878): each family's
 * request with one-time Approve and Decline buttons (app/api/lesson-action),
 * signed like the other lesson buttons and carrying the request id.
 */

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const BUTTON = 'display:inline-block;padding:11px 18px;margin:0 8px 6px 0;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;line-height:1.2'
const APPROVE_STYLE = `${BUTTON};background:#15803d;color:#ffffff;border:1px solid #15803d`
const DECLINE_STYLE = `${BUTTON};background:#ffffff;color:#44403c;border:1px solid #a8a29e`

/**
 * "Piano Student: Thu, Nov 20 at 4:30pm EST -> Fri, Nov 21 at 5:00pm EST (60 min)",
 * with the family's note under it when there is one (#1346).
 */
export function describeMoveRequest(r: PendingMoveRequest): string {
    const line = `${escapeHtml(r.studentName)}: ${escapeHtml(r.fromLabel)} &rarr; <b>${escapeHtml(r.toLabel)}</b> (${r.duration} min)`
    return r.note ? `${line}<br><span style="color:#57534e">Their note: &ldquo;${escapeHtml(r.note)}&rdquo;</span>` : line
}

export function moveRequestsNote(n: number): string {
    return `<b>Approve</b> moves the lesson the usual way (Zoom and the calendar follow) and sends that 1 family the usual ` +
        `"Lesson Rescheduled" email. <b>Decline</b> changes nothing and sends nothing; the family sees in the portal that ` +
        `the lesson stays at its time. ${n === 1 ? 'The request closes' : 'A request closes'} by itself if the time gets taken or passes. ` +
        `Each button asks you to confirm, works once, and expires in ${LINK_TTL_DAYS} days.`
}

/** The section's heading, blocks and plain lines. Falls back to a list when links can't be signed. */
export function moveRequestsSection(
    requests: PendingMoveRequest[],
    { now = new Date(), baseUrl = appBaseUrl(), heading = true }: { now?: Date; baseUrl?: string; heading?: boolean } = {},
): { lines: string[]; html: string } {
    if (requests.length === 0) return { lines: [], html: '' }
    const n = requests.length
    const lines = requests.map(describeMoveRequest)
    let buttons = true
    const blocks = requests.map((r, i) => {
        const claims = { lessonId: r.lessonId, date: r.fromDate, time: r.fromTime, requestId: r.id }
        const approve = signLessonAction({ ...claims, action: 'approve_move' }, now)
        const decline = signLessonAction({ ...claims, action: 'decline_move' }, now)
        if (!approve || !decline) {
            buttons = false
            return `<li>${lines[i]}</li>`
        }
        return `<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #fcd34d;border-radius:8px">
<div style="font-size:15px;margin:0 0 10px">${lines[i]}</div>
<a href="${escapeHtml(lessonActionUrl(approve, baseUrl))}" style="${APPROVE_STYLE}">Approve</a><a href="${escapeHtml(lessonActionUrl(decline, baseUrl))}" style="${DECLINE_STYLE}">Decline</a>
</div>`
    })
    // Left out when the subject already says it (an email with only requests).
    const title = heading ? `<h3 style="font-size:16px;margin:4px 0 8px">${n === 1 ? '1 family asks' : `${n} families ask`} to move a lesson</h3>\n` : ''
    const body = buttons
        ? blocks.join('\n')
        : `<ul>${blocks.join('')}</ul><p style="font-size:14px;color:#57534e">Approve or decline in the <a href="${baseUrl}/admin">admin dashboard</a> (Today tab).</p>`
    const note = buttons ? `<p style="font-size:14px;color:#57534e;margin:0 0 16px">${moveRequestsNote(n)}</p>` : ''
    return { lines, html: `${title}${body}\n${note}` }
}
