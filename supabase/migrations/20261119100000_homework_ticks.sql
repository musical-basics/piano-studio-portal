-- #945: homework as a checklist the family ticks off during the week, and
-- Lionel sees what is ticked before the next lesson. A row is one ticked item
-- of one lesson's homework (lessons.homework split by line, lib/homework.ts);
-- unticking deletes it. item_text is the item as it read when ticked, so a
-- tick doesn't carry over to a different item if the homework is edited.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).
--
-- Families only read their own rows here. Every write goes through a server
-- action with the service key, which checks the signed-in family owns the
-- lesson (an admin previewing a student cannot tick for them).

CREATE TABLE IF NOT EXISTS "public"."homework_ticks" (
    "lesson_id" "uuid" NOT NULL REFERENCES "public"."lessons"("id") ON DELETE CASCADE,
    "student_id" "uuid" NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    "item_index" integer NOT NULL CHECK ("item_index" >= 0),
    "item_text" "text" NOT NULL,
    "ticked_at" timestamptz NOT NULL DEFAULT "now"(),
    PRIMARY KEY ("lesson_id", "item_index")
);

CREATE INDEX IF NOT EXISTS "homework_ticks_student_idx" ON "public"."homework_ticks" ("student_id");

ALTER TABLE "public"."homework_ticks" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all homework ticks" ON "public"."homework_ticks";
CREATE POLICY "Admins can read all homework ticks"
    ON "public"."homework_ticks"
    FOR SELECT
    USING ("public"."is_admin"());

DROP POLICY IF EXISTS "Students can view own homework ticks" ON "public"."homework_ticks";
CREATE POLICY "Students can view own homework ticks"
    ON "public"."homework_ticks"
    FOR SELECT
    USING ("auth"."uid"() = "student_id");

COMMENT ON TABLE "public"."homework_ticks" IS
    'Homework items a family ticked off (#945): one row per lesson and item. Families read their own; writes go through a server action with the service key.';
