/**
 * How much of the Resend plan's sending limit the studio has used (Lionel's
 * #1073), for the daily storage check (lib/storage-usage.ts).
 *
 * Resend has no API that reads the plan or the month's usage, and the
 * portal's own key may only send. What it does have: every send answers with
 * the account's usage in its headers, as Resend itself counts it:
 *
 *   x-resend-monthly-quota  emails used this billing month (every plan)
 *   x-resend-daily-quota    emails used today, UTC (free plan only; paid plans
 *                           have no daily limit, so no header)
 *
 * So once a day the check sends one email to Resend's own test inbox
 * (delivered@resend.dev: nobody receives it) and reads those headers. That
 * count is exact and account-wide: every site sending through the same Resend
 * account, each recipient of each email, and received emails (chat replies)
 * all count, which is how Resend counts against the limit. The month is
 * Resend's billing month, not the calendar month. The probe itself is one
 * email a day (about 30 a month).
 *
 * The limit itself isn't in any answer, so nothing is assumed about the
 * plan: RESEND_MONTHLY_LIMIT and RESEND_DAILY_LIMIT set it, otherwise the free
 * plan's 3,000 a month and 100 a day. The daily count is checked only when
 * Resend sends it (the daily header). In Nov 2026 the account sent no daily
 * header and sent up to 160 emails in a UTC day without a refusal, both signs
 * of a paid plan: setting RESEND_MONTHLY_LIMIT to the plan's figure stops the
 * free plan's 3,000 from alerting early.
 */

export const FREE_MONTHLY_LIMIT = 3_000
export const FREE_DAILY_LIMIT = 100

const PROBE_TO = 'delivered@resend.dev'
const PROBE_FROM = 'Lionel Yu Piano Studio <notifications@updates.musicalbasics.com>'

export type EmailQuota = {
    /** Emails used this billing month, as Resend counts them. */
    month: number
    monthLimit: number
    /** Emails used today (UTC day), when Resend sends it (free plan only); null otherwise. */
    day: number | null
    dayLimit: number
    /** Resend sent no daily count: its sign of a paid plan (no daily limit). */
    noDailyCount: boolean
    /** RESEND_MONTHLY_LIMIT set, or the free plan's 3,000 by default. */
    limitFrom: 'setting' | 'free-default'
}

function setting(name: string): number | null {
    const n = Number((process.env[name] || '').replace(/[,_\s]/g, ''))
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** Usage and limits from a send's answer headers; null when the monthly header is missing. */
export function quotaFromHeaders(get: (name: string) => string | null): EmailQuota | null {
    const month = Number(get('x-resend-monthly-quota'))
    if (get('x-resend-monthly-quota') == null || !Number.isFinite(month)) return null
    const dailyRaw = get('x-resend-daily-quota')
    const day = dailyRaw != null && Number.isFinite(Number(dailyRaw)) ? Number(dailyRaw) : null
    const monthSet = setting('RESEND_MONTHLY_LIMIT')
    return {
        month,
        monthLimit: monthSet ?? FREE_MONTHLY_LIMIT,
        day,
        dayLimit: setting('RESEND_DAILY_LIMIT') ?? FREE_DAILY_LIMIT,
        noDailyCount: day === null,
        limitFrom: monthSet ? 'setting' : 'free-default',
    }
}

/**
 * Sends the one probe email and reads the usage from the answer. Throws when
 * it can't (no key, Resend refused, no usage header), with the reason.
 */
export async function measureEmailQuota(fetcher: typeof fetch = fetch): Promise<EmailQuota> {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    const res = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: PROBE_FROM,
            to: [PROBE_TO],
            subject: 'Sending limit check',
            text: "The portal's daily storage check reads Resend's sending usage from this send. It goes to Resend's test inbox; nobody receives it.",
            tags: [{ name: 'category', value: 'quota_check' }],
        }),
    })
    if (!res.ok) {
        let why = `HTTP ${res.status}`
        try {
            const body = await res.json()
            if (body?.message) why = `${why}: ${body.message}`
        } catch {
            // keep the status
        }
        throw new Error(`Resend refused the usage check (${why})`)
    }
    const quota = quotaFromHeaders(name => res.headers.get(name))
    if (!quota) throw new Error('Resend sent no usage header (x-resend-monthly-quota)')
    return quota
}
