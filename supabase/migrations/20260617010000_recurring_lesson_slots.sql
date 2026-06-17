-- Additional recurring weekly lesson slots.
--
-- profiles.lesson_day / lesson_time / lesson_duration hold a student's SINGLE
-- primary recurring slot. This table adds support for EXTRA recurring days
-- (e.g. a student with both a Sunday and a Thursday lesson). The primary slot
-- stays in profiles (unchanged); this table is purely the additional days.
-- Scheduling (bulkScheduleLessons) reads the primary slot plus all rows here.

CREATE TABLE IF NOT EXISTS "public"."recurring_lesson_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "student_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "day_of_week" "text" NOT NULL,   -- 'Sunday'..'Saturday' (matches profiles.lesson_day)
    "time" "text" NOT NULL,          -- 'HH:MM' in the studio timezone
    "duration" integer NOT NULL DEFAULT 30,
    "created_at" timestamptz DEFAULT "now"() NOT NULL
);

CREATE INDEX IF NOT EXISTS "recurring_lesson_slots_student_idx"
    ON "public"."recurring_lesson_slots" ("student_id");

-- Students may read their own slots; all writes go through service-role server
-- actions (which bypass RLS).
ALTER TABLE "public"."recurring_lesson_slots" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students read own recurring slots" ON "public"."recurring_lesson_slots";
CREATE POLICY "students read own recurring slots"
    ON "public"."recurring_lesson_slots" FOR SELECT
    USING ("auth"."uid"() = "student_id");

COMMENT ON TABLE "public"."recurring_lesson_slots" IS
    'Additional recurring weekly lesson days for a student, beyond the primary slot in profiles.lesson_day/lesson_time/lesson_duration.';
