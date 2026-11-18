-- Classroom recordings copied into the student's Dropbox folder (Lionel's #726).
--
-- Each classroom recording (classroom_recordings, an mp4 on R2) is copied into
-- "/Lesson Recordings/<profiles.dropbox_recording_folder>/" next to the Zoom
-- videos, as "<YYYY-MM-DD> - Classroom Lesson.mp4". The files are 0.4 to 1.3 GB,
-- so the portal never downloads them: Dropbox fetches the public R2 URL itself
-- (files/save_url) and the classroom-recordings cron checks on the job.
--
-- One row per recording: unique on recording_id AND url, so a file is never
-- copied twice. status: pending (queued) -> running (Dropbox job started) ->
-- done (Dropbox size equals the R2 size) | failed (gave up, see error) |
-- skipped (too short to be a lesson). lib/classroom-dropbox-copies.ts.
--
-- Service-role only: RLS on, no policies.

CREATE TABLE IF NOT EXISTS "public"."classroom_recording_dropbox_copies" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "recording_id" uuid NOT NULL UNIQUE REFERENCES "public"."classroom_recordings"("id") ON DELETE CASCADE,
    "url" text NOT NULL UNIQUE,
    "student_id" text NOT NULL,
    "dropbox_path" text,
    "job_id" text,
    "status" text NOT NULL DEFAULT 'pending'
        CHECK ("status" IN ('pending', 'running', 'done', 'failed', 'skipped')),
    "size_bytes" bigint,
    "dropbox_size" bigint,
    "attempts" integer NOT NULL DEFAULT 0,
    "error" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "started_at" timestamptz,
    "finished_at" timestamptz,
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "classroom_recording_dropbox_copies_status_idx"
    ON "public"."classroom_recording_dropbox_copies" ("status");

ALTER TABLE "public"."classroom_recording_dropbox_copies" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."classroom_recording_dropbox_copies" IS
    'Copies of classroom recordings into the student''s Dropbox Lesson Recordings folder, done by Dropbox save_url. One row per recording.';
