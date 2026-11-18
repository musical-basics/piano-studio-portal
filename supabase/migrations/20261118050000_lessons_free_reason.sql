-- "Free lesson" when logging (#756): a lesson logged without taking a credit.
--
-- NULL is an ordinary lesson. Any text, even '', means it was logged free; the
-- text is Lionel's optional reason ('' when he gave none). A free lesson is
-- status 'completed' with credit_snapshot_before = credit_snapshot = the
-- balance at the time, and no credit_transactions row (nothing changed). The
-- monthly credit check leaves these alone; the family's Lesson history shows
-- them as Free.

ALTER TABLE "public"."lessons" ADD COLUMN IF NOT EXISTS "free_reason" "text";

COMMENT ON COLUMN "public"."lessons"."free_reason" IS
    'Set when the lesson was logged free (no credit taken): the optional reason, '''' when none. NULL for ordinary lessons.';
