-- #1095: a small picture of each classroom recording on its row in the admin
-- Classroom recordings tab. The hourly classroom-thumbnails cron grabs one frame
-- with ffmpeg (lib/classroom-thumbnails.ts), stores a 320px JPEG in the studio's
-- private R2 bucket (studio-practice-videos, under classroom-thumbnails/) and
-- keeps its key here; the tab shows it through an hour-long signed link.
-- thumbnail_tries counts failed attempts; after 3 the recording is left alone.
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
alter table public.classroom_recordings add column if not exists thumbnail_key text;
alter table public.classroom_recordings add column if not exists thumbnail_tries smallint not null default 0;
