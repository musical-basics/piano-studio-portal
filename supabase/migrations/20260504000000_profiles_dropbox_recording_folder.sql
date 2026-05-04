-- Maps each student to the existing Dropbox folder under /Lesson Recordings/
-- where their recordings live. Folder names are inconsistent (e.g. "Daniel
-- Recordings", "Yakir Shimon Lesson Recordings", "Mohammed Habbab"), so we
-- store the exact folder name per student rather than computing it.
ALTER TABLE "public"."profiles"
    ADD COLUMN IF NOT EXISTS "dropbox_recording_folder" "text";

COMMENT ON COLUMN "public"."profiles"."dropbox_recording_folder" IS
    'Name of this student''s folder under /Lesson Recordings/ in Dropbox. NULL means recordings are not auto-routed for this profile.';
