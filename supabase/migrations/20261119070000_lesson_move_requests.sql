-- #878: families can ask to move one lesson from their portal. They pick one of
-- Lionel's free slots in that lesson's week; nothing moves until he approves
-- (admin Today tab, or the Approve button in the 8:30am email). Approve runs the
-- usual reschedule (rescheduleLessonCore: Zoom, calendar, the usual "Lesson
-- Rescheduled" email). Decline sends nothing; the family sees in the portal that
-- the lesson stays at its time. See lib/core/move-requests.ts.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).
--
-- Families only read their own rows here. Every write goes through a server
-- action with the service key, which checks the signed-in family owns the
-- lesson (an admin previewing a student cannot file one as them).

CREATE TABLE IF NOT EXISTS "public"."lesson_move_requests" (
    "id" "uuid" PRIMARY KEY DEFAULT "gen_random_uuid"(),
    -- A lesson that is cancelled or removed takes its requests with it.
    "lesson_id" "uuid" NOT NULL REFERENCES "public"."lessons"("id") ON DELETE CASCADE,
    "student_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    -- The lesson's slot when they asked (studio wall clock), so a lesson moved
    -- some other way since then is noticed.
    "from_date" "date" NOT NULL,
    "from_time" time without time zone NOT NULL,
    -- The free slot they picked (studio wall clock).
    "to_date" "date" NOT NULL,
    "to_time" time without time zone NOT NULL,
    "duration" integer NOT NULL DEFAULT 60,
    "status" "text" NOT NULL DEFAULT 'pending'
        CHECK ("status" IN ('pending', 'approved', 'declined', 'expired', 'withdrawn')),
    -- Why it ended: 'moved', 'declined', 'slot_taken', 'slot_passed',
    -- 'lesson_passed', 'lesson_changed', 'withdrawn' (plus any detail).
    "outcome" "text",
    -- 'admin' (Today tab) or 'email' (morning email button) for approve/decline.
    "decided_via" "text",
    "decided_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT "now"()
);

-- One pending request per lesson.
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_move_requests_one_pending"
    ON "public"."lesson_move_requests" ("lesson_id") WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "lesson_move_requests_student_idx"
    ON "public"."lesson_move_requests" ("student_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "lesson_move_requests_status_idx"
    ON "public"."lesson_move_requests" ("status");

ALTER TABLE "public"."lesson_move_requests" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all lesson move requests" ON "public"."lesson_move_requests";
CREATE POLICY "Admins can read all lesson move requests"
    ON "public"."lesson_move_requests"
    FOR SELECT
    USING ("public"."is_admin"());

DROP POLICY IF EXISTS "Students can view own lesson move requests" ON "public"."lesson_move_requests";
CREATE POLICY "Students can view own lesson move requests"
    ON "public"."lesson_move_requests"
    FOR SELECT
    USING ("auth"."uid"() = "student_id");

COMMENT ON TABLE "public"."lesson_move_requests" IS
    'A family asking to move one lesson to a free slot that week (#878). Pending until Lionel approves (usual reschedule) or declines (nothing sent). Families read their own; writes go through server actions with the service key.';

-- The morning email's Approve / Decline buttons record their single use in
-- lesson_action_link_uses like the other one-time buttons.
ALTER TABLE "public"."lesson_action_link_uses"
    DROP CONSTRAINT IF EXISTS "lesson_action_link_uses_action_check";
ALTER TABLE "public"."lesson_action_link_uses"
    ADD CONSTRAINT "lesson_action_link_uses_action_check"
    CHECK ("action" IN ('log', 'remove', 'missed', 'noshow', 'approve_move', 'decline_move'));
