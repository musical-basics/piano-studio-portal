-- #876: each family agrees once that lessons may be recorded for their own
-- review. The student portal shows a one-time notice with a tick box until this
-- is set (components/student/recording-consent-dialog.tsx); it is written only
-- by the agreeRecordingConsent server action (service role), never by an admin
-- previewing a student. Null = not asked or not agreed yet.
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).
alter table public.profiles add column if not exists recording_consent_at timestamptz;
