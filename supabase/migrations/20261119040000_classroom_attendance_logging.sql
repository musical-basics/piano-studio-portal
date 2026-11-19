-- #795: classroom lessons can be logged by attendance (Lionel and the student in
-- the classroom together 20+ minutes), not only by a 20+ minute classroom video.
-- The classroom writes who was in each room into classroom_attendance (created
-- by the classroom repo's migration 20261119_classroom_attendance.sql); the
-- portal logs from it (lib/classroom-attendance.ts).
-- Applied to prod by hand on 2026-11-19 (migrations are not auto-run).

-- 1. Its own completed_source, so the morning email, the weekly summary and
--    the ledger say "logged by attendance".
alter table public.lessons drop constraint if exists lessons_completed_source_check;
alter table public.lessons add constraint lessons_completed_source_check
  check (completed_source in ('agent_log', 'zoom_webhook', 'admin_ui', 'system', 'classroom_attendance'));

-- 2. One automatic log per lesson, whichever of the video or attendance gets
--    there first (lib/classroom-auto-log.ts claims the lesson here before
--    logging; a failed log deletes its claim). Service role only.
create table if not exists public.lesson_auto_logs (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  source text not null check (source in ('classroom_video', 'classroom_attendance')),
  minutes integer,
  created_at timestamptz not null default now()
);
alter table public.lesson_auto_logs enable row level security;
