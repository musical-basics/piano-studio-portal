import type { EveningLesson } from '@/lib/evening-preview'

/**
 * The morning email's first part (Lionel's #942): today's lessons in order,
 * each with its Eastern time (and the family's own when their clock reads
 * differently), the student's name, the length, Zoom or classroom, and the
 * evening email's flags (asked to skip or move, no lessons left). The list is
 * lib/evening-preview.ts findDayLessons, so both emails agree. Only Lionel gets
 * this email, so names are fine here.
 */

export type TodaySchedule = {
    /** The studio day, YYYY-MM-DD (Eastern). */
    date: string
    /** Null when the lessons could not be loaded. */
    lessons: EveningLesson[] | null
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const FLAG = 'display:inline-block;margin:2px 6px 0 0;padding:1px 7px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:13px;font-weight:600'

/**
 * "4:30pm EST (1:30pm their time): Piano Student, 60 min, Zoom". Zoom or
 * classroom follows the student's setting (#980) and links to the room.
 */
export function describeTodayLesson(l: EveningLesson): string {
    const place = !l.place ? ''
        : l.joinUrl ? `<a href="${escapeHtml(l.joinUrl)}" style="color:#1d4ed8">${escapeHtml(l.place)}</a>`
        : escapeHtml(l.place)
    const details = [escapeHtml(`${l.minutes} min`), place].filter(Boolean).join(', ')
    const theirs = l.familyTime ? ` <span style="color:#57534e">(${escapeHtml(l.familyTime)})</span>` : ''
    return `<b>${escapeHtml(l.studioTime)}</b>${theirs}: ${escapeHtml(l.name)}, ${details}`
}

/** "Today: 3 lessons, first at 10:00am EST" for a subject; '' when there are none. */
export function todaySubject(today: TodaySchedule | undefined, { lead }: { lead: boolean }): string {
    const n = today?.lessons?.length ?? 0
    if (!today?.lessons || n === 0) return ''
    const lessons = `${n} lesson${n === 1 ? '' : 's'}`
    return lead ? `Today: ${lessons}, first at ${today.lessons[0].studioTime}` : `today: ${lessons}`
}

export function todayScheduleSection(today: TodaySchedule): { lines: string[]; html: string } {
    const label = new Date(`${today.date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
    })
    if (!today.lessons) {
        return {
            lines: [],
            html: `<h3 style="font-size:16px;margin:4px 0 8px">Today, ${escapeHtml(label)}</h3>
<p style="font-size:15px;margin:0 0 16px;color:#57534e">Today's lessons could not be loaded just now. The admin dashboard has them.</p>`,
        }
    }
    const n = today.lessons.length
    if (n === 0) {
        return {
            lines: [],
            html: `<h3 style="font-size:16px;margin:4px 0 8px">Today, ${escapeHtml(label)}</h3>
<p style="font-size:15px;margin:0 0 16px">No lessons today.</p>`,
        }
    }
    const lines = today.lessons.map(describeTodayLesson)
    const rows = today.lessons.map((l, i) => {
        const flags = l.flags.map(f => `<span style="${FLAG}">${escapeHtml(f)}</span>`).join('')
        return `<div style="font-size:15px;margin:0 0 8px;line-height:1.45">${lines[i]}${flags ? `<br>${flags}` : ''}</div>`
    })
    return {
        lines,
        html: `<h3 style="font-size:16px;margin:4px 0 8px">Today, ${escapeHtml(label)} (${n} lesson${n === 1 ? '' : 's'})</h3>
${rows.join('\n')}
<div style="margin:0 0 16px"></div>`,
    }
}
