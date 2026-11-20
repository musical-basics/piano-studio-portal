-- #1104: one row per lesson the "waiting alone in the classroom" email went
-- out for (lib/classroom-alone-alert.ts, cron /api/cron/classroom-alone every
-- minute). The cron claims the lesson here before sending, so its two
-- triggers never email twice, and deletes the row again if the email fails.
-- No foreign key to lessons on purpose: a cancelled lesson's row is deleted.
-- Service role only (RLS on, no policies).
-- Applied to prod by hand on 2026-11-20 (migrations are not auto-run).
create table if not exists public.classroom_alone_alerts (
    lesson_id uuid primary key,
    student_id uuid not null references public.profiles(id) on delete cascade,
    -- when the student's stay in the room began
    joined_at timestamptz not null,
    -- the later of that and the lesson's start: the wait counted from here
    alone_since timestamptz not null,
    created_at timestamptz not null default now()
);
create index if not exists classroom_alone_alerts_created_at_idx on public.classroom_alone_alerts (created_at desc);
alter table public.classroom_alone_alerts enable row level security;
