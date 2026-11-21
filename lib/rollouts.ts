/**
 * Rollouts for family-facing portal features (protocol 1.20, "start small and
 * feel the way"): a big change to the family portal goes to half the families
 * first, old against new, and the result is written down.
 *
 * Each feature has a stage in portal_rollouts (migration 20261120170000):
 *   off   nobody gets the new version (the test student neither, so the old
 *         one can be checked); an admin preview still shows it
 *   test  only the test student ("Piano Student") gets it
 *   half  half the families, by a stable hash of student id + feature, so a
 *         family always sees the same version; the test student always gets it
 *   all   everyone
 * An admin preview (impersonation) always shows the new version.
 *
 * With about 10 active families each half is about 5 of them. That cannot
 * prove one version "converts" better; what a split does here is keep a
 * broken change from reaching every family at once and show whether families
 * use the new thing at all. The Tests card on /admin/jobs says the same.
 *
 * Stages are read with the service key and cached for 30 seconds per server
 * instance. If the read fails, each feature falls back to its `fallback` stage
 * ('all' for features that were already live, so nothing breaks).
 *
 * The arm a family is in is also worked out in the browser-free admin report,
 * so this file must stay free of server-only imports.
 */

export type RolloutStage = 'off' | 'test' | 'half' | 'all'
export type RolloutArm = 'new' | 'old'

export const ROLLOUT_STAGES: RolloutStage[] = ['off', 'test', 'half', 'all']

export const STAGE_LABEL: Record<RolloutStage, string> = {
    off: 'Off (old version for everyone)',
    test: 'Test student only',
    half: 'Half the families',
    all: 'Everyone',
}

/** The test student ("Piano Student", status 'other'): always in the new version unless the stage is off. */
export const TEST_STUDENT_ID = '3a7b64a1-67bd-4d16-a921-9215046da9c5'

export type RolloutFeature = {
    key: string
    /** Short name on the Tests card. */
    label: string
    /** What the new arm sees. */
    newArm: string
    /** What the old (control) arm sees. */
    oldArm: string
    /** The stage to assume when portal_rollouts cannot be read. */
    fallback: RolloutStage
    /** Usage actions the portal records, with their words on the card. */
    actions: Record<string, string>
    /** Actions that are not use of the feature (seen, or the baseline both arms share). */
    passive?: string[]
}

export const ROLLOUT_FEATURES = {
    my_music: {
        key: 'my_music',
        label: 'My music tab',
        newArm: 'My music: every piece sent, newest first',
        oldArm: 'Downloads: the old Practice Materials list',
        fallback: 'all',
        actions: {
            tab_opened: 'tab opened',
            searched: 'searched',
            opened: 'piece opened',
            downloaded: 'downloaded',
        },
    },
    history_transcripts: {
        key: 'history_transcripts',
        label: 'Transcripts in History',
        newArm: 'Search box and transcript under each lesson video',
        oldArm: 'History without transcripts',
        fallback: 'all',
        actions: {
            history_opened: 'History opened',
            searched: 'searched',
            transcript_opened: 'transcript opened',
            line_played: 'played from a line',
        },
        passive: ['history_opened'],
    },
    calendar_feed: {
        key: 'calendar_feed',
        label: '"Add to my calendar" card',
        newArm: 'The card under the next lesson',
        oldArm: 'No card',
        fallback: 'all',
        actions: {
            set_up: 'Set up tapped',
            apple: 'iPhone/Mac tapped',
            google: 'Google tapped',
            copied: 'link copied',
            reset: 'link reset',
        },
    },
    install_tip: {
        key: 'install_tip',
        label: 'Home-screen tip',
        newArm: 'The "add to your home screen" tip on phones',
        oldArm: 'No tip (the app icon still works for everyone)',
        fallback: 'all',
        actions: {
            shown: 'tip shown',
            install_tapped: 'Install tapped',
            dismissed: 'tip hidden',
            home_screen_visit: 'opened from the home screen',
        },
        passive: ['shown'],
    },
} satisfies Record<string, RolloutFeature>

export type RolloutKey = keyof typeof ROLLOUT_FEATURES
export const ROLLOUT_KEYS = Object.keys(ROLLOUT_FEATURES) as RolloutKey[]

export function isRolloutKey(v: unknown): v is RolloutKey {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ROLLOUT_FEATURES, v)
}

export function isRolloutStage(v: unknown): v is RolloutStage {
    return typeof v === 'string' && (ROLLOUT_STAGES as string[]).includes(v)
}

export function isRolloutAction(feature: RolloutKey, action: unknown): action is string {
    const actions: Record<string, string> = ROLLOUT_FEATURES[feature].actions
    return typeof action === 'string' && Object.prototype.hasOwnProperty.call(actions, action)
}

/** FNV-1a, 32 bit: tiny, stable across runtimes and releases. */
function fnv1a(s: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h >>> 0
}

/** The half a student falls in for one feature. Never changes for the same pair. */
export function halfArm(feature: string, studentId: string): RolloutArm {
    return fnv1a(`${feature}:${studentId.toLowerCase()}`) % 2 === 0 ? 'new' : 'old'
}

/** Which version a student sees at a stage. */
export function armFor(
    stage: RolloutStage,
    feature: string,
    studentId: string,
    { preview = false }: { preview?: boolean } = {},
): RolloutArm {
    if (preview) return 'new'
    if (stage === 'all') return 'new'
    if (stage === 'off') return 'old'
    if (studentId === TEST_STUDENT_ID) return 'new'
    if (stage === 'test') return 'old'
    return halfArm(feature, studentId)
}

export type RolloutStages = Record<RolloutKey, RolloutStage>

export function fallbackStages(): RolloutStages {
    return Object.fromEntries(ROLLOUT_KEYS.map(k => [k, ROLLOUT_FEATURES[k].fallback])) as RolloutStages
}

/** What the family portal gets: true = the new version. */
export type RolloutFlags = Record<RolloutKey, boolean>

export function flagsFor(stages: RolloutStages, studentId: string, opts: { preview?: boolean } = {}): RolloutFlags {
    return Object.fromEntries(
        ROLLOUT_KEYS.map(k => [k, armFor(stages[k], k, studentId, opts) === 'new']),
    ) as RolloutFlags
}

/** Everyone on the new version: for pages and tests that do not pass flags. */
export const ALL_NEW: RolloutFlags = Object.fromEntries(ROLLOUT_KEYS.map(k => [k, true])) as RolloutFlags

// ------------------------------------------------------------- server ---

type StageReader = {
    from: (table: string) => any
}

const CACHE_MS = 30_000
let cache: { at: number; stages: RolloutStages } | null = null

/** Forget the cached stages (after the Tests card changes one). */
export function clearRolloutCache(): void {
    cache = null
}

/**
 * Every feature's stage, cached 30 seconds. Never throws: a failed read gives
 * each feature its fallback stage (and is not cached, so the next call retries).
 */
export async function loadRolloutStages(client: StageReader, now = Date.now()): Promise<RolloutStages> {
    if (cache && now - cache.at < CACHE_MS) return cache.stages
    const stages = fallbackStages()
    try {
        const { data, error } = await client.from('portal_rollouts').select('feature, stage')
        if (error) throw new Error(error.message)
        for (const row of (data || []) as { feature: string; stage: string }[]) {
            if (isRolloutKey(row.feature) && isRolloutStage(row.stage)) stages[row.feature] = row.stage
        }
        cache = { at: now, stages }
    } catch (e) {
        console.error('[rollouts] stage read failed, using fallbacks:', e instanceof Error ? e.message : e)
    }
    return stages
}
