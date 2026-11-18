-- One-time "Log it" / "Didn't happen" links in the unlogged-lessons email (#441).
--
-- Each link carries a random token id. The POST that acts on a link inserts that
-- id here first; the primary key refuses a second insert, so a link works once
-- even if it is tapped twice at the same moment. The row also keeps what the
-- link did, which matters for "Didn't happen": it deletes the lessons row, and
-- this is the only record left of it (lesson_id has no foreign key for that
-- reason).
--
-- Service-role only: RLS on with no policies, like credit_transactions and
-- cancellation_log.

CREATE TABLE IF NOT EXISTS "public"."lesson_action_link_uses" (
    "token_id" "text" PRIMARY KEY,
    "lesson_id" "uuid" NOT NULL,
    "action" "text" NOT NULL CHECK ("action" IN ('log', 'remove')),
    "student_id" "uuid",
    "lesson_date" "date",
    "lesson_time" time without time zone,
    "outcome" "text",
    "used_at" timestamptz DEFAULT "now"() NOT NULL
);

CREATE INDEX IF NOT EXISTS "lesson_action_link_uses_lesson_idx"
    ON "public"."lesson_action_link_uses" ("lesson_id");

ALTER TABLE "public"."lesson_action_link_uses" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."lesson_action_link_uses" IS
    'Used one-time links from the unlogged-lessons email (Log it / Didn''t happen). A row means the link was used; outcome says what it did. Service-role only.';
