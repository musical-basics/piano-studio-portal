-- Protocol 1.20: family bulk emails go out small first. Applied to prod by
-- hand on 2026-11-20 (migrations are not auto-run).
--
-- Every bulk send to families (monthly statements, announcements, recital
-- emails) first emails a preview copy to the studio inbox, then sends to a
-- first batch of 3 families. The rest go 24 hours later, and only if Resend
-- reports those 3 delivered with no bounce or complaint; otherwise the send
-- stops and the studio inbox is told why. "Send the rest now" on the Tests
-- card (/admin/jobs) sends them early. One row per bulk send, which is also
-- its record on the Tests card (lib/staged-send.ts):
--   items    one entry per recipient: key, address, batch (first/rest),
--            status, Resend id, Resend's last event; for announcements and
--            recital emails also the email itself, so the rest can be sent
--            later exactly as reviewed (statements are rebuilt when sent)
--   context  what the kind needs to finish the send (a recital's event id)
-- (kind, ref) is unique, so the same month's statements or the same
-- announcement can never be staged twice. Service key only: RLS on, no policies.

CREATE TABLE IF NOT EXISTS "public"."staged_sends" (
    "id" uuid PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "kind" text NOT NULL CHECK ("kind" IN ('monthly_statement', 'announcement', 'recital')),
    "ref" text NOT NULL,
    "label" text NOT NULL,
    "status" text NOT NULL DEFAULT 'first_batch'
        CHECK ("status" IN ('first_batch', 'waiting', 'sending_rest', 'done', 'stopped')),
    "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "preview_sent_at" timestamptz,
    "first_sent_at" timestamptz,
    "rest_due_at" timestamptz,
    "rest_sent_at" timestamptz,
    "rest_sent_by" text CHECK ("rest_sent_by" IN ('schedule', 'hand')),
    "checked_at" timestamptz,
    "rest_checked_at" timestamptz,
    "stop_reason" text,
    "result" text,
    "result_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT "now"(),
    "updated_at" timestamptz NOT NULL DEFAULT "now"(),
    UNIQUE ("kind", "ref")
);

CREATE INDEX IF NOT EXISTS "staged_sends_status_due_idx" ON "public"."staged_sends" ("status", "rest_due_at");
CREATE INDEX IF NOT EXISTS "staged_sends_created_idx" ON "public"."staged_sends" ("created_at" DESC);

ALTER TABLE "public"."staged_sends" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."staged_sends" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."staged_sends" IS
    'Protocol 1.20 staged family bulk emails: preview to the studio inbox, first 3 families, the rest after 24h if delivered. Service key only.';
