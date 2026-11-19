-- #952: when a classroom video's copy to Dropbox gives up (status 'failed'),
-- email the studio inbox once (lib/classroom-dropbox-copies.ts). alerted_at is
-- set when that email is claimed, so a row is never emailed twice.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).

ALTER TABLE "public"."classroom_recording_dropbox_copies"
    ADD COLUMN IF NOT EXISTS "alerted_at" timestamptz;

-- Copies that had already failed before this were seen in the cron output, not
-- emailed now (there were none on 2026-11-19).
UPDATE "public"."classroom_recording_dropbox_copies"
    SET "alerted_at" = COALESCE("finished_at", "now"())
    WHERE "status" = 'failed' AND "alerted_at" IS NULL;

COMMENT ON COLUMN "public"."classroom_recording_dropbox_copies"."alerted_at" IS
    'When the studio was emailed that this copy gave up (#952). Set once; NULL means not emailed.';
