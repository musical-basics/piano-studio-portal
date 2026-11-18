-- "I missed it" links (#752) are a third action on the unlogged-lessons email
-- buttons, recorded in the same single-use table.

ALTER TABLE "public"."lesson_action_link_uses"
    DROP CONSTRAINT IF EXISTS "lesson_action_link_uses_action_check";
ALTER TABLE "public"."lesson_action_link_uses"
    ADD CONSTRAINT "lesson_action_link_uses_action_check" CHECK ("action" IN ('log', 'remove', 'missed'));
