-- #1020: classroom videos older than 60 days move from Cloudflare R2 to their
-- copy in the student's Dropbox folder (lib/classroom-r2-move.ts), so R2 stays
-- under its 10 GB free tier. The row's url (and the lesson's video_url) then
-- point at the Dropbox share link, and the R2 file is deleted.
--
-- r2_key keeps the file's original name in the recordings bucket
-- ("<student>_<13-digit start ms>.mp4"): it carries the recording's start time
-- (lesson matching, length) and is the key the lesson's markers are stored
-- under (classroom_recording_markers.recording_key), so both keep working
-- after the url changes. moved_to_dropbox_at says when the move happened.
-- Rows still in R2 leave both empty (their key is the url's last part).
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
alter table public.classroom_recordings add column if not exists r2_key text;
alter table public.classroom_recordings add column if not exists moved_to_dropbox_at timestamptz;
create index if not exists classroom_recordings_r2_key_idx on public.classroom_recordings (r2_key) where r2_key is not null;
