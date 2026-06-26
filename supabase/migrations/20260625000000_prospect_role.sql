-- Prospective students.
--
-- A "prospect" is someone who submitted a website request and was approved by
-- the teacher for an audition, but is not yet an enrolled student. They get a
-- real auth account so they can log in, but a restricted dashboard: setup PDFs,
-- their audition meeting time(s), and chat with the teacher. No recordings,
-- library, credits, or lessons.
--
-- The only schema change needed is widening the role check; auditions reuse the
-- existing events/event_invites system and chat reuses messages, both of which
-- are keyed on auth.uid() rather than role, so existing RLS already applies.

ALTER TABLE "public"."profiles"
    DROP CONSTRAINT IF EXISTS "profiles_role_check";

ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_role_check"
    CHECK (("role" = ANY (ARRAY['student'::"text", 'admin'::"text", 'prospect'::"text"])));
