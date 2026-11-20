-- #1346: a family can add a short note when it asks to move a lesson
-- ("soccer game", "travelling"). Shown to Lionel next to Approve and Decline
-- (admin Today tab, the instant email and the 8:30am email).
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
--
-- Additive only. Written by the family's server action (service key), which
-- trims it and keeps it to 200 characters; the check is a backstop.

ALTER TABLE "public"."lesson_move_requests"
    ADD COLUMN IF NOT EXISTS "note" "text";

ALTER TABLE "public"."lesson_move_requests"
    DROP CONSTRAINT IF EXISTS "lesson_move_requests_note_length";
ALTER TABLE "public"."lesson_move_requests"
    ADD CONSTRAINT "lesson_move_requests_note_length" CHECK ("note" IS NULL OR char_length("note") <= 200);

COMMENT ON COLUMN "public"."lesson_move_requests"."note" IS
    'The family''s optional short note with the request (#1346), at most 200 characters.';
