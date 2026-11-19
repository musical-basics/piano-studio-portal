-- The morning email's "No-Show" button (#797) records its single use here too.
ALTER TABLE "public"."lesson_action_link_uses"
    DROP CONSTRAINT IF EXISTS "lesson_action_link_uses_action_check";
ALTER TABLE "public"."lesson_action_link_uses"
    ADD CONSTRAINT "lesson_action_link_uses_action_check" CHECK ("action" IN ('log', 'remove', 'missed', 'noshow'));
