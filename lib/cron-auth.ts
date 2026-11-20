/**
 * Shared cron authorization.
 *
 * These routes are triggered two different ways and each sends the secret
 * differently:
 *
 *   - Vercel Cron (vercel.json) sends `Authorization: Bearer $CRON_SECRET`
 *     with no query string.
 *   - The GitHub Actions workflow (.github/workflows/cron.yml) curls the
 *     public URL with `?key=$CRON_SECRET`.
 *
 * Routes that only checked `?key=` silently 401'd every Vercel tick, which is
 * how lesson reminders ended up depending entirely on GitHub Actions. Accept
 * both forms everywhere so either trigger can carry the load alone.
 */
export function isAuthorizedCron(request: Request): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false
    const { searchParams } = new URL(request.url)
    if (searchParams.get('key') === secret) return true
    return request.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * "Run now" on the admin jobs page (#1076) calls a cron route's handler on the
 * server with the same Bearer secret, plus this header, so the run counts as
 * manual: it is marked "(run by hand)" on the jobs page and never stamps a
 * trigger's own heartbeat (a manual run must not make a silent Vercel or
 * GitHub trigger look alive). Only trusted together with the secret.
 */
export const MANUAL_RUN_HEADER = 'x-studio-manual-run'

export function isManualRun(request: Request): boolean {
    return request.headers.get(MANUAL_RUN_HEADER) === '1' && isAuthorizedCron(request)
}
