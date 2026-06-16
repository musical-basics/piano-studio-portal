-- The new-recordings notification cron (app/api/cron/new-recordings) reads and
-- writes profiles.last_recording_notified_at to track which Dropbox recordings
-- a student has already been emailed about, but the column was never created.
-- As a result that cron errored on every run and no "new recording" emails were
-- ever sent. Add the column so the notifier works.
ALTER TABLE "public"."profiles"
    ADD COLUMN IF NOT EXISTS "last_recording_notified_at" timestamptz;

COMMENT ON COLUMN "public"."profiles"."last_recording_notified_at" IS
    'Timestamp of the most recent recording-available email sent to this student. The new-recordings cron only notifies about Dropbox files modified after this time. NULL means never notified.';
