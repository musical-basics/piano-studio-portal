-- Cancellation audit log.
--
-- Cancelling a lesson DELETES its row from `lessons` (cancelLessonCore), which
-- means a cancellation leaves no trace: after the fact there is no way to answer
-- "did the student actually cancel, and when?". This bit us when a parent said
-- they cancelled on the portal and we had nothing to confirm it against.
--
-- This append-only log records every cancellation at the moment it happens, so
-- the lesson row can still be deleted (the rest of the app stays unchanged) while
-- the cancellation itself is permanently auditable.

CREATE TABLE IF NOT EXISTS "public"."cancellation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "student_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    -- The lesson that was cancelled. Kept for reference only; the lessons row is
    -- deleted, so this is NOT a foreign key.
    "lesson_id" "uuid",
    "lesson_date" "date" NOT NULL,     -- date the cancelled lesson was scheduled for
    "lesson_time" "text" NOT NULL,     -- 'HH:MM:SS' in the studio timezone
    "cancelled_by" "text" NOT NULL,    -- 'student' | 'admin' (the actor's role)
    "actor_id" "uuid",                 -- profile id of whoever performed the cancel
    "was_late" boolean NOT NULL DEFAULT false,   -- inside the 24h late-cancel window
    "fee_charged" numeric NOT NULL DEFAULT 0,    -- late-cancel fee applied, if any
    "cancelled_at" timestamptz DEFAULT "now"() NOT NULL
);

CREATE INDEX IF NOT EXISTS "cancellation_log_student_idx"
    ON "public"."cancellation_log" ("student_id", "cancelled_at" DESC);
CREATE INDEX IF NOT EXISTS "cancellation_log_cancelled_at_idx"
    ON "public"."cancellation_log" ("cancelled_at" DESC);

-- Service-role access only: writes and audit reads go through server actions that
-- bypass RLS. Students must not see the cancellation log. RLS on + no policies =
-- deny all.
ALTER TABLE "public"."cancellation_log" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."cancellation_log" IS
    'Append-only audit log of lesson cancellations, written by cancelLessonCore before the lesson row is deleted. Service-role access only.';
