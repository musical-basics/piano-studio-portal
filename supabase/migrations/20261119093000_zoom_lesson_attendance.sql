-- #965: each Zoom lesson's attendance, kept in the portal for good. Zoom only
-- keeps its past-participants report for about a year, so after a lesson ends
-- the portal reads it (lib/zoom-attendance.ts) and saves it here: one row per
-- lesson, written by the backfill-recordings cron about 30 minutes after the
-- lesson ends (lib/core/zoom-lesson-attendance.ts), plus a one-time backfill of
-- 2026 (scripts/backfill_zoom_attendance.ts). #964 shows it on the lesson in admin.
--
-- status:
--   saved          Zoom answered; participants and the minutes below are set
--   never_started  Zoom says the meeting never ran (nobody opened it)
--   retrying       Zoom did not answer yet; tried again on the next runs
--   gave_up        still no answer after a few tries; left alone
--
-- kind: lib/zoom-attendance.ts classifyAttendance (student_joined, only_you,
-- host_absent, other_time), or later_use when Zoom only had a later use of the
-- same meeting link (reading older uses needs the Zoom permission
-- meeting:read:list_past_instances:admin; then backfill --redo=later_use).
--
-- participants: every join Zoom lists for the meeting, as Zoom gives it (name,
-- internal_user = Lionel's own account, status in_meeting / in_waiting_room,
-- join_time, leave_time, duration in seconds). Emails are not kept.
-- The seconds count joins within an hour of the lesson (as #797 does): teacher =
-- Lionel's account, student = everyone else (waiting room counts as there),
-- overlap = both in the meeting at once (waiting room not counted).
--
-- Deleting a lesson deletes its row. Service role only (RLS on, no policies).
--
-- Applied to prod by hand on 2026-11-19.

create table if not exists public.zoom_lesson_attendance (
    lesson_id uuid primary key references public.lessons(id) on delete cascade,
    zoom_meeting_id text not null,
    status text not null check (status in ('saved', 'never_started', 'retrying', 'gave_up')),
    kind text,
    participants jsonb not null default '[]'::jsonb,
    teacher_seconds integer,
    student_seconds integer,
    overlap_seconds integer,
    teacher_joined_at timestamptz,
    student_joined_at timestamptz,
    attempts integer not null default 0,
    last_error text,
    fetched_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists zoom_lesson_attendance_status_idx on public.zoom_lesson_attendance (status);

alter table public.zoom_lesson_attendance enable row level security;
