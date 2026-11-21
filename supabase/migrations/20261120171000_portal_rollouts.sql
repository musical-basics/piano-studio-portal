-- Protocol 1.20 ("start small and feel the way"): a big change to the family
-- portal goes to half the families first, old against new, and every test
-- and its result is written down. Applied to prod by hand on 2026-11-20
-- (migrations are not auto-run).
--
-- One row per family-facing feature (lib/rollouts.ts names them):
--   stage       off | test (test student only) | half | all
--   started_at  when the current stage began (the test period)
--   note        what is being compared, old against new
--   result      what the test showed, written by Lionel or the studio manager
-- The half is a stable hash of student id + feature, so a family always sees
-- the same version. Service key only: RLS on with no policies.
--
-- The four big family changes of 2026-11-20 went live to everyone the same
-- day; they start here on 'half'.

CREATE TABLE IF NOT EXISTS "public"."portal_rollouts" (
    "feature" text PRIMARY KEY CHECK ("feature" ~ '^[a-z][a-z0-9_]{1,40}$'),
    "stage" text NOT NULL DEFAULT 'off' CHECK ("stage" IN ('off', 'test', 'half', 'all')),
    "started_at" timestamptz NOT NULL DEFAULT "now"(),
    "note" text,
    "result" text,
    "result_at" timestamptz,
    "updated_at" timestamptz NOT NULL DEFAULT "now"()
);

ALTER TABLE "public"."portal_rollouts" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."portal_rollouts" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."portal_rollouts" IS
    'Protocol 1.20 rollouts of family portal features (lib/rollouts.ts): stage off/test/half/all, since when, and the written result. Service key only.';

INSERT INTO "public"."portal_rollouts" ("feature", "stage", "note") VALUES
    ('my_music', 'half', 'New: the My music tab (#1083), every piece sent, newest first. Old: the Downloads tab (Practice Materials list of assigned files).'),
    ('history_transcripts', 'half', 'New: transcript search box and the transcript under each lesson video in History (#1342). Old: History without transcripts.'),
    ('calendar_feed', 'half', 'New: the "Add to my calendar" card under the next lesson (#1082). Old: no card.'),
    ('install_tip', 'half', 'New: the "add the portal to your home screen" tip on phones (#1081). Old: no tip. The app icon and manifest stay for everyone.')
ON CONFLICT ("feature") DO NOTHING;
