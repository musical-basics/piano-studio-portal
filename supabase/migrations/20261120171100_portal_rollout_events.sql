-- Protocol 1.20: how families use the features on a rollout (portal_rollouts),
-- for the Tests card on /admin/jobs. Applied to prod by hand on 2026-11-20
-- (migrations are not auto-run).
--
-- One row per family action on a rolled-out feature (tab opened, piece
-- downloaded, transcript searched, calendar link copied, ...), with the
-- version (arm) the family was in when it happened. Written only by the
-- portal's server action with the service key, for the signed-in family
-- itself (never for an admin preview). Service key only: RLS on, no policies.

CREATE TABLE IF NOT EXISTS "public"."portal_rollout_events" (
    "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "feature" text NOT NULL,
    "student_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "arm" text NOT NULL CHECK ("arm" IN ('new', 'old')),
    "action" text NOT NULL CHECK (char_length("action") BETWEEN 1 AND 40),
    "created_at" timestamptz NOT NULL DEFAULT "now"()
);

CREATE INDEX IF NOT EXISTS "portal_rollout_events_feature_created_idx"
    ON "public"."portal_rollout_events" ("feature", "created_at" DESC);

ALTER TABLE "public"."portal_rollout_events" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."portal_rollout_events" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."portal_rollout_events" IS
    'Protocol 1.20: family actions on rolled-out portal features, with the arm (new/old) they were in. Service key only.';
