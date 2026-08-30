-- Student portal upgrades: message editing, per-lesson homework, and a
-- student-controlled notification email.
--
-- 1. messages.edited_at
--    A user may edit a message they SENT. Like the soft delete, the write goes
--    through a core function on the service-role client (editMessageCore), which
--    verifies ownership server-side. No client-facing UPDATE policy on `content`
--    is opened, so a recipient still cannot rewrite someone else's message.
--
-- 2. lessons.homework
--    Homework used to live inside the free-text `notes` blob, so the student
--    portal had no way to surface "what am I supposed to practice this week".
--    Promoting it to its own column backs the Homework tab.
--
-- 3. profiles.notification_email
--    `profiles.email` is the login identity (it mirrors the auth user). Older
--    student accounts were created with a parent's address, so notifications go
--    to the parent even once the student is old enough to want their own inbox.
--    This is a delivery-only override: when set, outbound notifications go here
--    instead of `email`. Login is untouched.

ALTER TABLE "public"."messages"
    ADD COLUMN IF NOT EXISTS "edited_at" timestamptz;

COMMENT ON COLUMN "public"."messages"."edited_at" IS
    'Set when the sender edits the message content. NULL means never edited; the UI shows an "edited" marker when set.';

-- The chat poll is append-only (it only asks for messages newer than the newest
-- one loaded), so an edit to an OLDER message would never reach the other
-- participant's open tab. The poll reconciles against the recently-edited set,
-- and this partial index keeps that query cheap since edits are rare.
CREATE INDEX IF NOT EXISTS "idx_messages_edited_at"
    ON "public"."messages" ("edited_at")
    WHERE "edited_at" IS NOT NULL;

ALTER TABLE "public"."lessons"
    ADD COLUMN IF NOT EXISTS "homework" "text";

COMMENT ON COLUMN "public"."lessons"."homework" IS
    'What the student should practice before the next lesson. Shown in the student portal Homework tab, separate from the general lesson notes.';

ALTER TABLE "public"."profiles"
    ADD COLUMN IF NOT EXISTS "notification_email" "text";

COMMENT ON COLUMN "public"."profiles"."notification_email" IS
    'Delivery-only override for outbound notifications. NULL falls back to `email`. Does NOT change the login identity, which stays `email` / the auth user.';
